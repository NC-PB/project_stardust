//! Watching the planning root and the config (`S-watcher`).
//!
//! Raw `notify` events only say which paths were touched; they differ between platforms and
//! a move can arrive as a rename pair, as two unrelated events, or not at all. So events are
//! collected until the disk is quiet, then the touched paths are compared with the files known
//! before: a file that disappeared and one that appeared with the same task id are a move.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use specta::Type;
use walkdir::WalkDir;

use super::config::{CONFIG_PATH, Config};
use super::ids;
use super::links::Move;

/// A batch is sent once no event arrived for this long.
const QUIET: Duration = Duration::from_millis(150);
/// A batch is sent at the latest this long after its first event, even if events keep coming.
const MAX_WAIT: Duration = Duration::from_secs(1);

/// One change under the planning root. Paths are relative to the repository root, with `/`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum FileChange {
    Created {
        path: String,
    },
    Modified {
        path: String,
    },
    Removed {
        path: String,
    },
    /// A task file that changed folder or name, recognised by the id in its filename.
    Moved {
        id: String,
        from: String,
        to: String,
    },
}

/// Everything that changed during one burst of events.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ChangeBatch {
    pub changes: Vec<FileChange>,
    /// Whether `docs/planner.yml` was created, changed or removed.
    pub config_changed: bool,
}

impl ChangeBatch {
    pub fn is_empty(&self) -> bool {
        self.changes.is_empty() && !self.config_changed
    }

    /// The moved files of the batch, for rewriting the links to and in them (`S-links`): the
    /// moved tasks, and a file without an id that was removed in one folder and created in
    /// another under the same name, when that name is removed and created once each.
    pub fn moves(&self) -> Vec<Move> {
        let mut moves: Vec<Move> = Vec::new();
        let mut removed: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        let mut created: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        for change in &self.changes {
            match change {
                FileChange::Moved { from, to, .. } => moves.push(Move {
                    from: from.clone(),
                    to: to.clone(),
                }),
                FileChange::Removed { path } => removed
                    .entry(path.rsplit('/').next().unwrap_or(path))
                    .or_default()
                    .push(path),
                FileChange::Created { path } => created
                    .entry(path.rsplit('/').next().unwrap_or(path))
                    .or_default()
                    .push(path),
                FileChange::Modified { .. } => {}
            }
        }
        for (file, from) in &removed {
            if let ([from], Some([to])) = (from.as_slice(), created.get(file).map(Vec::as_slice)) {
                moves.push(Move {
                    from: from.to_string(),
                    to: to.to_string(),
                });
            }
        }
        moves
    }
}

/// Counts the opens and closes of a project, so work started for an open that a later open or
/// a close superseded can be dropped (`S-watcher`).
#[derive(Debug, Default)]
pub struct Generations(AtomicU64);

impl Generations {
    /// Starts a new generation and returns it; every earlier one is no longer current.
    pub fn next(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Whether no later generation was started since `generation`.
    pub fn is_current(&self, generation: u64) -> bool {
        self.0.load(Ordering::SeqCst) == generation
    }
}

/// The generations of every project the app has opened, by repository root (`S-multi-project`):
/// opening or closing one project never supersedes an open of another.
#[derive(Debug, Default)]
pub struct ProjectGenerations(Mutex<HashMap<String, Arc<Generations>>>);

impl ProjectGenerations {
    /// The generations of the project at `repo_root`, created on first use. Kept after a
    /// close, so an open the close superseded stays superseded.
    pub fn of(&self, repo_root: &str) -> Arc<Generations> {
        let mut projects = self.0.lock().unwrap_or_else(|err| err.into_inner());
        Arc::clone(projects.entry(repo_root.to_string()).or_default())
    }
}

/// Files the watcher has seen, as absolute paths.
pub type Known = BTreeSet<PathBuf>;

/// Every file under `dir` the watcher reports on.
pub fn scan(dir: &Path) -> Known {
    WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_watched(entry.path()))
        .map(|entry| entry.into_path())
        .collect()
}

/// Hidden files and editor backups (`.foo.swp`, `foo.md~`, `.DS_Store`) are not reported.
fn is_watched(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| !name.starts_with('.') && !name.ends_with('~'))
}

