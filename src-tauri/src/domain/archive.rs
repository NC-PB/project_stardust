//! Archiving finished tasks by month (`S-archive`).
//!
//! Tasks of the terminal column whose `completed` date lies before the current month move into
//! `<terminal>/YYYY-MM/` of that date. The plan is shown first; the moves happen only when the
//! plan is confirmed unchanged. A file is never written over (`R-no-destroy`) and the text of a
//! moved file stays as it is. Links to and in the moved files are rewritten by the watcher,
//! which sees the moves like any other (`S-links`).

use std::path::Path;

use chrono::NaiveDate;
use serde::Serialize;
use specta::Type;

use super::config::Config;
use super::task::{self, Task};

const DATE_FORMAT: &str = "%Y-%m-%d";

/// One task the archive moves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ArchiveMove {
    pub file_name: String,
    pub id: Option<String>,
    pub title: String,
    pub completed: String,
    /// The month folder, `YYYY-MM`.
    pub month: String,
    /// Where the file is now, relative to the repository root, with `/`.
    pub from: String,
    /// Where it goes, relative to the repository root, with `/`.
    pub to: String,
}

/// A task of the terminal column that is not archived, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ArchiveSkip {
    pub file_name: String,
    pub reason: String,
}

/// What archiving would do, shown before anything moves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ArchivePlan {
    /// The terminal column folder, relative to the repository root.
    pub column: String,
    /// The current month, `YYYY-MM`; tasks completed in it or later stay.
    pub current_month: String,
    /// The tasks to move, by month, then file name.
    pub moves: Vec<ArchiveMove>,
    /// How many tasks stay because they were completed this month or later.
    pub kept: u32,
    /// Tasks without a valid `completed` date, or whose month folder already holds a file
    /// with their name. They stay where they are.
    pub skipped: Vec<ArchiveSkip>,
    /// Why nothing can be archived. Empty when the plan can be confirmed.
    pub blockers: Vec<String>,
}

/// What archiving did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ArchiveReport {
    pub moved: Vec<ArchiveMove>,
    /// Moves that failed; those files stayed where they were.
    pub failed: Vec<ArchiveSkip>,
}

/// What archiving the terminal column of the repository at `repo_root` would do, with `today`
/// (`YYYY-MM-DD`, local) deciding the current month. Writes nothing.
pub fn plan_archive(repo_root: &Path, config: &Config, today: &str) -> ArchivePlan {
    let column = format!(
        "{}/{}",
        config.planning_root.trim_end_matches('/'),
        config.terminal
    );
    let mut plan = ArchivePlan {
        column: column.clone(),
        current_month: String::new(),
        moves: Vec::new(),
        kept: 0,
        skipped: Vec::new(),
        blockers: Vec::new(),
    };
    let Some(current_month) = month_of(today) else {
        plan.blockers
            .push(format!("`{today}` is not a date like 2026-10-31"));
        return plan;
    };
    plan.current_month = current_month;
    let dir = repo_root.join(&column);
    let tasks = match task::read_column(&dir) {
        Ok(tasks) => tasks,
        Err(err) => {
            plan.blockers.push(format!(
                "Cannot read the column `{}`: {err}",
                config.terminal
            ));
            return plan;
        }
    };
    for task in tasks {
        let Some(month) = task.completed.as_deref().and_then(month_of) else {
            plan.skipped.push(ArchiveSkip {
                reason: skip_reason(&task),
                file_name: task.file_name,
            });
            continue;
        };
        if month >= plan.current_month {
            plan.kept += 1;
            continue;
        }
        if dir.join(&month).join(&task.file_name).exists() {
            plan.skipped.push(ArchiveSkip {
                reason: format!(
                    "`{}/{month}/` already has a file with this name",
                    config.terminal
                ),
                file_name: task.file_name,
            });
            continue;
        }
        plan.moves.push(ArchiveMove {
            from: format!("{column}/{}", task.file_name),
            to: format!("{column}/{month}/{}", task.file_name),
            id: task.id,
            title: task.title,
            completed: task.completed.unwrap_or_default(),
            month,
            file_name: task.file_name,
        });
    }
    plan.moves
        .sort_by(|a, b| (&a.month, &a.file_name).cmp(&(&b.month, &b.file_name)));
    plan
}

