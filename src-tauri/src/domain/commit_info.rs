//! Commit info (`S-commit-info`): how many commits mention a task id and the date of the last
//! one, from one read-only `git log` pass for all tasks (`R-no-git-writes`).
//!
//! Information only: a mention never moves a task or marks it done (D-20260920-100000-b2e5).
//! Without git, or outside a repository, the info is unavailable and nothing fails.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::git;

/// What `git log --grep` is given: anything shaped like a task id.
const ID_PATTERN: &str = "[0-9]{8}-[0-9]{6}-[a-z0-9]{4}";
/// Separates commits in the output.
const RECORD: char = '\u{1e}';
/// Separates the fields of one commit.
const FIELD: char = '\u{1f}';

/// The commits whose message mentions one task id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TaskCommits {
    /// The task id, such as `20261031-021023-31v3`.
    pub id: String,
    /// Commits of the current branch (`HEAD`) mentioning the id; each counts once.
    pub count: u32,
    /// Committer date (`YYYY-MM-DD`) of the newest of them.
    pub last: String,
}

/// Commit info for every task id mentioned in the history of `HEAD`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CommitInfo {
    /// Whether git could be read here; `false` without git or outside a repository.
    pub available: bool,
    /// Why git could not be read, when it could not.
    pub reason: Option<String>,
    /// By id.
    pub tasks: Vec<TaskCommits>,
}

/// Commit info for the repository at `repo_root`, from one `git log` run.
pub fn commit_info(repo_root: &Path) -> CommitInfo {
    let grep = format!("--grep={ID_PATTERN}");
    let args = [
        "--extended-regexp",
        grep.as_str(),
        "--no-show-signature",
        "--format=%x1e%ct%x1f%ci%x1f%B",
    ];
    match git::log(repo_root, &args) {
        Ok(out) => CommitInfo {
            available: true,
            reason: None,
            tasks: parse_log(&out),
        },
        Err(reason) => CommitInfo {
            available: false,
            reason: Some(reason),
            tasks: Vec::new(),
        },
    }
}

