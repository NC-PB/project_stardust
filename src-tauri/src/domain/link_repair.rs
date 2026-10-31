//! Repairing broken links by the id in the target's filename (`S-links`).
//!
//! [`links::rewrite_after_moves`](super::links::rewrite_after_moves) follows the moves the
//! watcher sees. Moves it cannot see leave links broken: a move made while the app was closed,
//! or one whose halves land in different batches (D-20261031-023039-a9u7). Such a link still
//! names the task's id in its filename, and ids are unique across the planning root
//! (`R-unique-ids`, `R-filename-truth`), so the task can be found again wherever it is now,
//! archive subfolders included.
//!
//! A link is repaired only when it does not resolve from its file and its filename holds an id
//! that exactly one task file under the planning root carries. Every other broken link is left
//! as it is and listed as a [`BrokenLink`] for the doctor (`S-doctor`). Links are found and
//! rewritten by the scanner of `links.rs`; each file is written with [`files::save_text`]
//! against the text read.

use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::files::{self, SaveOutcome, percent_decode};
use super::ids;
use super::links::{
    FileLinks, LineKind, LinkChange, classify, components, contains, local_path, markdown_files,
    relative_link, resolve, rewrite_links,
};
use super::watch::{ChangeBatch, FileChange};

/// Why a broken link could not be repaired.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrokenReason {
    /// The target's filename holds no id.
    NoId,
    /// No task file under the planning root carries the id.
    UnknownId { id: String },
    /// Several task files carry the id (`R-unique-ids` broken); paths relative to the
    /// repository root.
    AmbiguousId { id: String, files: Vec<String> },
}

/// A relative link that does not resolve and was not repaired.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BrokenLink {
    /// The file holding the link, relative to the repository root.
    pub file: String,
    /// 1-based line in the file.
    pub line: u32,
    /// The link target as written.
    pub target: String,
    pub reason: BrokenReason,
}

/// What a repair did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkRepair {
    /// The files whose links were repaired by id, with each change, in walk order.
    pub repaired: Vec<FileLinks>,
    /// Broken links in the checked files that were left as they are.
    pub unresolved: Vec<BrokenLink>,
    /// Files that could not be checked or written, and why.
    pub problems: Vec<String>,
}

/// Which files a repair checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepairScope {
    /// Every searched markdown file of the repository.
    All,
    /// The files that hold one of these task ids, and the files at these paths (relative to
    /// the repository root): what one batch of changes can have broken or made repairable.
    Ids {
        ids: BTreeSet<String>,
        files: BTreeSet<String>,
    },
}

impl RepairScope {
    pub fn is_empty(&self) -> bool {
        matches!(self, RepairScope::Ids { ids, files } if ids.is_empty() && files.is_empty())
    }

    /// What `batch` can have broken or made repairable: links naming the id of a task file
    /// created, removed or moved in it, and the links in the files created or moved to. A
    /// batch of modified files only is empty, so the repair's own writes start no new one.
    pub fn of_batch(batch: &ChangeBatch) -> Self {
        let mut ids = BTreeSet::new();
        let mut files = BTreeSet::new();
        let id_of = |path: &str| {
            ids::parse_task_filename(path.rsplit('/').next().unwrap_or(path)).map(|name| name.id)
        };
        for change in &batch.changes {
            match change {
                FileChange::Created { path } => {
                    ids.extend(id_of(path));
                    files.insert(path.clone());
                }
                FileChange::Removed { path } => ids.extend(id_of(path)),
                FileChange::Moved { id, to, .. } => {
                    ids.insert(id.clone());
                    files.insert(to.clone());
                }
                FileChange::Modified { .. } => {}
            }
        }
        RepairScope::Ids { ids, files }
    }
}