/// Moves the tasks of [`plan_archive`] into their month folders, creating the folders.
/// `expected` are the file names of the previewed moves; when the plan differs now, nothing
/// moves. A target that exists by the time of its move is left alone and the task stays.
pub fn archive(
    repo_root: &Path,
    config: &Config,
    today: &str,
    expected: &[String],
) -> Result<ArchiveReport, String> {
    let plan = plan_archive(repo_root, config, today);
    if let Some(blocker) = plan.blockers.first() {
        return Err(blocker.clone());
    }
    let planned: Vec<&String> = plan.moves.iter().map(|m| &m.file_name).collect();
    if planned != expected.iter().collect::<Vec<_>>() {
        return Err(format!(
            "The column `{}` changed since the preview; preview again",
            config.terminal
        ));
    }
    let mut report = ArchiveReport {
        moved: Vec::new(),
        failed: Vec::new(),
    };
    for planned in plan.moves {
        let source = repo_root.join(&planned.from);
        let target = repo_root.join(&planned.to);
        let failure = |reason: String| ArchiveSkip {
            file_name: planned.file_name.clone(),
            reason,
        };
        if let Some(parent) = target.parent()
            && let Err(err) = std::fs::create_dir_all(parent)
        {
            report
                .failed
                .push(failure(format!("Cannot create `{}`: {err}", planned.month)));
            continue;
        }
        if target.exists() {
            report.failed.push(failure(format!(
                "`{}/{}/` already has a file with this name",
                config.terminal, planned.month
            )));
            continue;
        }
        match std::fs::rename(&source, &target) {
            Ok(()) => report.moved.push(planned),
            Err(err) => report
                .failed
                .push(failure(format!("Cannot move the file: {err}"))),
        }
    }
    Ok(report)
}

/// `YYYY-MM` of a valid `YYYY-MM-DD` date.
fn month_of(date: &str) -> Option<String> {
    NaiveDate::parse_from_str(date, DATE_FORMAT)
        .ok()
        .map(|date| date.format("%Y-%m").to_string())
}

