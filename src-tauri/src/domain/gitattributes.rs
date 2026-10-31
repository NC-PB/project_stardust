//! `.gitattributes` lines that merge the append-only spec files by union (`S-gitattributes`).
//!
//! Questions and Decisions only grow (`R-append-only`), so two branches that each append an
//! entry conflict at the same place. Git's built-in `union` merge driver keeps the lines of both
//! sides instead. The tool writes the lines into `.gitattributes`, a plain file; it never runs
//! git (`R-no-git-writes`).

use std::io::ErrorKind;
use std::path::{Component, Path};

use serde::Serialize;
use specta::Type;

use super::config::Config;
use super::files::{self, SaveOutcome};
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
    let form = spec::spec_form(config, repo_root);
    let files = match form {
        SpecForm::File => vec![path(&[SPEC_FILE])],
        SpecForm::Folder => FOLDER_APPEND_ONLY
            .iter()
            .map(|name| path(&[SPEC_FOLDER, name]))
            .collect(),
    };
    (form, files)
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
}