/// Repairs the broken links in `scope` of the repository at `repo_root` by the id in their
/// target's filename. Each file is written against the text read, so a file changed
/// meanwhile is left as it is and named in the problems.
pub fn repair_links(repo_root: &Path, planning_root: &str, scope: &RepairScope) -> LinkRepair {
    let plan = plan_repair(repo_root, planning_root, scope);
    let mut report = LinkRepair {
        repaired: Vec::new(),
        unresolved: plan.unresolved,
        problems: plan.problems,
    };
    for planned in plan.files {
        match files::save_text(&planned.path, &planned.old, &planned.new) {
            Ok(SaveOutcome::Saved) => report.repaired.push(FileLinks {
                file: planned.file,
                changes: planned.changes,
            }),
            Ok(SaveOutcome::ChangedOnDisk { .. }) => report.problems.push(format!(
                "{} changed while its links were repaired; it was left as it is",
                planned.file
            )),
            Err(err) => report.problems.push(format!(
                "could not repair the links in {}: {err}",
                planned.file
            )),
        }
    }
    report
}

/// Every relative link in the repository at `repo_root` that does not resolve and cannot be
/// repaired by id, without writing anything: the broken links for the doctor (`S-doctor`).
/// Links a repair would fix are not listed.
pub fn broken_links(repo_root: &Path, planning_root: &str) -> Vec<BrokenLink> {
    plan_repair(repo_root, planning_root, &RepairScope::All).unresolved
}

/// What a repair over every searched markdown file would do, without writing anything:
/// `repaired` holds the links a repair would change, `unresolved` the broken links it would
/// leave. For the doctor (`S-doctor`), which lists both.
pub fn check_links(repo_root: &Path, planning_root: &str) -> LinkRepair {
    let plan = plan_repair(repo_root, planning_root, &RepairScope::All);
    LinkRepair {
        repaired: plan
            .files
            .into_iter()
            .map(|planned| FileLinks {
                file: planned.file,
                changes: planned.changes,
            })
            .collect(),
        unresolved: plan.unresolved,
        problems: plan.problems,
    }
}

/// One file a repair writes.
struct Planned {
    path: PathBuf,
    /// Relative to the repository root.
    file: String,
    /// The text as read.
    old: String,
    /// The text with its links repaired.
    new: String,
    changes: Vec<LinkChange>,
}

#[derive(Default)]
struct Plan {
    files: Vec<Planned>,
    unresolved: Vec<BrokenLink>,
    problems: Vec<String>,
}

/// The task files under the planning root by the id in their filename, as components from
/// the repository root.
fn task_files(
    markdown: &[(PathBuf, String)],
    planning_root: &str,
) -> HashMap<String, Vec<Vec<String>>> {
    let prefix = format!("{}/", planning_root.trim_end_matches('/'));
    let mut index: HashMap<String, Vec<Vec<String>>> = HashMap::new();
    for (_, file) in markdown
        .iter()
        .filter(|(_, file)| file.starts_with(&prefix))
    {
        let name = file.rsplit('/').next().unwrap_or(file);
        if let Some(parsed) = ids::parse_task_filename(name) {
            index.entry(parsed.id).or_default().push(components(file));
        }
    }
    index
}