/// Why a task without a usable `completed` date stays.
fn skip_reason(task: &Task) -> String {
    let issue = |key: Option<&str>| {
        task.issues
            .iter()
            .find(|issue| issue.key.as_deref() == key)
            .map(|issue| issue.message.clone())
    };
    if let Some(message) = issue(Some("completed")) {
        return message;
    }
    if task.completed.is_some() {
        return "`completed` is not a date like 2026-10-31".to_string();
    }
    if let Some(message) = issue(None).filter(|m| m.starts_with("could not read")) {
        return message;
    }
    "No `completed` date".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{config, ids, links, search, watch};
    use std::collections::BTreeSet;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Duration;

    const TODAY: &str = "2026-10-31";

    /// A repository with the default config and its three column folders.
    fn scratch_repo() -> (PathBuf, Config) {
        let root = std::env::temp_dir().join(format!("stardust-archive-{}", ids::random_suffix()));
        for column in ["inbox", "next", "done"] {
            std::fs::create_dir_all(root.join("docs/planning").join(column)).unwrap();
        }
        let config = config::load_config(&root).config;
        (root, config)
    }

    fn put(root: &Path, path: &str, text: &str) {
        let path = root.join("docs/planning").join(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    fn read(root: &Path, path: &str) -> Option<String> {
        std::fs::read_to_string(root.join("docs/planning").join(path)).ok()
    }

    fn finished(title: &str, completed: &str) -> String {
        format!("---\ntitle: {title}\ncreated: 2026-01-01\ncompleted: {completed}\n---\n\nBody\n")
    }

    const OLD: &str = "20260915-100000-aaaa-old.md";
    const OLDER: &str = "20260820-100000-bbbb-older.md";
    const THIS_MONTH: &str = "20261001-100000-cccc-this-month.md";
    const NO_DATE: &str = "20261001-100001-dddd-no-date.md";
    const BAD_DATE: &str = "20261001-100002-eeee-bad-date.md";
    const TAKEN: &str = "20260901-100003-ffff-taken.md";

    fn filled_repo() -> (PathBuf, Config) {
        let (root, config) = scratch_repo();
        put(
            &root,
            &format!("done/{OLD}"),
            &finished("Old", "2026-09-30"),
        );
        put(
            &root,
            &format!("done/{OLDER}"),
            &finished("Older", "2025-12-01"),
        );
        put(
            &root,
            &format!("done/{THIS_MONTH}"),
            &finished("Now", "2026-10-01"),
        );
        put(&root, &format!("done/{NO_DATE}"), "---\ntitle: None\n---\n");
        put(
            &root,
            &format!("done/{BAD_DATE}"),
            &finished("Bad", "2026-09-31"),
        );
        put(
            &root,
            &format!("done/{TAKEN}"),
            &finished("Taken", "2026-09-02"),
        );
        put(&root, &format!("done/2026-09/{TAKEN}"), "already archived");
        put(
            &root,
            "next/20261031-100000-gggg-open.md",
            &finished("Open", "2026-01-01"),
        );
        (root, config)
    }

    #[test]
    fn plans_tasks_before_the_current_month_by_their_completed_month() {
        let (root, config) = filled_repo();
        let plan = plan_archive(&root, &config, TODAY);
        let untouched = read(&root, &format!("done/{OLD}"));
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(plan.blockers, Vec::<String>::new());
        assert_eq!(plan.column, "docs/planning/done");
        assert_eq!(plan.current_month, "2026-10");
        let moves: Vec<(&str, &str)> = plan
            .moves
            .iter()
            .map(|m| (m.from.as_str(), m.to.as_str()))
            .collect();
        assert_eq!(
            moves,
            [
                (
                    "docs/planning/done/20260820-100000-bbbb-older.md",
                    "docs/planning/done/2025-12/20260820-100000-bbbb-older.md"
                ),
                (
                    "docs/planning/done/20260915-100000-aaaa-old.md",
                    "docs/planning/done/2026-09/20260915-100000-aaaa-old.md"
                ),
            ]
        );
        assert_eq!(plan.moves[1].id.as_deref(), Some("20260915-100000-aaaa"));
        assert_eq!(plan.moves[1].title, "Old");
        assert_eq!(plan.moves[1].completed, "2026-09-30");
        assert_eq!(plan.kept, 1);
        let skipped: Vec<(&str, &str)> = plan
            .skipped
            .iter()
            .map(|s| (s.file_name.as_str(), s.reason.as_str()))
            .collect();
        // In file name order.
        assert_eq!(skipped.len(), 3, "{skipped:?}");
        assert_eq!(
            skipped[0],
            (TAKEN, "`done/2026-09/` already has a file with this name")
        );
        assert_eq!(skipped[1], (NO_DATE, "No `completed` date"));
        assert_eq!(skipped[2].0, BAD_DATE);
        assert!(
            skipped[2].1.starts_with("`2026-09-31` is not a date"),
            "{skipped:?}"
        );
        assert_eq!(untouched, Some(finished("Old", "2026-09-30")));
    }

    #[test]
    fn moves_the_previewed_tasks_into_month_folders_and_keeps_their_text() {
        let (root, config) = filled_repo();
        let plan = plan_archive(&root, &config, TODAY);
        let names: Vec<String> = plan.moves.iter().map(|m| m.file_name.clone()).collect();
        let report = archive(&root, &config, TODAY, &names).unwrap();
        let state = [
            read(&root, &format!("done/{OLD}")),
            read(&root, &format!("done/2026-09/{OLD}")),
            read(&root, &format!("done/2025-12/{OLDER}")),
            read(&root, &format!("done/{THIS_MONTH}")),
            read(&root, &format!("done/{NO_DATE}")),
            read(&root, &format!("done/{TAKEN}")),
            read(&root, &format!("done/2026-09/{TAKEN}")),
        ];
        let column = task::read_column(&root.join("docs/planning/done")).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.moved, plan.moves);
        assert_eq!(report.failed, Vec::<ArchiveSkip>::new());
        assert_eq!(state[0], None);
        assert_eq!(state[1], Some(finished("Old", "2026-09-30")));
        assert_eq!(state[2], Some(finished("Older", "2025-12-01")));
        assert!(state[3].is_some() && state[4].is_some() && state[5].is_some());
        assert_eq!(state[6].as_deref(), Some("already archived"));
        // The column itself no longer lists the archived tasks.
        assert_eq!(column.len(), 4);
    }

    #[test]
    fn moves_nothing_when_the_column_changed_since_the_preview() {
        let (root, config) = filled_repo();
        let plan = plan_archive(&root, &config, TODAY);
        let names: Vec<String> = plan.moves.iter().map(|m| m.file_name.clone()).collect();
        put(
            &root,
            "done/20260701-100000-hhhh-late.md",
            &finished("Late", "2026-07-01"),
        );
        let result = archive(&root, &config, TODAY, &names);
        let old = read(&root, &format!("done/{OLD}"));
        std::fs::remove_dir_all(&root).unwrap();

        assert!(result.unwrap_err().contains("changed since the preview"));
        assert!(old.is_some());
    }

    #[test]
    fn a_missing_column_or_a_bad_date_blocks() {
        let (root, config) = scratch_repo();
        let bad_today = plan_archive(&root, &config, "today");
        std::fs::remove_dir(root.join("docs/planning/done")).unwrap();
        let missing = plan_archive(&root, &config, TODAY);
        let refused = archive(&root, &config, TODAY, &[]);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(bad_today.blockers.len(), 1);
        assert!(missing.blockers[0].starts_with("Cannot read the column `done`"));
        assert!(refused.unwrap_err().starts_with("Cannot read the column"));
    }

    #[test]
    fn nothing_to_archive_is_an_empty_plan_and_an_empty_report() {
        let (root, config) = scratch_repo();
        put(
            &root,
            &format!("done/{THIS_MONTH}"),
            &finished("Now", "2026-10-01"),
        );
        let plan = plan_archive(&root, &config, TODAY);
        let report = archive(&root, &config, TODAY, &[]).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert!(plan.moves.is_empty() && plan.skipped.is_empty());
        assert_eq!(plan.kept, 1);
        assert!(report.moved.is_empty() && report.failed.is_empty());
    }

    /// The archive with the app's watcher running, as `watch_project` wires it: every move
    /// arrives as a move, the links to and in the archived tasks are rewritten, and the
    /// archived tasks stay searchable and keep their ids taken.
    #[test]
    fn archived_tasks_keep_their_links_search_and_ids_with_the_watcher() {
        const COUNT: usize = 150;
        let (root, config) = scratch_repo();
        let name = |i: usize| format!("20260901-{:06}-a{:03}-task-{i}.md", 100000 + i, i);
        for i in 0..COUNT {
            // Each archived task links to the next one, to the spec and to an open task.
            let text = format!(
                "---\ntitle: Task {i}\ncompleted: 2026-09-{:02}\n---\n\nUnique word zebra{i}. \
                 Next: [next](./{}), [spec](../spec.md), [open](../next/{OPEN}).\n",
                i % 28 + 1,
                name((i + 1) % COUNT),
            );
            put(&root, &format!("done/{}", name(i)), &text);
        }
        const OPEN: &str = "20261031-100000-open-open.md";
        put(&root, "spec.md", "# Spec\n");
        put(
            &root,
            &format!("next/{OPEN}"),
            &format!("Needs [first](../done/{}).\n", name(0)),
        );
        put(
            &root,
            "braindump.md",
            &format!("See [last](done/{}).\n", name(COUNT - 1)),
        );

        let (sender, receiver) = mpsc::channel();
        let watch_root = root.clone();
        let watcher = watch::watch(&root, &config, move |batch| {
            let links = links::rewrite_after_moves(&watch_root, "docs/planning", &batch.moves());
            sender.send((batch, links)).unwrap();
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(600));

        let plan = plan_archive(&root, &config, TODAY);
        let names: Vec<String> = plan.moves.iter().map(|m| m.file_name.clone()).collect();
        let report = archive(&root, &config, TODAY, &names).unwrap();

        let expected: BTreeSet<String> = plan.moves.iter().map(|m| m.to.clone()).collect();
        let mut moved = BTreeSet::new();
        let mut other = Vec::new();
        let mut problems = Vec::new();
        let mut index = search::SearchIndex::build(&root, "docs/planning");
        while moved != expected {
            let (batch, links) = receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("the watcher did not report every move");
            index.apply(&batch);
            problems.extend(links.problems);
            for change in batch.changes {
                match change {
                    watch::FileChange::Moved { to, .. } => {
                        moved.insert(to);
                    }
                    change => other.push(change),
                }
            }
        }
        // Let the rewritten files land.
        std::thread::sleep(Duration::from_millis(600));
        drop(watcher);

        let archived = |i: usize| read(&root, &format!("done/2026-09/{}", name(i))).unwrap();
        let first = archived(0);
        let open = read(&root, &format!("next/{OPEN}")).unwrap();
        let braindump = read(&root, "braindump.md").unwrap();
        let hits = index.search("zebra42", 10);
        let ids = ids::existing_ids(&root.join("docs/planning")).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.moved.len(), COUNT);
        assert_eq!(problems, Vec::<String>::new());
        // Files created for the month folder may be reported; nothing else moved or vanished.
        assert!(
            other
                .iter()
                .all(|change| matches!(change, watch::FileChange::Modified { .. })),
            "{other:?}"
        );
        assert!(
            first.contains(&format!(
                "[next](./{}), [spec](../../spec.md), [open](../../next/{OPEN})",
                name(1)
            )),
            "{first}"
        );
        assert_eq!(
            open,
            format!("Needs [first](../done/2026-09/{}).\n", name(0))
        );
        assert_eq!(
            braindump,
            format!("See [last](done/2026-09/{}).\n", name(COUNT - 1))
        );
        assert_eq!(
            hits.iter().map(|hit| hit.path.as_str()).collect::<Vec<_>>(),
            [format!("docs/planning/done/2026-09/{}", name(42)).as_str()]
        );
        assert!(ids.iter().any(|id| id.ends_with("a042")));
    }
}