/// The changes for paths `touched` in one burst, given the files `known` before it and the
/// files `present` now at or under the touched paths. Updates `known`. A touched folder
/// covers the files under it, so moving a whole folder reports each file.
pub fn diff(touched: &BTreeSet<PathBuf>, known: &mut Known, present: &Known) -> Vec<FileChange> {
    let under = |path: &PathBuf| touched.iter().any(|t| path.starts_with(t));
    let before: Known = known.iter().filter(|p| under(p)).cloned().collect();

    let mut created: Vec<&PathBuf> = present.difference(&before).collect();
    let mut removed: Vec<&PathBuf> = before.difference(present).collect();
    let modified = present
        .intersection(&before)
        .filter(|path| touched.contains(*path));

    let mut moves = Vec::new();
    let mut removed_by_id: BTreeMap<String, &PathBuf> = BTreeMap::new();
    for path in &removed {
        if let Some(id) = task_id(path) {
            removed_by_id.entry(id).or_insert(path);
        }
    }
    created.retain(|path| {
        let Some(id) = task_id(path) else { return true };
        let Some(from) = removed_by_id.remove(&id) else {
            return true;
        };
        moves.push((id, from.clone(), (*path).clone()));
        false
    });
    removed.retain(|path| !moves.iter().any(|(_, from, _)| from == *path));

    let mut changes = Vec::new();
    changes.extend(created.iter().map(|path| FileChange::Created {
        path: display(path),
    }));
    changes.extend(modified.map(|path| FileChange::Modified {
        path: display(path),
    }));
    changes.extend(removed.iter().map(|path| FileChange::Removed {
        path: display(path),
    }));
    changes.extend(moves.iter().map(|(id, from, to)| FileChange::Moved {
        id: id.clone(),
        from: display(from),
        to: display(to),
    }));

    known.retain(|path| !under(path));
    known.extend(present.iter().cloned());
    changes
}

fn task_id(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    Some(ids::parse_task_filename(name)?.id)
}