fn plan_repair(repo_root: &Path, planning_root: &str, scope: &RepairScope) -> Plan {
    let mut plan = Plan::default();
    if scope.is_empty() {
        return plan;
    }
    let markdown = markdown_files(repo_root, &repo_root.join(planning_root));
    let index = task_files(&markdown, planning_root);
    let exists = |parts: &[String]| {
        parts
            .iter()
            .fold(repo_root.to_path_buf(), |path, part| path.join(part))
            .exists()
    };

    for (path, file) in markdown {
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => {
                plan.problems.push(format!("could not read {file}: {err}"));
                continue;
            }
        };
        if let RepairScope::Ids { ids, files } = scope
            && !files.contains(&file)
            && !ids.iter().any(|id| contains(&bytes, id.as_bytes()))
        {
            continue;
        }
        let Ok(old) = String::from_utf8(bytes) else {
            // Outside a batch every file is checked; a file in no known encoding is no
            // planning file and is skipped quietly, as the split does.
            if scope != &RepairScope::All {
                plan.problems.push(format!(
                    "could not check the links in {file}: it is not UTF-8 text"
                ));
            }
            continue;
        };
        let parts = components(&file);
        let dir = parts[..parts.len() - 1].to_vec();

        let mut new = String::with_capacity(old.len());
        let mut changes = Vec::new();
        for (number, (line, kind)) in classify(&old).into_iter().enumerate() {
            if kind == LineKind::Literal {
                new.push_str(line);
                continue;
            }
            let number = number as u32 + 1;
            let broken = RefCell::new(Vec::new());
            // The line alone: a text line holds no frontmatter or fence of its own.
            let (repaired, line_changes) = rewrite_links(line, |target| {
                let (link, rest) = local_path(target)?;
                if resolve(&dir, link).is_some_and(|now| exists(&now)) {
                    return None;
                }
                match find_by_id(&index, link) {
                    Ok(to) => Some(format!("{}{rest}", relative_link(&dir, to, link))),
                    Err(reason) => {
                        broken.borrow_mut().push(BrokenLink {
                            file: file.clone(),
                            line: number,
                            target: target.to_string(),
                            reason,
                        });
                        None
                    }
                }
            });
            new.push_str(&repaired);
            changes.extend(line_changes.into_iter().map(|change| LinkChange {
                line: number,
                ..change
            }));
            plan.unresolved.extend(broken.into_inner());
        }
        if !changes.is_empty() {
            plan.files.push(Planned {
                path,
                file,
                old,
                new,
                changes,
            });
        }
    }
    plan
}

