//! `.gitattributes` lines that merge the append-only spec files by union (`S-gitattributes`).
//!
//! Questions and Decisions only grow (`R-append-only`), so two branches that each append an
//! entry conflict at the same place. Git's built-in `union` merge driver keeps the lines of both
//! sides instead. The tool writes the lines into `.gitattributes`, a plain file; it never runs
//! git (`R-no-git-writes`).

use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use specta::Type;

use super::config::Config;
use super::files::{self, SaveOutcome};
use super::links::contains;
use super::spec::{self, SPEC_FILE, SPEC_FOLDER, SpecForm};

/// The attributes file at the repository root.
pub const GITATTRIBUTES: &str = ".gitattributes";

/// The attribute the tool writes for each file.
const UNION: &str = "merge=union";

/// The files of the folder form that hold the append-only sections, in spec order.
const FOLDER_APPEND_ONLY: [&str; 2] = ["questions.md", "decisions.md"];

/// What adding the lines would do, shown before anything is written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GitattributesPlan {
    /// The spec form the config chooses; the lines name its files.
    pub form: SpecForm,
    /// Whether `.gitattributes` exists; it is created when it does not.
    pub exists: bool,
    /// Lines to append, in order. Empty when nothing is missing.
    pub missing: Vec<String>,
    /// Existing lines that already give a file `merge=union`.
    pub present: Vec<String>,
    /// Existing lines that give a file another merge setting. That file gets no line: the
    /// setting is the user's.
    pub conflicting: Vec<String>,
    /// Why nothing can be written. Empty when the lines can be added.
    pub blockers: Vec<String>,
}

/// What adding the lines did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GitattributesReport {
    /// The lines appended to `.gitattributes`.
    pub added: Vec<String>,
    /// Whether `.gitattributes` was created.
    pub created: bool,
}

/// The files that hold Questions and Decisions in the form the config chooses, relative to the
/// repository root with `/` separators: `spec.md` in the single file form, `spec/questions.md`
/// and `spec/decisions.md` in the folder form. Never a task file.
pub fn append_only_files(repo_root: &Path, config: &Config) -> (SpecForm, Vec<String>) {
    let form = spec::spec_form(config, repo_root);
    (form, form_files(config, form))
}

/// The files that hold Questions and Decisions in `form`, as [`append_only_files`] names them.
fn form_files(config: &Config, form: SpecForm) -> Vec<String> {
    let root: Vec<String> = Path::new(&config.planning_root)
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    let path = |parts: &[&str]| {
        root.iter()
            .map(String::as_str)
            .chain(parts.iter().copied())
            .collect::<Vec<_>>()
            .join("/")
    };
    match form {
        SpecForm::File => vec![path(&[SPEC_FILE])],
        SpecForm::Folder => FOLDER_APPEND_ONLY
            .iter()
            .map(|name| path(&[SPEC_FOLDER, name]))
            .collect(),
    }
}

/// What adding the `merge=union` lines to `.gitattributes` would do. Writes nothing.
pub fn plan_gitattributes(repo_root: &Path, config: &Config) -> GitattributesPlan {
    prepare(repo_root, config).0
}

/// Appends the lines of [`plan_gitattributes`] to `.gitattributes`, creating it if needed.
/// `expected` are the lines of the preview; when the plan differs now, nothing is written.
/// Existing text is kept byte for byte and written over only if it is still what was read.
pub fn add_gitattributes(
    repo_root: &Path,
    config: &Config,
    expected: &[String],
) -> Result<GitattributesReport, String> {
    let (plan, text) = prepare(repo_root, config);
    if let Some(blocker) = plan.blockers.first() {
        return Err(blocker.clone());
    }
    if plan.missing != expected {
        return Err(format!(
            "{GITATTRIBUTES} or the spec changed since the preview; preview again"
        ));
    }
    if plan.missing.is_empty() {
        return Ok(GitattributesReport {
            added: Vec::new(),
            created: false,
        });
    }
    let path = repo_root.join(GITATTRIBUTES);
    let new_text = append_lines(&text, &plan.missing);
    if plan.exists {
        match files::save_text(&path, &text, &new_text)
            .map_err(|err| format!("could not write {GITATTRIBUTES}: {err}"))?
        {
            SaveOutcome::Saved => {}
            SaveOutcome::ChangedOnDisk { .. } => {
                return Err(format!(
                    "{GITATTRIBUTES} changed on disk since it was read; preview again"
                ));
            }
        }
    } else {
        files::create_text(&path, &new_text)
            .map_err(|err| format!("could not create {GITATTRIBUTES}: {err}"))?;
    }
    Ok(GitattributesReport {
        added: plan.missing,
        created: !plan.exists,
    })
}

