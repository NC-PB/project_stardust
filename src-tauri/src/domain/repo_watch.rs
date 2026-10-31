//! Watching the repository outside the planning root, coarsely (`S-watcher`).
//!
//! The planning watcher ([`super::watch`]) reports every file under the planning root. Code
//! files and markdown elsewhere matter too: a created or removed code file changes which code
//! paths are missing (`S-staleness`), and a markdown file outside the planning root can link
//! to the open file or be linked to (`S-links`). Those views read the disk again themselves,
//! so this watcher only says what kind of change happened, once per burst: an
//! [`OutsideChange`].
//!
//! Hidden folders, [`SKIPPED`] folders (`node_modules`, `target`) and the planning root are
//! never watched, not even by a recursive watch of a folder above them: a folder whose tree
//! holds none of them is watched recursively, every other folder on its own (non-recursively)
//! and its subfolders in turn. A folder created later in a folder watched on its own is added
//! the same way.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak, mpsc};
use std::time::{Duration, Instant};

use notify::event::ModifyKind;
use notify::{EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::links::SKIPPED;

/// A burst is sent once no event arrived for this long. Longer than the planning watcher's:
/// nothing here has to feel instant, and code tools write in long bursts.
const QUIET: Duration = Duration::from_millis(300);
/// A burst is sent at the latest this long after its first event.
const MAX_WAIT: Duration = Duration::from_secs(2);

/// What one burst of events outside the planning root touched. Paths are not sent: whoever
/// listens reads the disk again.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct OutsideChange {
    /// A file or folder was created, removed or renamed (missing code paths may change).
    pub files_added_or_removed: bool,
    /// A markdown file was created, changed, removed or renamed, or a folder that may hold
    /// some (backlinks and link candidates may change).
    pub markdown: bool,
}

impl OutsideChange {
    pub fn is_empty(&self) -> bool {
        !self.files_added_or_removed && !self.markdown
    }

    fn merge(&mut self, other: OutsideChange) {
        self.files_added_or_removed |= other.files_added_or_removed;
        self.markdown |= other.markdown;
    }
}

/// Whether `name`, a folder name, is never watched: hidden or skipped.
fn excluded_name(name: &str) -> bool {
    name.starts_with('.') || SKIPPED.contains(&name)
}

/// The change an event of `kind` on `relative` (relative to the repository root) stands for.
/// Paths under the planning root, or in or under an excluded folder, count for nothing, as
/// do reads and the editor backups the planning watcher ignores.
pub fn classify(kind: &EventKind, relative: &Path, planning_root: &Path) -> OutsideChange {
    let none = OutsideChange::default();
    if relative.as_os_str().is_empty() || relative.starts_with(planning_root) {
        return none;
    }
    let names: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    let (file, folders) = names.split_last().expect("not empty");
    if folders.iter().any(|name| excluded_name(name)) || file.ends_with('~') {
        return none;
    }
    let structural = match kind {
        EventKind::Access(_) => return none,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => {
            true
        }
        EventKind::Modify(_) => false,
        // Unknown kinds are taken as the widest change.
        EventKind::Any | EventKind::Other => true,
    };
    // A hidden file (`.DS_Store`, `.foo.swp`) or an excluded folder itself.
    if excluded_name(file) {
        return none;
    }
    let extension = Path::new(file).extension();
    let markdown = extension.is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        // A folder created, removed or moved may hold markdown files.
        || (structural && extension.is_none());
    OutsideChange {
        files_added_or_removed: structural,
        markdown,
    }
}

/// The watches covering `dir` without covering a hidden or skipped folder or the planning
/// root (`planning`, absolute): `dir` recursively when its tree holds none of them, else
/// `dir` on its own and its subfolders in turn. Symbolic links are not followed.
pub fn plan(dir: &Path, planning: &Path) -> Vec<(PathBuf, RecursiveMode)> {
    let mut watches = Vec::new();
    plan_into(dir, planning, &mut watches);
    watches
}

/// Adds the watches of `dir` to `watches`; returns whether `dir` is watched recursively.
fn plan_into(dir: &Path, planning: &Path, watches: &mut Vec<(PathBuf, RecursiveMode)>) -> bool {
    let mut children: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
                .map(|entry| entry.path())
                .collect()
        })
        .unwrap_or_default();
    children.sort();
    let mut clean = true;
    let mut below = Vec::new();
    for child in children {
        let name = child.file_name().unwrap_or_default().to_string_lossy();
        if excluded_name(&name) || child == planning {
            clean = false;
            continue;
        }
        clean &= plan_into(&child, planning, &mut below);
    }
    if clean {
        watches.push((dir.to_path_buf(), RecursiveMode::Recursive));
    } else {
        watches.push((dir.to_path_buf(), RecursiveMode::NonRecursive));
        watches.extend(below);
    }
    clean
}