/// The one task file carrying the id in the filename of the link path `link`.
fn find_by_id<'a>(
    index: &'a HashMap<String, Vec<Vec<String>>>,
    link: &str,
) -> Result<&'a [String], BrokenReason> {
    let decoded = percent_decode(link);
    let name = decoded.rsplit(['/', '\\']).next().unwrap_or(&decoded);
    let Some(id) = ids::find_ids(name).next() else {
        return Err(BrokenReason::NoId);
    };
    match index.get(id).map(Vec::as_slice) {
        Some([only]) => Ok(only),
        Some(several) if !several.is_empty() => Err(BrokenReason::AmbiguousId {
            id: id.to_string(),
            files: several.iter().map(|parts| parts.join("/")).collect(),
        }),
        _ => Err(BrokenReason::UnknownId { id: id.to_string() }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ids::random_suffix;

    const A: &str = "20261031-000001-aaaa-one.md";
    const B: &str = "20261031-000002-bbbb-two.md";
    const C: &str = "20261031-000003-cccc-three.md";

    fn repo(files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-repair-{}", random_suffix()));
        for (file, text) in files {
            let path = root.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        root
    }

    fn read(root: &Path, file: &str) -> String {
        std::fs::read_to_string(root.join(file)).unwrap()
    }

    fn ids(list: &[&str]) -> RepairScope {
        RepairScope::Ids {
            ids: list.iter().map(|id| id.to_string()).collect(),
            files: BTreeSet::new(),
        }
    }

    #[test]
    fn links_to_tasks_moved_while_the_app_was_closed_are_found_by_id() {
        let note = format!(
            "---\nlink: [x](next/{A})\n---\n\
             See [one](next/{A}#result), [two](<inbox/{B}>) and [three](next/{C}).\n\
             Code `[one](next/{A})` stays.\n\n```\n[one](next/{A})\n```\n\
             [spec](spec.md) [web](https://example.com/{A}) [gone](nowhere.md)\n"
        );
        let archived_a = format!("docs/planning/done/2026-10/{A}");
        let renamed_c = "docs/planning/next/20261031-000003-cccc-three-renamed.md";
        let root = repo(&[
            ("docs/planning/spec.md", "# Spec\n"),
            ("docs/planning/note.md", &note),
            (&archived_a, &format!("Before [two](../../inbox/{B}).\n")),
            (&format!("docs/planning/done/{B}"), "x\n"),
            (renamed_c, "x\n"),
            ("README.md", &format!("[one](docs/planning/next/{A})\n")),
            (
                "docs/other.md",
                "[spec](planning/spec.md) [none](../x/20261031-000009-zzzz.md)\n",
            ),
        ]);

        let report = repair_links(&root, "docs/planning", &RepairScope::All);
        assert_eq!(report.problems, Vec::<String>::new());
        assert_eq!(
            report
                .repaired
                .iter()
                .map(|f| f.file.as_str())
                .collect::<Vec<_>>(),
            ["README.md", archived_a.as_str(), "docs/planning/note.md"]
        );
        assert_eq!(
            read(&root, "docs/planning/note.md"),
            format!(
                "---\nlink: [x](next/{A})\n---\n\
                 See [one](done/2026-10/{A}#result), [two](<done/{B}>) and [three](next/20261031-000003-cccc-three-renamed.md).\n\
                 Code `[one](next/{A})` stays.\n\n```\n[one](next/{A})\n```\n\
                 [spec](spec.md) [web](https://example.com/{A}) [gone](nowhere.md)\n"
            )
        );
        assert_eq!(
            report.repaired[2].changes[0],
            LinkChange {
                line: 4,
                old: format!("next/{A}#result"),
                new: format!("done/2026-10/{A}#result"),
            }
        );
        assert_eq!(read(&root, &archived_a), format!("Before [two](../{B}).\n"));
        assert_eq!(
            read(&root, "README.md"),
            format!("[one](docs/planning/done/2026-10/{A})\n")
        );
        assert_eq!(
            report.unresolved,
            [
                BrokenLink {
                    file: "docs/other.md".into(),
                    line: 1,
                    target: "../x/20261031-000009-zzzz.md".into(),
                    reason: BrokenReason::UnknownId {
                        id: "20261031-000009-zzzz".into()
                    },
                },
                BrokenLink {
                    file: "docs/planning/note.md".into(),
                    line: 10,
                    target: "nowhere.md".into(),
                    reason: BrokenReason::NoId,
                },
            ]
        );

        // Repaired links resolve, so a second repair changes nothing.
        let again = repair_links(&root, "docs/planning", &RepairScope::All);
        assert_eq!(again.repaired, Vec::<FileLinks>::new());
        assert_eq!(again.unresolved, report.unresolved);
        assert_eq!(broken_links(&root, "docs/planning"), report.unresolved);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_duplicate_id_is_not_guessed() {
        let root = repo(&[
            ("docs/planning/note.md", &format!("[one](inbox/{A})\n")),
            (&format!("docs/planning/next/{A}"), "x\n"),
            (&format!("docs/planning/done/{A}"), "x\n"),
        ]);
        let report = repair_links(&root, "docs/planning", &RepairScope::All);
        assert_eq!(report.repaired, Vec::<FileLinks>::new());
        assert_eq!(
            report.unresolved,
            [BrokenLink {
                file: "docs/planning/note.md".into(),
                line: 1,
                target: format!("inbox/{A}"),
                reason: BrokenReason::AmbiguousId {
                    id: "20261031-000001-aaaa".into(),
                    files: vec![
                        format!("docs/planning/done/{A}"),
                        format!("docs/planning/next/{A}"),
                    ],
                },
            }]
        );
        assert_eq!(
            read(&root, "docs/planning/note.md"),
            format!("[one](inbox/{A})\n")
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_batch_checks_only_files_naming_its_ids_and_its_own_files() {
        // The second half of a move: the task appeared in done/ after its removal from next/
        // came in an earlier batch.
        let done_a = format!("docs/planning/done/{A}");
        let root = repo(&[
            ("docs/planning/spec.md", "# Spec\n"),
            (
                &done_a,
                &format!("[two](../inbox/{B}) [spec](../spec.md)\n"),
            ),
            (
                &format!("docs/planning/next/{B}"),
                &format!("[one](../next/{A})\n"),
            ),
            (
                &format!("docs/planning/next/{C}"),
                &format!("[two](../inbox/{B})\n"),
            ),
        ]);
        let scope = RepairScope::Ids {
            ids: ["20261031-000001-aaaa".to_string()].into(),
            files: [done_a.clone()].into(),
        };
        let report = repair_links(&root, "docs/planning", &scope);
        assert_eq!(report.problems, Vec::<String>::new());
        assert_eq!(
            read(&root, &done_a),
            format!("[two](../next/{B}) [spec](../spec.md)\n")
        );
        assert_eq!(
            read(&root, &format!("docs/planning/next/{B}")),
            format!("[one](../done/{A})\n")
        );
        // C names neither the id nor is it in the batch; the open repair will get it.
        assert_eq!(
            read(&root, &format!("docs/planning/next/{C}")),
            format!("[two](../inbox/{B})\n")
        );
        assert_eq!(report.unresolved, Vec::<BrokenLink>::new());
        assert_eq!(
            repair_links(&root, "docs/planning", &ids(&[])),
            LinkRepair::default()
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_scope_of_a_batch() {
        let batch = ChangeBatch {
            changes: vec![
                FileChange::Created {
                    path: format!("docs/planning/done/{A}"),
                },
                FileChange::Created {
                    path: "docs/planning/notes.md".into(),
                },
                FileChange::Removed {
                    path: format!("docs/planning/next/{B}"),
                },
                FileChange::Modified {
                    path: format!("docs/planning/next/{C}"),
                },
                FileChange::Moved {
                    id: "20261031-000004-dddd".into(),
                    from: "docs/planning/next/20261031-000004-dddd.md".into(),
                    to: "docs/planning/done/20261031-000004-dddd.md".into(),
                },
            ],
            config_changed: false,
        };
        assert_eq!(
            RepairScope::of_batch(&batch),
            RepairScope::Ids {
                ids: [
                    "20261031-000001-aaaa".to_string(),
                    "20261031-000002-bbbb".to_string(),
                    "20261031-000004-dddd".to_string(),
                ]
                .into(),
                files: [
                    format!("docs/planning/done/{A}"),
                    "docs/planning/notes.md".to_string(),
                    "docs/planning/done/20261031-000004-dddd.md".to_string(),
                ]
                .into(),
            }
        );
        let modified = ChangeBatch {
            changes: vec![FileChange::Modified {
                path: format!("docs/planning/next/{C}"),
            }],
            config_changed: false,
        };
        assert!(RepairScope::of_batch(&modified).is_empty());
    }

    #[test]
    fn a_file_changed_meanwhile_is_not_written() {
        let root = repo(&[
            ("docs/planning/note.md", &format!("[one](next/{A})\n")),
            (&format!("docs/planning/done/{A}"), "x\n"),
        ]);
        let plan = plan_repair(&root, "docs/planning", &ids(&["20261031-000001-aaaa"]));
        assert_eq!(plan.files.len(), 1);
        assert_eq!(plan.files[0].new, format!("[one](done/{A})\n"));
        let edited = format!("[one](next/{A}) and more\n");
        std::fs::write(&plan.files[0].path, &edited).unwrap();
        assert_eq!(
            files::save_text(&plan.files[0].path, &plan.files[0].old, &plan.files[0].new),
            Ok(SaveOutcome::ChangedOnDisk {
                text: edited.clone()
            })
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn non_utf8_files_are_reported_only_in_a_batch() {
        let root = repo(&[(&format!("docs/planning/done/{A}"), "x\n")]);
        let mut latin = format!("[one](next/{A}) caf").into_bytes();
        latin.push(0xe9);
        std::fs::write(root.join("docs/planning/latin.md"), latin).unwrap();
        assert_eq!(
            repair_links(&root, "docs/planning", &RepairScope::All),
            LinkRepair::default()
        );
        assert_eq!(
            repair_links(&root, "docs/planning", &ids(&["20261031-000001-aaaa"])).problems,
            ["could not check the links in docs/planning/latin.md: it is not UTF-8 text"]
        );
        std::fs::remove_dir_all(&root).unwrap();
    }
}