/// The plan and the text of `.gitattributes` it was made from (empty when the file is missing).
fn prepare(repo_root: &Path, config: &Config) -> (GitattributesPlan, String) {
    let (form, targets) = append_only_files(repo_root, config);
    let mut plan = GitattributesPlan {
        form,
        exists: false,
        missing: Vec::new(),
        present: Vec::new(),
        conflicting: Vec::new(),
        blockers: Vec::new(),
    };
    let text = match std::fs::read(repo_root.join(GITATTRIBUTES)) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => {
                plan.exists = true;
                text
            }
            Err(_) => {
                plan.exists = true;
                plan.blockers
                    .push(format!("{GITATTRIBUTES} is not UTF-8 text"));
                return (plan, String::new());
            }
        },
        Err(err) if err.kind() == ErrorKind::NotFound => String::new(),
        Err(err) => {
            plan.blockers
                .push(format!("could not read {GITATTRIBUTES}: {err}"));
            return (plan, String::new());
        }
    };
    let lines: Vec<AttrLine> = text.lines().filter_map(parse_line).collect();
    for target in &targets {
        let pattern = match pattern_for(target) {
            Ok(pattern) => pattern,
            Err(blocker) => {
                plan.blockers.push(blocker);
                continue;
            }
        };
        // Later lines override earlier ones for the same path, as in git.
        let setting = lines
            .iter()
            .rev()
            .find(|line| line.pattern == *target && line.merge.is_some());
        match setting {
            Some(line) if line.merge.as_deref() == Some(UNION) => {
                plan.present.push(line.text.clone());
            }
            Some(line) => plan.conflicting.push(line.text.clone()),
            None => plan.missing.push(format!("{pattern} {UNION}")),
        }
    }
    if !plan.blockers.is_empty() {
        plan.missing.clear();
    }
    (plan, text)
}

/// What a split of the spec does to `.gitattributes` (`S-spec-split`), shown in its preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SplitAttributes {
    /// The line of `.gitattributes`, counted from 1, that gives `spec.md` `merge=union`.
    pub line: u32,
    /// That line as written, trimmed. The split removes it when `new` is not empty.
    pub old: String,
    /// The lines that take its place: one per folder file that has no merge setting of its own,
    /// the old line with the folder file's path. Empty when nothing changes.
    pub new: Vec<String>,
    /// Existing lines that already set `merge` for a folder file. They stay as they are and
    /// that file gets no line: the setting is the user's.
    pub kept: Vec<String>,
}

/// The change [`plan_split_lines`] found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitLines {
    pub preview: SplitAttributes,
    /// `.gitattributes`.
    pub path: PathBuf,
    /// Its text as read.
    pub old_text: String,
    /// Its text after the split; the same as `old_text` when nothing changes.
    pub new_text: String,
}

