//! Changelog draft (`S-changelog`): entries for the tasks finished in the terminal column since
//! a date or a git tag, grouped by tag, added at the top of `CHANGELOG.md` after a preview.
//!
//! Git is only read, with `git log` (`R-no-git-writes`). Without git, or outside a repository,
//! the tag option is unavailable and the date option still works. The existing changelog is
//! kept byte for byte, and the file is written only over the text the preview read.

use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::config::Config;
use super::files::{self, SaveOutcome};
use super::task::{self, Task};

/// The changelog file, relative to the repository root.
pub const CHANGELOG_PATH: &str = "CHANGELOG.md";
/// The title of a new changelog file.
const NEW_FILE_TITLE: &str = "# Changelog";
/// The group of tasks without tags.
pub const UNTAGGED_GROUP: &str = "Other";
const DATE_FORMAT: &str = "%Y-%m-%d";

/// Where the changelog starts: tasks finished on or after a date, or after the date of a tag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Since {
    /// `YYYY-MM-DD`; tasks completed on this day count.
    Date { date: String },
    /// A git tag; tasks completed after the day of its commit count.
    Tag { tag: String },
}

/// A tag of the repository with the committer date of its commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GitTag {
    pub name: String,
    /// `YYYY-MM-DD`.
    pub date: String,
}

/// The tags the changelog can start from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TagList {
    /// Whether git could be read here; `false` without git or outside a repository.
    pub available: bool,
    /// Why git could not be read, when it could not.
    pub reason: Option<String>,
    /// Newest commit first.
    pub tags: Vec<GitTag>,
}

/// One finished task in the draft.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChangelogEntry {
    pub id: Option<String>,
    pub title: String,
    pub completed: String,
    /// The task file, relative to the repository root.
    pub path: String,
}

/// The entries under one tag: the first tag of each task, or `Other` for tasks without tags.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChangelogGroup {
    pub tag: String,
    pub entries: Vec<ChangelogEntry>,
}

/// What writing the changelog would do. Nothing is written until `write_changelog`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChangelogDraft {
    /// The changelog file, relative to the repository root.
    pub path: String,
    /// Which tasks count, in words, such as `finished on or after 2026-10-01`.
    pub range: String,
    pub groups: Vec<ChangelogGroup>,
    /// Task files in the terminal column without a valid `completed` date; not in the draft.
    pub skipped: Vec<String>,
    /// The markdown added to the file; empty when there are no entries.
    pub section: String,
    /// The file as read; `None` when it does not exist yet.
    pub existing: Option<String>,
    /// The whole file after the write.
    pub text: String,
}

/// The tags of the repository at `repo_root`, from read-only `git log`.
pub fn list_tags(repo_root: &Path) -> TagList {
    let args = [
        "log",
        "--tags",
        "--no-walk",
        "--decorate=short",
        "--format=%ci%x09%D",
    ];
    match git(repo_root, &args) {
        Ok(out) => TagList {
            available: true,
            reason: None,
            tags: parse_tag_lines(&out),
        },
        Err(reason) => TagList {
            available: false,
            reason: Some(reason),
            tags: Vec::new(),
        },
    }
}

/// Tags from `git log --format=%ci%x09%D` lines: a date, a tab, the decorations.
fn parse_tag_lines(out: &str) -> Vec<GitTag> {
    let mut tags = Vec::new();
    for line in out.lines() {
        let Some((date, refs)) = line.split_once('\t') else {
            continue;
        };
        let Some(date) = date.get(..10) else {
            continue;
        };
        for name in refs
            .split(", ")
            .filter_map(|r| r.trim().strip_prefix("tag: "))
        {
            let name = name.strip_prefix("refs/tags/").unwrap_or(name);
            tags.push(GitTag {
                name: name.to_string(),
                date: date.to_string(),
            });
        }
    }
    tags
}