fn display(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Watches the planning root and the config of one repository until dropped.
pub struct PlanningWatcher {
    _watcher: notify::RecommendedWatcher,
}

/// Starts watching `repo_root`. `on_batch` runs on a background thread once per burst of
/// changes, with paths relative to the repository root.
pub fn watch(
    repo_root: &Path,
    config: &Config,
    on_batch: impl Fn(ChangeBatch) + Send + 'static,
) -> Result<PlanningWatcher, String> {
    let repo_root = repo_root
        .canonicalize()
        .map_err(|err| format!("{}: {err}", repo_root.display()))?;
    let planning_root = repo_root.join(&config.planning_root);
    if !planning_root.is_dir() {
        return Err(format!("{} is not a folder", config.planning_root));
    }
    let config_path = repo_root.join(CONFIG_PATH);
    let config_dir = config_path
        .parent()
        .expect("CONFIG_PATH has a folder")
        .to_path_buf();

    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(sender).map_err(|err| err.to_string())?;
    watcher
        .watch(&planning_root, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    // The folder, not the file: editors replace the file when they save it.
    if config_dir.is_dir() {
        watcher
            .watch(&config_dir, RecursiveMode::NonRecursive)
            .map_err(|err| err.to_string())?;
    }

    let mut known = scan(&planning_root);
    std::thread::spawn(move || {
        let mut touched = BTreeSet::new();
        let mut config_changed = false;
        let mut first: Option<Instant> = None;
        loop {
            let timeout = match first {
                Some(start) => QUIET.min(MAX_WAIT.saturating_sub(start.elapsed())),
                None => Duration::from_secs(3600),
            };
            match receiver.recv_timeout(timeout) {
                Ok(Ok(event)) => {
                    for path in event.paths {
                        if path == config_path {
                            config_changed = true;
                        } else if path.starts_with(&planning_root) {
                            touched.insert(path);
                        } else {
                            continue;
                        }
                        first.get_or_insert_with(Instant::now);
                    }
                    if first.is_none_or(|start| start.elapsed() < MAX_WAIT) {
                        continue;
                    }
                }
                Ok(Err(_)) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                // The watcher was dropped.
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
            if first.is_none() {
                continue;
            }
            let present: Known = touched.iter().flat_map(|path| scan(path)).collect();
            let changes = diff(&touched, &mut known, &present)
                .into_iter()
                .map(|change| relative(change, &repo_root))
                .collect();
            let batch = ChangeBatch {
                changes,
                config_changed,
            };
            touched.clear();
            config_changed = false;
            first = None;
            if !batch.is_empty() {
                on_batch(batch);
            }
        }
    });
    Ok(PlanningWatcher { _watcher: watcher })
}

fn relative(change: FileChange, repo_root: &Path) -> FileChange {
    let rel = |path: String| {
        Path::new(&path)
            .strip_prefix(repo_root)
            .map(display)
            .unwrap_or(path)
    };
    match change {
        FileChange::Created { path } => FileChange::Created { path: rel(path) },
        FileChange::Modified { path } => FileChange::Modified { path: rel(path) },
        FileChange::Removed { path } => FileChange::Removed { path: rel(path) },
        FileChange::Moved { id, from, to } => FileChange::Moved {
            id,
            from: rel(from),
            to: rel(to),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "/p/next/20261030-220001-aaaa-one.md";
    const A_DONE: &str = "/p/done/20261030-220001-aaaa-one.md";
    const B: &str = "/p/next/20261030-220002-bbbb-two.md";

    fn set(paths: &[&str]) -> Known {
        paths.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn only_the_latest_generation_is_current() {
        let opens = Generations::default();
        let first = opens.next();
        assert!(opens.is_current(first));
        let second = opens.next();
        assert!(!opens.is_current(first));
        assert!(opens.is_current(second));
        // A close is a generation of its own.
        opens.next();
        assert!(!opens.is_current(second));
    }

    #[test]
    fn projects_count_their_generations_apart() {
        let projects = ProjectGenerations::default();
        let a = projects.of("/a").next();
        let b = projects.of("/b").next();
        // Opening /b does not supersede the open of /a.
        assert!(projects.of("/a").is_current(a));
        assert!(projects.of("/b").is_current(b));
        // A close of /a supersedes only /a.
        projects.of("/a").next();
        assert!(!projects.of("/a").is_current(a));
        assert!(projects.of("/b").is_current(b));
    }

    #[test]
    fn create_modify_and_delete() {
        let mut known = set(&[A, B]);
        let changes = diff(
            &set(&[A, B, "/p/inbox/note.md"]),
            &mut known,
            &set(&[A, "/p/inbox/note.md"]),
        );
        assert_eq!(
            changes,
            [
                FileChange::Created {
                    path: "/p/inbox/note.md".into()
                },
                FileChange::Modified { path: A.into() },
                FileChange::Removed { path: B.into() },
            ]
        );
        assert_eq!(known, set(&[A, "/p/inbox/note.md"]));
    }

    #[test]
    fn a_task_moved_between_columns_is_one_move() {
        let mut known = set(&[A, B]);
        let changes = diff(&set(&[A, A_DONE]), &mut known, &set(&[A_DONE]));
        assert_eq!(
            changes,
            [FileChange::Moved {
                id: "20261030-220001-aaaa".into(),
                from: A.into(),
                to: A_DONE.into(),
            }]
        );
        assert_eq!(known, set(&[A_DONE, B]));
        let batch = ChangeBatch {
            changes,
            config_changed: false,
        };
        assert_eq!(
            batch.moves(),
            [Move {
                from: A.into(),
                to: A_DONE.into()
            }]
        );
    }

    #[test]
    fn files_without_id_count_as_moved_for_links_when_their_name_is_unique() {
        let removed = |path: &str| FileChange::Removed { path: path.into() };
        let created = |path: &str| FileChange::Created { path: path.into() };
        let batch = ChangeBatch {
            changes: vec![
                created("p/notes/braindump.md"),
                created("p/a/x.md"),
                created("p/b/x.md"),
                created("p/new.md"),
                removed("p/braindump.md"),
                removed("p/c/x.md"),
                removed("p/old.md"),
            ],
            config_changed: false,
        };
        assert_eq!(
            batch.moves(),
            [Move {
                from: "p/braindump.md".into(),
                to: "p/notes/braindump.md".into()
            }]
        );
    }

    #[test]
    fn a_renamed_task_is_a_move_and_files_without_id_are_not() {
        let renamed = "/p/next/20261030-220001-aaaa-new-title.md";
        let mut known = set(&[A, "/p/next/plain.md"]);
        let changes = diff(
            &set(&[A, renamed, "/p/next/plain.md", "/p/done/plain.md"]),
            &mut known,
            &set(&[renamed, "/p/done/plain.md"]),
        );
        assert_eq!(
            changes,
            [
                FileChange::Created {
                    path: "/p/done/plain.md".into()
                },
                FileChange::Removed {
                    path: "/p/next/plain.md".into()
                },
                FileChange::Moved {
                    id: "20261030-220001-aaaa".into(),
                    from: A.into(),
                    to: renamed.into(),
                },
            ]
        );
    }

    #[test]
    fn a_touched_folder_covers_its_files() {
        let mut known = set(&[A, B]);
        let changes = diff(
            &set(&["/p/next", "/p/later"]),
            &mut known,
            &set(&[
                "/p/later/20261030-220001-aaaa-one.md",
                "/p/later/20261030-220002-bbbb-two.md",
            ]),
        );
        assert_eq!(changes.len(), 2);
        assert!(
            changes
                .iter()
                .all(|change| matches!(change, FileChange::Moved { .. }))
        );
    }

    #[test]
    fn untouched_and_transient_files_are_not_reported() {
        let mut known = set(&[A, B]);
        let changes = diff(&set(&["/p/next/tmp.md"]), &mut known, &set(&[]));
        assert_eq!(changes, []);
        assert_eq!(known, set(&[A, B]));
    }

    #[test]
    fn hidden_and_backup_files_are_ignored() {
        assert!(is_watched(Path::new("/p/next/a.md")));
        assert!(!is_watched(Path::new("/p/next/.a.md.swp")));
        assert!(!is_watched(Path::new("/p/next/a.md~")));
        assert!(!is_watched(Path::new("/p/.DS_Store")));
    }

    /// Waits for the next batch; the real watcher needs a moment on every platform.
    fn next_batch(receiver: &mpsc::Receiver<ChangeBatch>) -> ChangeBatch {
        receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("no batch from the watcher")
    }

    /// Lets the watcher settle so the next step is its own batch.
    fn settle() {
        std::thread::sleep(Duration::from_millis(600));
    }

    #[test]
    fn the_watcher_reports_changes_on_disk() {
        let root = std::env::temp_dir().join(format!("stardust-watch-{}", ids::random_suffix()));
        for column in ["inbox", "next", "done"] {
            std::fs::create_dir_all(root.join("docs/planning").join(column)).unwrap();
        }
        let task = "docs/planning/next/20261030-220001-aaaa-one.md";
        let done = "docs/planning/done/20261030-220001-aaaa-one.md";
        std::fs::write(root.join(task), "one").unwrap();

        let (sender, receiver) = mpsc::channel();
        let watcher = watch(&root, &Config::default(), move |batch| {
            sender.send(batch).unwrap();
        })
        .unwrap();
        settle();

        let new = "docs/planning/inbox/new.md";
        std::fs::write(root.join(new), "new").unwrap();
        let created = next_batch(&receiver);
        settle();

        std::fs::write(root.join(task), "changed").unwrap();
        let modified = next_batch(&receiver);
        settle();

        std::fs::rename(root.join(task), root.join(done)).unwrap();
        let moved = next_batch(&receiver);
        settle();

        std::fs::remove_file(root.join(new)).unwrap();
        let removed = next_batch(&receiver);
        settle();

        // A burst: many files in quick succession arrive as one batch.
        for i in 0..20 {
            std::fs::write(
                root.join(format!("docs/planning/inbox/burst-{i:02}.md")),
                "x",
            )
            .unwrap();
        }
        let burst = next_batch(&receiver);
        settle();

        std::fs::write(root.join(CONFIG_PATH), "stale_after_days: 3\n").unwrap();
        let config = next_batch(&receiver);

        drop(watcher);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(created.changes, [FileChange::Created { path: new.into() }]);
        assert_eq!(
            modified.changes,
            [FileChange::Modified { path: task.into() }]
        );
        assert_eq!(
            moved.changes,
            [FileChange::Moved {
                id: "20261030-220001-aaaa".into(),
                from: task.into(),
                to: done.into(),
            }]
        );
        assert_eq!(removed.changes, [FileChange::Removed { path: new.into() }]);
        assert_eq!(burst.changes.len(), 20, "{burst:?}");
        assert!(!burst.config_changed);
        assert!(config.config_changed);
        assert_eq!(config.changes, []);
    }
}