/// What a split of the single spec file into the folder form does to `.gitattributes` at
/// `repo_root`. `None` when the file is missing or does not give `spec.md` `merge=union` (no
/// line for it, or the user's own other setting): then nothing changes. Otherwise the line that
/// gives it `merge=union` is replaced, in place, by the same line for each folder file that has
/// no merge setting yet. An error is a reason the split cannot run. Writes nothing.
pub fn plan_split_lines(repo_root: &Path, config: &Config) -> Result<Option<SplitLines>, String> {
    let path = repo_root.join(GITATTRIBUTES);
    let spec_path = form_files(config, SpecForm::File).remove(0);
    let text = match std::fs::read(&path) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => text,
            // Bytes that cannot name the spec do not matter to the split.
            Err(err) if !contains(err.as_bytes(), SPEC_FILE.as_bytes()) => return Ok(None),
            Err(_) => return Err(format!("{GITATTRIBUTES} is not UTF-8 text")),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("could not read {GITATTRIBUTES}: {err}")),
    };
    let raw: Vec<&str> = text.split_inclusive('\n').collect();
    let parsed: Vec<(usize, AttrLine)> = raw
        .iter()
        .enumerate()
        .filter_map(|(index, line)| parse_line(line).map(|parsed| (index, parsed)))
        .collect();
    // The last line with the path that sets `merge` decides, as in git.
    let setting = |target: &str| {
        parsed
            .iter()
            .rev()
            .find(|(_, line)| line.pattern == target && line.merge.is_some())
    };
    let Some((index, spec_line)) = setting(&spec_path) else {
        return Ok(None);
    };
    if spec_line.merge.as_deref() != Some(UNION) {
        return Ok(None);
    }
    let index = *index;
    let ending = if raw[index].ends_with("\r\n") {
        "\r\n"
    } else if raw[index].ends_with('\n') {
        "\n"
    } else {
        ""
    };
    let line = &raw[index][..raw[index].len() - ending.len()];
    let mut new = Vec::new();
    let mut kept = Vec::new();
    for target in form_files(config, SpecForm::Folder) {
        match setting(&target) {
            Some((_, existing)) => kept.push(existing.text.clone()),
            None => new.push(with_path(line, &target)?),
        }
    }
    let new_text = if new.is_empty() {
        text.clone()
    } else {
        let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
        let mut out: String = raw[..index].concat();
        out.push_str(&new.join(newline));
        out.push_str(ending);
        out.push_str(&raw[index + 1..].concat());
        out
    };
    Ok(Some(SplitLines {
        preview: SplitAttributes {
            line: index as u32 + 1,
            old: spec_line.text.clone(),
            new: new.iter().map(|line| line.trim().to_string()).collect(),
            kept,
        },
        path,
        old_text: text,
        new_text,
    }))
}

/// `line`, a `.gitattributes` line without its line ending, with its pattern replaced by `path`.
/// Indentation, a leading `/` and the attributes after the pattern are kept as written.
fn with_path(line: &str, path: &str) -> Result<String, String> {
    let body = line.trim_start();
    let indent = &line[..line.len() - body.len()];
    let end = match body.strip_prefix('"') {
        Some(quoted) => quoted.find('"').map_or(body.len(), |end| end + 2),
        None => body.find(char::is_whitespace).unwrap_or(body.len()),
    };
    let slash = if body[..end].trim_start_matches('"').starts_with('/') {
        "/"
    } else {
        ""
    };
    let pattern = pattern_for(&format!("{slash}{path}"))?;
    Ok(format!("{indent}{pattern}{}", &body[end..]))
}

/// `text` with `lines` appended, each ended by the line ending the file already uses (`\r\n`
/// when it holds one, `\n` otherwise). The existing text is kept as is.
fn append_lines(text: &str, lines: &[String]) -> String {
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut out = text.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push_str(newline);
    }
    for line in lines {
        out.push_str(line);
        out.push_str(newline);
    }
    out
}

/// The `.gitattributes` pattern for the file `path`: the path itself, in double quotes when it
/// holds whitespace. Paths with glob or escape characters are refused rather than escaped.
fn pattern_for(path: &str) -> Result<String, String> {
    if path
        .chars()
        .any(|c| matches!(c, '*' | '?' | '[' | ']' | '\\' | '"' | '!' | '#') || c.is_control())
    {
        return Err(format!(
            "{path} has characters a {GITATTRIBUTES} pattern would read as a glob or escape"
        ));
    }
    if path.chars().any(char::is_whitespace) {
        Ok(format!("\"{path}\""))
    } else {
        Ok(path.to_string())
    }
}

/// One line of `.gitattributes` that names a path.
struct AttrLine {
    /// The line as written, trimmed.
    text: String,
    /// The pattern without quotes and without a leading `/`.
    pattern: String,
    /// The last merge setting of the line: `merge=<driver>`, `merge`, `-merge`, `!merge`, or
    /// `-merge` for the `binary` macro. `None` when the line does not set it.
    merge: Option<String>,
}