/// Whether `path` is inside a folder of `watches` that is watched recursively, or is one of
/// the folders watched.
fn covered(path: &Path, watches: &[(PathBuf, RecursiveMode)]) -> bool {
    watches.iter().any(|(dir, mode)| {
        dir == path || (*mode == RecursiveMode::Recursive && path.starts_with(dir))
    })
}

/// Watches the repository outside the planning root until dropped.
pub struct RepositoryWatcher {
    _watcher: Arc<Mutex<notify::RecommendedWatcher>>,
}

/// Starts watching the repository at `repo_root` outside its planning root `planning_root`
/// (relative). `on_change` runs on a background thread once per burst that touched anything.
pub fn watch(
    repo_root: &Path,
    planning_root: &str,
    on_change: impl Fn(OutsideChange) + Send + 'static,
) -> Result<RepositoryWatcher, String> {
    let repo_root = repo_root
        .canonicalize()
        .map_err(|err| format!("{}: {err}", repo_root.display()))?;
    let planning_relative = PathBuf::from(planning_root.trim_matches('/'));
    let planning = repo_root.join(&planning_relative);

    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(sender).map_err(|err| err.to_string())?;
    let mut watches = plan(&repo_root, &planning);
    for (dir, mode) in &watches {
        watcher.watch(dir, *mode).map_err(|err| err.to_string())?;
    }
    let watcher = Arc::new(Mutex::new(watcher));
    let handle: Weak<Mutex<notify::RecommendedWatcher>> = Arc::downgrade(&watcher);

    std::thread::spawn(move || {
        let mut change = OutsideChange::default();
        let mut new_folders: Vec<PathBuf> = Vec::new();
        let mut first: Option<Instant> = None;
        loop {
            let timeout = match first {
                Some(start) => QUIET.min(MAX_WAIT.saturating_sub(start.elapsed())),
                None => Duration::from_secs(3600),
            };
            match receiver.recv_timeout(timeout) {
                Ok(Ok(event)) => {
                    for path in &event.paths {
                        let Ok(relative) = path.strip_prefix(&repo_root) else {
                            continue;
                        };
                        let found = classify(&event.kind, relative, &planning_relative);
                        if found.is_empty() {
                            continue;
                        }
                        if found.files_added_or_removed {
                            new_folders.push(path.clone());
                        }
                        change.merge(found);
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
            // Folders created where only the folder itself is watched get watches of their own.
            for path in new_folders.drain(..) {
                if !path.is_dir() || covered(&path, &watches) {
                    continue;
                }
                let Some(watcher) = handle.upgrade() else {
                    return;
                };
                let Ok(mut watcher) = watcher.lock() else {
                    return;
                };
                for (dir, mode) in plan(&path, &planning) {
                    if watcher.watch(&dir, mode).is_ok() {
                        watches.push((dir, mode));
                    }
                }
            }
            let sent = std::mem::take(&mut change);
            first = None;
            on_change(sent);
        }
    });
    Ok(RepositoryWatcher { _watcher: watcher })
}

#[cfg(test)]
mod tests {
    use notify::event::{AccessKind, CreateKind, DataChange, RemoveKind, RenameMode};

    use super::*;
    use crate::domain::ids::random_suffix;

    const PLANNING: &str = "docs/planning";

    fn of(kind: EventKind, path: &str) -> OutsideChange {
        classify(&kind, Path::new(path), Path::new(PLANNING))
    }

    const CREATE: EventKind = EventKind::Create(CreateKind::File);
    const WRITE: EventKind = EventKind::Modify(ModifyKind::Data(DataChange::Content));

    #[test]
    fn code_files_added_or_removed_count_and_their_edits_do_not() {
        let added = OutsideChange {
            files_added_or_removed: true,
            markdown: false,
        };
        assert_eq!(of(CREATE, "src/lib/new.ts"), added);
        assert_eq!(of(EventKind::Remove(RemoveKind::File), "src/a.rs"), added);
        assert_eq!(
            of(
                EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
                "src/a.rs"
            ),
            added
        );
        assert!(of(WRITE, "src/a.rs").is_empty());
        assert!(of(EventKind::Access(AccessKind::Any), "src/a.rs").is_empty());
    }

    #[test]
    fn markdown_counts_when_it_changes_and_folders_when_they_come_or_go() {
        assert_eq!(
            of(WRITE, "README.md"),
            OutsideChange {
                files_added_or_removed: false,
                markdown: true
            }
        );
        assert_eq!(
            of(CREATE, "docs/guide/Intro.MD"),
            OutsideChange {
                files_added_or_removed: true,
                markdown: true
            }
        );
        // A folder without an extension may hold markdown files.
        assert!(of(EventKind::Remove(RemoveKind::Folder), "docs/old").markdown);
        assert!(!of(WRITE, "Makefile").markdown);
    }

    #[test]
    fn the_planning_root_hidden_and_skipped_folders_and_backups_count_for_nothing() {
        for path in [
            "docs/planning/next/a.md",
            "docs/planning",
            ".git/index",
            "node_modules/x/README.md",
            "src-tauri/target/debug/app",
            "src/.cache/a.md",
            ".DS_Store",
            "src/.a.md.swp",
            "README.md~",
            "node_modules",
        ] {
            assert!(of(CREATE, path).is_empty(), "{path}");
        }
        assert!(!of(CREATE, "docs/planning-notes.md").is_empty());
    }

    fn temp_repo(dirs: &[&str]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-repo-watch-{}", random_suffix()));
        std::fs::create_dir_all(&root).unwrap();
        // Events come with the real path (`/private/var` rather than `/var` on macOS).
        let root = root.canonicalize().unwrap();
        for dir in dirs {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        root
    }

    #[test]
    fn the_plan_never_covers_excluded_folders() {
        let root = temp_repo(&[
            ".git/objects",
            "node_modules/x",
            "src/lib",
            "src-tauri/src/domain",
            "src-tauri/target/debug",
            "docs/planning/next",
            "docs/notes",
        ]);
        let watches = plan(&root, &root.join(PLANNING));
        std::fs::remove_dir_all(&root).unwrap();
        let rel: Vec<(String, bool)> = watches
            .iter()
            .map(|(dir, mode)| {
                (
                    dir.strip_prefix(&root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                    *mode == RecursiveMode::Recursive,
                )
            })
            .collect();
        assert_eq!(
            rel,
            [
                (String::new(), false),
                ("docs".into(), false),
                ("docs/notes".into(), true),
                ("src".into(), true),
                ("src-tauri".into(), false),
                ("src-tauri/src".into(), true),
            ]
        );
    }

    #[test]
    fn a_folder_is_covered_by_a_recursive_watch_above_it() {
        let watches = vec![
            (PathBuf::from("/r"), RecursiveMode::NonRecursive),
            (PathBuf::from("/r/src"), RecursiveMode::Recursive),
        ];
        assert!(covered(Path::new("/r/src/new"), &watches));
        assert!(covered(Path::new("/r"), &watches));
        assert!(!covered(Path::new("/r/new"), &watches));
    }

    fn next(receiver: &mpsc::Receiver<OutsideChange>) -> OutsideChange {
        receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("no change from the repository watcher")
    }

    /// Lets the watcher settle so the next step is a burst of its own.
    fn settle() {
        std::thread::sleep(Duration::from_millis(900));
    }

    #[test]
    fn the_watcher_reports_changes_outside_the_planning_root_only() {
        let root = temp_repo(&["src", "docs/planning/next", "node_modules/x", "target"]);
        let (sender, receiver) = mpsc::channel();
        let watcher = watch(&root, PLANNING, move |change| {
            sender.send(change).unwrap();
        })
        .unwrap();
        settle();

        // Not reported: the planning root, ignored folders.
        std::fs::write(root.join("docs/planning/next/a.md"), "a").unwrap();
        std::fs::write(root.join("node_modules/x/b.js"), "b").unwrap();
        std::fs::write(root.join("target/c"), "c").unwrap();
        settle();
        let quiet = receiver.try_recv();

        std::fs::write(root.join("src/new.rs"), "x").unwrap();
        let code = next(&receiver);
        settle();

        std::fs::write(root.join("README.md"), "# Readme").unwrap();
        let markdown = next(&receiver);
        settle();

        // A folder created at the top gets its own watch, so files in it are seen.
        std::fs::create_dir(root.join("guide")).unwrap();
        let folder = next(&receiver);
        settle();
        std::fs::write(root.join("guide/intro.md"), "# Intro").unwrap();
        let inside = next(&receiver);

        drop(watcher);
        std::fs::remove_dir_all(&root).unwrap();

        assert!(quiet.is_err(), "{quiet:?}");
        assert!(code.files_added_or_removed, "{code:?}");
        assert!(markdown.markdown, "{markdown:?}");
        assert!(folder.files_added_or_removed, "{folder:?}");
        assert!(
            inside.markdown && inside.files_added_or_removed,
            "{inside:?}"
        );
    }
}