/// Counts the task ids in `git log` output of records `\x1e<unix time>\x1f<date>\x1f<message>`.
fn parse_log(out: &str) -> Vec<TaskCommits> {
    // id -> (count, newest unix time, its date)
    let mut seen: BTreeMap<String, (u32, i64, String)> = BTreeMap::new();
    for record in out.split(RECORD) {
        let mut fields = record.splitn(3, FIELD);
        let (Some(time), Some(date), Some(message)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let Ok(time) = time.trim().parse::<i64>() else {
            continue;
        };
        let Some(date) = date.get(..10) else {
            continue;
        };
        for id in task_ids_in(message) {
            let entry = seen.entry(id).or_insert((0, i64::MIN, String::new()));
            entry.0 += 1;
            if time > entry.1 {
                entry.1 = time;
                entry.2 = date.to_string();
            }
        }
    }
    seen.into_iter()
        .map(|(id, (count, _, last))| TaskCommits { id, count, last })
        .collect()
}

/// The distinct task ids in `text`: `YYYYMMDD-HHMMSS-xxxx` with `xxxx` from `[a-z0-9]`, not
/// part of a longer word. An id after `-`, such as in `D-20261031-022601-txnp`, is a question
/// or decision id and does not count.
fn task_ids_in(text: &str) -> Vec<String> {
    const LEN: usize = 20;
    let bytes = text.as_bytes();
    let mut ids = Vec::new();
    let mut start = 0;
    while start + LEN <= bytes.len() {
        let candidate = &bytes[start..start + LEN];
        let before = start.checked_sub(1).map(|i| bytes[i]);
        let after = bytes.get(start + LEN).copied();
        let shaped = candidate.iter().enumerate().all(|(i, &b)| match i {
            8 | 15 => b == b'-',
            16..=19 => b.is_ascii_digit() || b.is_ascii_lowercase(),
            _ => b.is_ascii_digit(),
        });
        let bounded = !before.is_some_and(|b| b.is_ascii_alphanumeric() || b == b'-')
            && !after.is_some_and(|b| b.is_ascii_alphanumeric());
        if shaped && bounded {
            // All ASCII, so this is valid UTF-8.
            let id = String::from_utf8_lossy(candidate).into_owned();
            if !ids.contains(&id) {
                ids.push(id);
            }
            start += LEN;
        } else {
            start += 1;
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ids;
    use std::process::{Command, Stdio};

    #[test]
    fn finds_task_ids_but_not_question_or_decision_ids() {
        let text = "Commit info (20261031-021023-31v3)\n\n\
                    Moved docs/planning/done/20261031-021023-31v3-commit-info.md and \
                    20261030-120000-ab12, see D-20261031-022601-txnp and Q-20261031-005412-wtkk.\n\
                    Not ids: 120261031-021023-31v3, 20261031-021023-31v3x, 20261031-021023-31V3.";
        assert_eq!(
            task_ids_in(text),
            ["20261031-021023-31v3", "20261030-120000-ab12"]
        );
    }

    #[test]
    fn counts_commits_per_id_with_the_newest_date() {
        let out = "\u{1e}1700000300\u{1f}2026-10-31 02:00:00 +0100\u{1f}Finish 20261031-021023-31v3\n\
                   \u{1e}1700000100\u{1f}2026-10-29 10:00:00 +0100\u{1f}Start 20261031-021023-31v3 and 20261030-120000-ab12\n\
                   \u{1e}1700000200\u{1f}2026-10-30 10:00:00 +0100\u{1f}Again 20261031-021023-31v3, 20261031-021023-31v3\n\
                   \u{1e}garbage\n";
        assert_eq!(
            parse_log(out),
            [
                TaskCommits {
                    id: "20261030-120000-ab12".into(),
                    count: 1,
                    last: "2026-10-29".into()
                },
                TaskCommits {
                    id: "20261031-021023-31v3".into(),
                    count: 3,
                    last: "2026-10-31".into()
                },
            ]
        );
        assert!(parse_log("").is_empty());
    }

    /// Runs git for a test fixture; `None` when git is not installed.
    fn fixture_git(root: &Path, args: &[&str], date: &str) -> Option<()> {
        let status = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(["-c", "commit.gpgsign=false"])
            .args(args)
            .env("GIT_AUTHOR_DATE", date)
            .env("GIT_COMMITTER_DATE", date)
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .ok()?;
        assert!(status.success(), "git {args:?} failed");
        Some(())
    }

    #[test]
    fn reads_commit_info_from_git_log() {
        let root = std::env::temp_dir().join(format!("stardust-commits-{}", ids::random_suffix()));
        std::fs::create_dir_all(&root).unwrap();
        let commit = |message: &str, date: &str| {
            fixture_git(
                &root,
                &["commit", "-q", "--allow-empty", "-m", message],
                date,
            )
        };
        let setup = fixture_git(&root, &["init", "-q"], "2026-10-01T12:00:00+00:00")
            .and_then(|_| commit("Start 20261031-021023-31v3", "2026-10-01T12:00:00+00:00"))
            .and_then(|_| commit("Unrelated", "2026-10-02T12:00:00+00:00"))
            .and_then(|_| {
                commit(
                    "Finish\n\nTask 20261031-021023-31v3",
                    "2026-10-03T12:00:00+00:00",
                )
            });
        if setup.is_none() {
            std::fs::remove_dir_all(&root).unwrap();
            eprintln!("git not installed; skipped");
            return;
        }
        let info = commit_info(&root);
        std::fs::remove_dir_all(&root).unwrap();

        assert!(info.available);
        assert_eq!(
            info.tasks,
            [TaskCommits {
                id: "20261031-021023-31v3".into(),
                count: 2,
                last: "2026-10-03".into()
            }]
        );
    }

    #[test]
    fn outside_a_repository_nothing_is_available_and_nothing_fails() {
        let root = std::env::temp_dir().join(format!("stardust-nogit-{}", ids::random_suffix()));
        std::fs::create_dir_all(&root).unwrap();
        let info = commit_info(&root);
        let missing = commit_info(&root.join("gone"));
        std::fs::remove_dir_all(&root).unwrap();

        // The temp folder is normally outside any repository; without git the reason differs.
        if !info.available {
            assert!(info.reason.is_some());
            assert!(info.tasks.is_empty());
        }
        assert!(!missing.available);
        assert!(missing.tasks.is_empty());
    }
}