fn parse_line(line: &str) -> Option<AttrLine> {
    let text = line.trim();
    if text.is_empty() || text.starts_with('#') {
        return None;
    }
    let (pattern, rest) = if let Some(quoted) = text.strip_prefix('"') {
        let end = quoted.find('"')?;
        (&quoted[..end], &quoted[end + 1..])
    } else {
        text.split_once(char::is_whitespace).unwrap_or((text, ""))
    };
    let merge = rest
        .split_whitespace()
        .rev()
        .find_map(|attribute| match attribute {
            "binary" => Some("-merge".to_string()),
            "merge" | "-merge" | "!merge" => Some(attribute.to_string()),
            _ if attribute.starts_with("merge=") => Some(attribute.to_string()),
            _ => None,
        });
    Some(AttrLine {
        text: text.to_string(),
        pattern: pattern.strip_prefix('/').unwrap_or(pattern).to_string(),
        merge,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::config::{self, SpecLocation};
    use crate::domain::ids::random_suffix;
    use std::path::PathBuf;

    fn scratch_repo() -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-gitattr-{}", random_suffix()));
        std::fs::create_dir_all(root.join("docs/planning/next")).unwrap();
        root
    }

    fn config_with(spec: SpecLocation) -> Config {
        let mut config = config::parse_config("").0;
        config.spec = spec;
        config
    }

    fn read(root: &Path) -> String {
        std::fs::read_to_string(root.join(GITATTRIBUTES)).unwrap()
    }

    #[test]
    fn single_file_form_names_spec_md_only() {
        let root = scratch_repo();
        let plan = plan_gitattributes(&root, &config_with(SpecLocation::Auto));
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(plan.form, SpecForm::File);
        assert!(!plan.exists);
        assert_eq!(plan.missing, vec!["docs/planning/spec.md merge=union"]);
        assert!(plan.blockers.is_empty());
    }

    #[test]
    fn folder_form_names_questions_and_decisions_only() {
        let root = scratch_repo();
        std::fs::create_dir_all(root.join("docs/planning/spec")).unwrap();
        let plan = plan_gitattributes(&root, &config_with(SpecLocation::Auto));
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(plan.form, SpecForm::Folder);
        assert_eq!(
            plan.missing,
            vec![
                "docs/planning/spec/questions.md merge=union",
                "docs/planning/spec/decisions.md merge=union",
            ]
        );
    }

    #[test]
    fn never_names_a_task_file_or_column() {
        let root = scratch_repo();
        let config = config_with(SpecLocation::Folder);
        let (_, files) = append_only_files(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();
        for file in files {
            for column in &config.columns {
                assert!(!file.starts_with(&format!("docs/planning/{column}/")));
            }
            assert!(file.starts_with("docs/planning/spec/"));
        }
    }

    #[test]
    fn planning_root_is_normalized() {
        let root = scratch_repo();
        let mut config = config_with(SpecLocation::File);
        config.planning_root = "./plans/".to_string();
        let (_, files) = append_only_files(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(files, vec!["plans/spec.md"]);
    }

    #[test]
    fn creates_the_file_with_the_lines() {
        let root = scratch_repo();
        let config = config_with(SpecLocation::Folder);
        let plan = plan_gitattributes(&root, &config);
        let report = add_gitattributes(&root, &config, &plan.missing).unwrap();
        let text = read(&root);
        std::fs::remove_dir_all(&root).unwrap();
        assert!(report.created);
        assert_eq!(report.added, plan.missing);
        assert_eq!(
            text,
            "docs/planning/spec/questions.md merge=union\n\
             docs/planning/spec/decisions.md merge=union\n"
        );
    }

    #[test]
    fn keeps_existing_text_and_its_line_endings() {
        let root = scratch_repo();
        let existing = "# mine\r\n*.png binary\r\n\r\n*.sh text eol=lf";
        std::fs::write(root.join(GITATTRIBUTES), existing).unwrap();
        let config = config_with(SpecLocation::File);
        let plan = plan_gitattributes(&root, &config);
        let report = add_gitattributes(&root, &config, &plan.missing).unwrap();
        let text = read(&root);
        std::fs::remove_dir_all(&root).unwrap();
        assert!(!report.created);
        assert_eq!(
            text,
            format!("{existing}\r\ndocs/planning/spec.md merge=union\r\n")
        );
    }

    #[test]
    fn adds_only_missing_lines() {
        let root = scratch_repo();
        std::fs::write(
            root.join(GITATTRIBUTES),
            "/docs/planning/spec/questions.md merge=union\n",
        )
        .unwrap();
        let config = config_with(SpecLocation::Folder);
        let plan = plan_gitattributes(&root, &config);
        add_gitattributes(&root, &config, &plan.missing).unwrap();
        let again = plan_gitattributes(&root, &config);
        let report = add_gitattributes(&root, &config, &again.missing).unwrap();
        let text = read(&root);
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(
            plan.present,
            vec!["/docs/planning/spec/questions.md merge=union"]
        );
        assert_eq!(
            plan.missing,
            vec!["docs/planning/spec/decisions.md merge=union"]
        );
        assert!(again.missing.is_empty());
        assert_eq!(again.present.len(), 2);
        assert!(report.added.is_empty());
        assert_eq!(
            text,
            "/docs/planning/spec/questions.md merge=union\n\
             docs/planning/spec/decisions.md merge=union\n"
        );
    }

    #[test]
    fn another_merge_setting_is_left_alone() {
        let root = scratch_repo();
        std::fs::write(
            root.join(GITATTRIBUTES),
            "docs/planning/spec.md merge=union\ndocs/planning/spec.md -merge\n",
        )
        .unwrap();
        let plan = plan_gitattributes(&root, &config_with(SpecLocation::File));
        std::fs::remove_dir_all(&root).unwrap();
        assert!(plan.missing.is_empty());
        assert!(plan.present.is_empty());
        assert_eq!(plan.conflicting, vec!["docs/planning/spec.md -merge"]);
    }

    #[test]
    fn lines_without_a_merge_setting_do_not_count() {
        let root = scratch_repo();
        std::fs::write(
            root.join(GITATTRIBUTES),
            "docs/planning/spec.md text\n# docs/planning/spec.md merge=union\n",
        )
        .unwrap();
        let plan = plan_gitattributes(&root, &config_with(SpecLocation::File));
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(plan.missing, vec!["docs/planning/spec.md merge=union"]);
    }

    #[test]
    fn refuses_when_the_preview_is_stale() {
        let root = scratch_repo();
        let config = config_with(SpecLocation::File);
        let plan = plan_gitattributes(&root, &config);
        std::fs::write(
            root.join(GITATTRIBUTES),
            "docs/planning/spec.md merge=union\n",
        )
        .unwrap();
        let result = add_gitattributes(&root, &config, &plan.missing);
        let text = read(&root);
        std::fs::remove_dir_all(&root).unwrap();
        assert!(result.unwrap_err().contains("preview again"));
        assert_eq!(text, "docs/planning/spec.md merge=union\n");
    }

    #[test]
    fn not_utf8_blocks() {
        let root = scratch_repo();
        std::fs::write(root.join(GITATTRIBUTES), [0xff, 0xfe, 0x00]).unwrap();
        let config = config_with(SpecLocation::File);
        let plan = plan_gitattributes(&root, &config);
        let result = add_gitattributes(&root, &config, &[]);
        let bytes = std::fs::read(root.join(GITATTRIBUTES)).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(plan.blockers, vec![".gitattributes is not UTF-8 text"]);
        assert!(plan.missing.is_empty());
        assert!(result.is_err());
        assert_eq!(bytes, vec![0xff, 0xfe, 0x00]);
    }

    #[test]
    fn patterns_quote_spaces_and_refuse_globs() {
        assert_eq!(
            pattern_for("my docs/spec.md").unwrap(),
            "\"my docs/spec.md\""
        );
        assert!(pattern_for("docs[1]/spec.md").is_err());
        assert!(pattern_for("docs/sp*c.md").is_err());
    }

    #[test]
    fn quoted_patterns_are_read() {
        let line = parse_line("\"my docs/spec.md\" merge=union").unwrap();
        assert_eq!(line.pattern, "my docs/spec.md");
        assert_eq!(line.merge.as_deref(), Some("merge=union"));
        let binary = parse_line("docs/planning/spec.md binary").unwrap();
        assert_eq!(binary.merge.as_deref(), Some("-merge"));
    }

    /// [`plan_split_lines`] for a `.gitattributes` holding `text`, or none when `None`.
    fn split_lines(text: Option<&[u8]>) -> Result<Option<SplitLines>, String> {
        let root = scratch_repo();
        if let Some(text) = text {
            std::fs::write(root.join(GITATTRIBUTES), text).unwrap();
        }
        let result = plan_split_lines(&root, &config_with(SpecLocation::Auto));
        std::fs::remove_dir_all(&root).unwrap();
        result
    }

    #[test]
    fn a_split_replaces_the_spec_line_in_place() {
        let text = "*.png binary\r\n/docs/planning/spec.md merge=union -diff\r\n*.sh text\r\n";
        let lines = split_lines(Some(text.as_bytes())).unwrap().unwrap();
        assert_eq!(
            lines.preview,
            SplitAttributes {
                line: 2,
                old: "/docs/planning/spec.md merge=union -diff".to_string(),
                new: vec![
                    "/docs/planning/spec/questions.md merge=union -diff".to_string(),
                    "/docs/planning/spec/decisions.md merge=union -diff".to_string(),
                ],
                kept: Vec::new(),
            }
        );
        assert_eq!(lines.old_text, text);
        assert_eq!(
            lines.new_text,
            "*.png binary\r\n/docs/planning/spec/questions.md merge=union -diff\r\n\
             /docs/planning/spec/decisions.md merge=union -diff\r\n*.sh text\r\n"
        );
    }

    #[test]
    fn a_split_replaces_an_unterminated_last_line() {
        let lines = split_lines(Some(b"docs/planning/spec.md merge=union"))
            .unwrap()
            .unwrap();
        assert_eq!(
            lines.new_text,
            "docs/planning/spec/questions.md merge=union\n\
             docs/planning/spec/decisions.md merge=union"
        );
    }

    #[test]
    fn a_split_keeps_the_folder_files_own_settings() {
        let text = "docs/planning/spec.md merge=union\ndocs/planning/spec/decisions.md -merge\n";
        let lines = split_lines(Some(text.as_bytes())).unwrap().unwrap();
        assert_eq!(
            lines.preview.new,
            vec!["docs/planning/spec/questions.md merge=union"]
        );
        assert_eq!(
            lines.preview.kept,
            vec!["docs/planning/spec/decisions.md -merge"]
        );
        assert_eq!(
            lines.new_text,
            "docs/planning/spec/questions.md merge=union\ndocs/planning/spec/decisions.md -merge\n"
        );

        let both = "docs/planning/spec.md merge=union\n\
            docs/planning/spec/questions.md merge=union\n\
            docs/planning/spec/decisions.md merge=union\n";
        let lines = split_lines(Some(both.as_bytes())).unwrap().unwrap();
        assert!(lines.preview.new.is_empty());
        assert_eq!(lines.preview.kept.len(), 2);
        assert_eq!(lines.new_text, both);
    }

    #[test]
    fn a_split_changes_nothing_without_a_union_line_for_spec_md() {
        assert_eq!(split_lines(None), Ok(None));
        assert_eq!(split_lines(Some(b"*.png binary\n")), Ok(None));
        assert_eq!(
            split_lines(Some(
                b"docs/planning/spec.md text\n# docs/planning/spec.md merge=union\n"
            )),
            Ok(None)
        );
        // The user's own setting wins over an earlier union line.
        assert_eq!(
            split_lines(Some(
                b"docs/planning/spec.md merge=union\ndocs/planning/spec.md -merge\n"
            )),
            Ok(None)
        );
        // Text that is no UTF-8 matters only when it may name the spec.
        assert_eq!(split_lines(Some(b"caf\xe9 text\n")), Ok(None));
        assert_eq!(
            split_lines(Some(b"docs/planning/spec.md merge=union # caf\xe9\n")),
            Err(".gitattributes is not UTF-8 text".to_string())
        );
    }

    #[test]
    fn with_path_keeps_quotes_slash_and_attributes() {
        assert_eq!(
            with_path(
                "  \"/my docs/spec.md\"  merge=union",
                "my docs/spec/questions.md"
            )
            .unwrap(),
            "  \"/my docs/spec/questions.md\"  merge=union"
        );
        assert_eq!(
            with_path("a/spec.md\tmerge=union", "a/spec/decisions.md").unwrap(),
            "a/spec/decisions.md\tmerge=union"
        );
    }
}