/// The committer date (`YYYY-MM-DD`) of the commit tagged `tag`, from read-only `git log`.
pub fn tag_date(repo_root: &Path, tag: &str) -> Result<String, String> {
    let valid = !tag.is_empty()
        && !tag.starts_with('-')
        && !tag.contains("..")
        && !tag.chars().any(|c| c.is_whitespace() || c.is_control());
    if !valid {
        return Err(format!("`{tag}` is not a tag name"));
    }
    let reference = format!("refs/tags/{tag}");
    let out = git(repo_root, &["log", "-1", "--format=%ci", &reference, "--"])
        .map_err(|reason| format!("No date for tag `{tag}`: {reason}"))?;
    out.trim()
        .get(..10)
        .filter(|date| chrono::NaiveDate::parse_from_str(date, DATE_FORMAT).is_ok())
        .map(str::to_string)
        .ok_or_else(|| format!("No date for tag `{tag}`"))
}

/// Runs `git` with `args` in `repo_root` and returns its output. Only ever called with `log`.
fn git(repo_root: &Path, args: &[&str]) -> Result<String, String> {
    debug_assert_eq!(args.first(), Some(&"log"), "only `git log` may run");
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output().map_err(|err| match err.kind() {
        ErrorKind::NotFound => "git was not found".to_string(),
        _ => format!("git could not run: {err}"),
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first = stderr.lines().next().unwrap_or("").trim();
        let first = first.strip_prefix("fatal: ").unwrap_or(first);
        return Err(if first.is_empty() {
            "git log failed".to_string()
        } else {
            first.to_string()
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The draft for the repository at `repo_root`: the finished tasks since `since`, under a
/// `## today` heading, and the changelog with it added at the top.
pub fn draft_changelog(
    repo_root: &Path,
    config: &Config,
    since: &Since,
    today: &str,
) -> Result<ChangelogDraft, String> {
    let (from, inclusive, range) = match since {
        Since::Date { date } => {
            let date = date.trim();
            if chrono::NaiveDate::parse_from_str(date, DATE_FORMAT).is_err() {
                return Err(format!("`{date}` is not a date like 2026-10-31"));
            }
            (
                date.to_string(),
                true,
                format!("finished on or after {date}"),
            )
        }
        Since::Tag { tag } => {
            let tag = tag.trim();
            let date = tag_date(repo_root, tag)?;
            let range = format!("finished after {date}, the date of tag {tag}");
            (date, false, range)
        }
    };

    let column = format!(
        "{}/{}",
        config.planning_root.trim_end_matches('/'),
        config.terminal
    );
    let tasks = task::read_column(&repo_root.join(&column))
        .map_err(|err| format!("Cannot read the column `{}`: {err}", config.terminal))?;
    let (groups, skipped) = group_tasks(&tasks, &column, &from, inclusive);
    let section = render_section(today, &groups);

    let path = repo_root.join(CHANGELOG_PATH);
    let existing = match std::fs::read_to_string(&path) {
        Ok(text) => Some(text),
        Err(err) if err.kind() == ErrorKind::NotFound => None,
        Err(err) => return Err(format!("Cannot read {CHANGELOG_PATH}: {err}")),
    };
    let text = if section.is_empty() {
        existing.clone().unwrap_or_default()
    } else {
        insert_section(existing.as_deref(), &section)
    };
    Ok(ChangelogDraft {
        path: CHANGELOG_PATH.to_string(),
        range,
        groups,
        skipped,
        section,
        existing,
        text,
    })
}

/// The tasks completed since `from` (on that day too when `inclusive`), grouped by their first
/// tag, and the file names of tasks without a `completed` date. `column` is the column folder
/// relative to the repository root.
fn group_tasks(
    tasks: &[Task],
    column: &str,
    from: &str,
    inclusive: bool,
) -> (Vec<ChangelogGroup>, Vec<String>) {
    let mut entries: Vec<(String, ChangelogEntry)> = Vec::new();
    let mut skipped = Vec::new();
    for task in tasks {
        let Some(completed) = &task.completed else {
            skipped.push(task.file_name.clone());
            continue;
        };
        let counts = if inclusive {
            completed.as_str() >= from
        } else {
            completed.as_str() > from
        };
        if !counts {
            continue;
        }
        let tag = task
            .tags
            .iter()
            .map(|tag| tag.trim())
            .find(|tag| !tag.is_empty())
            .unwrap_or(UNTAGGED_GROUP);
        entries.push((
            tag.to_string(),
            ChangelogEntry {
                id: task.id.clone(),
                title: task.title.split_whitespace().collect::<Vec<_>>().join(" "),
                completed: completed.clone(),
                path: format!("{column}/{}", task.file_name),
            },
        ));
    }
    entries.sort_by(|(_, a), (_, b)| (&a.completed, &a.path).cmp(&(&b.completed, &b.path)));

    let mut groups: Vec<ChangelogGroup> = Vec::new();
    for (tag, entry) in entries {
        match groups.iter_mut().find(|group| group.tag == tag) {
            Some(group) => group.entries.push(entry),
            None => groups.push(ChangelogGroup {
                tag,
                entries: vec![entry],
            }),
        }
    }
    groups.sort_by_key(|group| {
        (
            group.tag == UNTAGGED_GROUP,
            group.tag.to_lowercase(),
            group.tag.clone(),
        )
    });
    (groups, skipped)
}

/// The markdown for `groups` under `## today`, ending with one line break; empty without
/// entries.
fn render_section(today: &str, groups: &[ChangelogGroup]) -> String {
    if groups.is_empty() {
        return String::new();
    }
    let mut out = format!("## {today}\n");
    for group in groups {
        out.push_str(&format!("\n### {}\n\n", group.tag));
        for entry in &group.entries {
            let name = entry
                .id
                .as_deref()
                .unwrap_or_else(|| entry.path.rsplit('/').next().unwrap_or(&entry.path));
            out.push_str(&format!(
                "- {} ([{name}]({}))\n",
                entry.title,
                link_target(&entry.path)
            ));
        }
    }
    out
}

/// `path` as a markdown link target: spaces and parentheses escaped.
fn link_target(path: &str) -> String {
    path.replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
}

/// The changelog with `section` added at the top: after a leading `# ` title and the text
/// under it, before the first `## ` heading; at the very start when the file has no title. A
/// new file gets the title `# Changelog`. The existing text is kept byte for byte; line
/// breaks in `section` follow the file's.
pub fn insert_section(existing: Option<&str>, section: &str) -> String {
    let Some(text) = existing else {
        return format!("{NEW_FILE_TITLE}\n\n{section}");
    };
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let section = if newline == "\r\n" {
        section.replace('\n', "\r\n")
    } else {
        section.to_string()
    };
    let (before, after) = text.split_at(insert_offset(text));
    let mut out = String::from(before);
    if !before.is_empty() {
        if !before.ends_with('\n') {
            out.push_str(newline);
        }
        if !out.ends_with(&format!("{newline}{newline}")) {
            out.push_str(newline);
        }
    }
    out.push_str(&section);
    if !after.is_empty() {
        out.push_str(newline);
    }
    out.push_str(after);
    out
}

/// Where new entries go in `text`; see `insert_section`.
fn insert_offset(text: &str) -> usize {
    let lines: Vec<(usize, &str)> = text
        .split_inclusive('\n')
        .scan(0, |offset, line| {
            let start = *offset;
            *offset += line.len();
            Some((start, line.trim_end_matches(['\n', '\r'])))
        })
        .collect();
    let mut index = 0;
    // A frontmatter block stays first.
    if lines.first().is_some_and(|(_, line)| *line == "---")
        && let Some(close) = lines.iter().skip(1).position(|(_, line)| *line == "---")
    {
        index = close + 2;
    }
    while lines
        .get(index)
        .is_some_and(|(_, line)| line.trim().is_empty())
    {
        index += 1;
    }
    let Some((title_start, title)) = lines.get(index) else {
        return text.len();
    };
    if !(title.starts_with("# ") || *title == "#") {
        return *title_start;
    }
    let mut fence = false;
    for (start, line) in &lines[index + 1..] {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fence = !fence;
        } else if !fence && line.starts_with("## ") {
            return *start;
        }
    }
    text.len()
}

/// Whether `text` holds all of `expected` unchanged, with one block added in between.
fn keeps_text(expected: &str, text: &str) -> bool {
    let (a, b) = (expected.as_bytes(), text.as_bytes());
    if b.len() < a.len() {
        return false;
    }
    let prefix = a.iter().zip(b).take_while(|(x, y)| x == y).count();
    let suffix = a
        .iter()
        .rev()
        .zip(b.iter().rev())
        .take(a.len() - prefix)
        .take_while(|(x, y)| x == y)
        .count();
    prefix + suffix == a.len()
}

/// Writes `text` to the changelog of the repository at `repo_root`, if the file still holds
/// `expected` (`None`: it still does not exist) and `text` keeps all of `expected`.
pub fn write_changelog(repo_root: &Path, expected: Option<&str>, text: &str) -> Result<(), String> {
    let path = repo_root.join(CHANGELOG_PATH);
    let changed = format!("{CHANGELOG_PATH} changed on disk since the preview; preview again");
    match expected {
        None => files::create_text(&path, text).map_err(|err| {
            if path.exists() {
                changed
            } else {
                format!("Cannot write {CHANGELOG_PATH}: {err}")
            }
        }),
        Some(expected) => {
            if !keeps_text(expected, text) {
                return Err(format!(
                    "The draft does not keep the text of {CHANGELOG_PATH}"
                ));
            }
            match files::save_text(&path, expected, text) {
                Ok(SaveOutcome::Saved) => Ok(()),
                Ok(SaveOutcome::ChangedOnDisk { .. }) => Err(changed),
                Err(err) => Err(format!("Cannot write {CHANGELOG_PATH}: {err}")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{config, ids};
    use std::path::PathBuf;

    const TODAY: &str = "2026-10-31";

    fn scratch_repo() -> (PathBuf, Config) {
        let root =
            std::env::temp_dir().join(format!("stardust-changelog-{}", ids::random_suffix()));
        for column in ["inbox", "next", "done"] {
            std::fs::create_dir_all(root.join("docs/planning").join(column)).unwrap();
        }
        let config = config::load_config(&root).config;
        (root, config)
    }

    fn put_task(root: &Path, column: &str, name: &str, frontmatter: &str) {
        let text = format!("---\n{frontmatter}\n---\n\n## Result\nDone.\n");
        std::fs::write(root.join("docs/planning").join(column).join(name), text).unwrap();
    }

    fn date(date: &str) -> Since {
        Since::Date {
            date: date.to_string(),
        }
    }

    fn fill(root: &Path) {
        put_task(
            root,
            "done",
            "20261001-100000-aaaa-old.md",
            "title: Old\ntags: [board]\ncompleted: 2026-10-01",
        );
        put_task(
            root,
            "done",
            "20261010-100000-bbbb-board-sort.md",
            "title: Board sort\ntags: [board, planning]\ncompleted: 2026-10-10",
        );
        put_task(
            root,
            "done",
            "20261005-100000-cccc-search.md",
            "title: Search\ntags: [Search]\ncompleted: 2026-10-12",
        );
        put_task(
            root,
            "done",
            "20261005-100000-dddd-misc.md",
            "title: Misc\ncompleted: 2026-10-11",
        );
        put_task(
            root,
            "done",
            "20261005-100000-eeee-cards.md",
            "title: Cards\ntags: [board]\ncompleted: 2026-10-05",
        );
        put_task(
            root,
            "done",
            "20261005-100000-ffff-undated.md",
            "title: Undated",
        );
        put_task(
            root,
            "next",
            "20261005-100000-gggg-open.md",
            "title: Open\ncompleted: 2026-10-20",
        );
    }

    #[test]
    fn drafts_finished_tasks_since_a_date_grouped_by_first_tag() {
        let (root, config) = scratch_repo();
        fill(&root);
        let draft = draft_changelog(&root, &config, &date("2026-10-05"), TODAY);
        std::fs::remove_dir_all(&root).unwrap();
        let draft = draft.unwrap();

        assert_eq!(draft.range, "finished on or after 2026-10-05");
        assert_eq!(draft.skipped, ["20261005-100000-ffff-undated.md"]);
        assert_eq!(draft.existing, None);
        assert_eq!(
            draft.section,
            "## 2026-10-31\n\n\
             ### board\n\n\
             - Cards ([20261005-100000-eeee](docs/planning/done/20261005-100000-eeee-cards.md))\n\
             - Board sort ([20261010-100000-bbbb](docs/planning/done/20261010-100000-bbbb-board-sort.md))\n\n\
             ### Search\n\n\
             - Search ([20261005-100000-cccc](docs/planning/done/20261005-100000-cccc-search.md))\n\n\
             ### Other\n\n\
             - Misc ([20261005-100000-dddd](docs/planning/done/20261005-100000-dddd-misc.md))\n"
        );
        assert_eq!(draft.text, format!("# Changelog\n\n{}", draft.section));
        assert_eq!(draft.groups.len(), 3);
    }

    #[test]
    fn no_entries_leaves_the_text_unchanged_and_bad_dates_are_refused() {
        let (root, config) = scratch_repo();
        fill(&root);
        std::fs::write(root.join(CHANGELOG_PATH), "# Changelog\n").unwrap();
        let empty = draft_changelog(&root, &config, &date("2026-11-01"), TODAY);
        let bad = draft_changelog(&root, &config, &date("31.10.2026"), TODAY);
        std::fs::remove_dir_all(&root).unwrap();
        let empty = empty.unwrap();

        assert!(empty.groups.is_empty());
        assert_eq!(empty.section, "");
        assert_eq!(empty.text, "# Changelog\n");
        assert!(bad.unwrap_err().contains("is not a date"));
    }

    #[test]
    fn inserts_after_the_title_and_intro_before_the_first_release() {
        let text = "# Changelog\n\nAll notable changes.\n\n## 2026-10-01\n\n- Old\n";
        let out = insert_section(Some(text), "## new\n");
        assert_eq!(
            out,
            "# Changelog\n\nAll notable changes.\n\n## new\n\n## 2026-10-01\n\n- Old\n"
        );
        assert!(keeps_text(text, &out));
    }

    #[test]
    fn inserts_at_the_end_after_a_title_without_releases_and_at_the_top_without_title() {
        assert_eq!(
            insert_section(Some("# Changelog"), "## new\n"),
            "# Changelog\n\n## new\n"
        );
        assert_eq!(
            insert_section(Some("## 1.0\n- x\n"), "## new\n"),
            "## new\n\n## 1.0\n- x\n"
        );
        assert_eq!(insert_section(Some(""), "## new\n"), "## new\n");
        assert_eq!(insert_section(None, "## new\n"), "# Changelog\n\n## new\n");
    }

    #[test]
    fn skips_frontmatter_and_fenced_headings_and_keeps_crlf() {
        let text = "---\ntitle: x\n---\n# Log\n\n```\n## not a heading\n```\n\n## 1.0\n";
        assert_eq!(
            insert_section(Some(text), "## new\n"),
            "---\ntitle: x\n---\n# Log\n\n```\n## not a heading\n```\n\n## new\n\n## 1.0\n"
        );
        assert_eq!(
            insert_section(Some("# Log\r\n\r\n## 1.0\r\n"), "## new\n\n- a\n"),
            "# Log\r\n\r\n## new\r\n\r\n- a\r\n\r\n## 1.0\r\n"
        );
    }

    #[test]
    fn keeps_text_accepts_one_inserted_block_only() {
        assert!(keeps_text("ab", "aXb"));
        assert!(keeps_text("ab", "abX"));
        assert!(keeps_text("", "X"));
        assert!(!keeps_text("ab", "aX"));
        assert!(!keeps_text("abc", "ab"));
    }

    #[test]
    fn writes_only_over_the_text_read() {
        let (root, _) = scratch_repo();
        let path = root.join(CHANGELOG_PATH);
        let created = write_changelog(&root, None, "# Changelog\n\n## a\n");
        let again = write_changelog(&root, None, "# Changelog\n\n## b\n");
        let updated = write_changelog(
            &root,
            Some("# Changelog\n\n## a\n"),
            "# Changelog\n\n## c\n\n## a\n",
        );
        let stale = write_changelog(
            &root,
            Some("# Changelog\n\n## a\n"),
            "# Changelog\n\n## d\n\n## a\n",
        );
        let dropped = write_changelog(
            &root,
            Some("# Changelog\n\n## c\n\n## a\n"),
            "# Changelog\n",
        );
        let text = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(created, Ok(()));
        assert!(again.unwrap_err().contains("changed on disk"));
        assert_eq!(updated, Ok(()));
        assert!(stale.unwrap_err().contains("changed on disk"));
        assert!(dropped.unwrap_err().contains("does not keep"));
        assert_eq!(text, "# Changelog\n\n## c\n\n## a\n");
    }

    #[test]
    fn parses_tag_decorations() {
        let out = "2026-10-20 10:00:00 +0200\ttag: v0.2.0, origin/main\n\
                   2026-10-01 09:00:00 +0200\tHEAD -> main\n\
                   2026-09-01 09:00:00 +0200\ttag: refs/tags/v0.1.0, tag: first\n";
        assert_eq!(
            parse_tag_lines(out),
            [
                GitTag {
                    name: "v0.2.0".into(),
                    date: "2026-10-20".into()
                },
                GitTag {
                    name: "v0.1.0".into(),
                    date: "2026-09-01".into()
                },
                GitTag {
                    name: "first".into(),
                    date: "2026-09-01".into()
                },
            ]
        );
    }

    #[test]
    fn refuses_tag_names_that_could_be_options() {
        let root = std::env::temp_dir();
        assert!(
            tag_date(&root, "--all")
                .unwrap_err()
                .contains("not a tag name")
        );
        assert!(
            tag_date(&root, "a b")
                .unwrap_err()
                .contains("not a tag name")
        );
        assert!(tag_date(&root, "").unwrap_err().contains("not a tag name"));
    }

    /// Runs git for a test fixture; `None` when git is not installed.
    fn fixture_git(root: &Path, args: &[&str], date: &str) -> Option<()> {
        let status = Command::new("git")
            .arg("-C")
            .arg(root)
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
    fn drafts_since_a_tag_from_git_log() {
        let (root, config) = scratch_repo();
        fill(&root);
        let date = "2026-10-10T12:00:00+00:00";
        let setup = fixture_git(&root, &["init", "-q"], date).and_then(|_| {
            fixture_git(
                &root,
                &[
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "-q",
                    "--allow-empty",
                    "-m",
                    "x",
                ],
                date,
            )?;
            fixture_git(&root, &["tag", "v0.1.0"], date)
        });
        if setup.is_none() {
            std::fs::remove_dir_all(&root).unwrap();
            eprintln!("git not installed; skipped");
            return;
        }
        let tags = list_tags(&root);
        let draft = draft_changelog(
            &root,
            &config,
            &Since::Tag {
                tag: "v0.1.0".into(),
            },
            TODAY,
        );
        let unknown = draft_changelog(&root, &config, &Since::Tag { tag: "v9".into() }, TODAY);
        std::fs::remove_dir_all(&root).unwrap();
        let draft = draft.unwrap();

        assert!(tags.available);
        assert_eq!(
            tags.tags,
            [GitTag {
                name: "v0.1.0".into(),
                date: "2026-10-10".into()
            }]
        );
        assert_eq!(
            draft.range,
            "finished after 2026-10-10, the date of tag v0.1.0"
        );
        let titles: Vec<&str> = draft
            .groups
            .iter()
            .flat_map(|group| group.entries.iter().map(|entry| entry.title.as_str()))
            .collect();
        assert_eq!(titles, ["Search", "Misc"]);
        assert!(unknown.unwrap_err().starts_with("No date for tag `v9`"));
    }

    #[test]
    fn outside_a_repository_tags_are_unavailable_and_dates_still_work() {
        let (root, config) = scratch_repo();
        fill(&root);
        let tags = list_tags(&root);
        let draft = draft_changelog(&root, &config, &date("2026-10-01"), TODAY);
        std::fs::remove_dir_all(&root).unwrap();

        // The temp folder is normally outside any repository; without git the reason differs.
        if !tags.available {
            assert!(tags.reason.is_some());
            assert!(tags.tags.is_empty());
        }
        assert_eq!(draft.unwrap().groups.len(), 3);
    }
}
