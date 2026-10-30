//! The project config `docs/planner.yml` (`S-config`).
//!
//! Every key is optional. Defaults come from `templates/planner.yml`, so the shipped template
//! and the code cannot drift. Each key is read on its own: an invalid value is reported with
//! its key and replaced by the default, and the rest of the file still applies.

use std::path::{Component, Path};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value};
use specta::Type;

use super::templates::TemplateKind;

/// Location of the config, relative to the repository root.
pub const CONFIG_PATH: &str = "docs/planner.yml";

/// The contents of `docs/planner.yml`. Paths are relative to the repository root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub planning_root: String,
    pub images_root: String,
    pub templates_dir: String,
    /// Column folders under the planning root, in display order.
    pub columns: Vec<String>,
    /// The column that means finished; always one of `columns`.
    pub terminal: String,
    /// Folders under the planning root that hold notes, not tasks.
    pub notes: Vec<String>,
    pub spec: SpecLocation,
    pub stale_after_days: u32,
    pub review_after_days: u32,
    pub gate: GateConfig,
    pub agents_file: String,
    pub claude_import: bool,
    pub claude_mirror: bool,
    pub adapters: Vec<Adapter>,
}

/// Which form of the spec to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SpecLocation {
    /// `spec/` if the folder exists, otherwise `spec.md`.
    Auto,
    /// Always `spec.md`.
    File,
    /// Always the `spec/` folder.
    Folder,
}

/// Which checks the gate applies (`S-gate`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct GateConfig {
    pub no_open_blocking_questions: bool,
    pub nodes_ticked_and_specified: bool,
    pub rules_referenced: bool,
}

/// Agent command file generators (`S-adapters`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Adapter {
    ClaudeCode,
}

impl Default for Config {
    fn default() -> Self {
        serde_norway::from_str(TemplateKind::Config.builtin())
            .expect("templates/planner.yml is a complete, valid config")
    }
}

/// A problem in the config. The value it concerns has been replaced by its default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ConfigIssue {
    /// The key, `gate.` prefixed for gate keys; `None` for problems with the whole file.
    pub key: Option<String>,
    pub message: String,
}

/// The loaded config and everything wrong with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ConfigReport {
    pub config: Config,
    /// Whether `docs/planner.yml` exists. Without it every value is a default.
    pub found: bool,
    pub issues: Vec<ConfigIssue>,
    /// Entries of `columns` with no folder under the planning root.
    pub missing_columns: Vec<String>,
}

/// Reads `docs/planner.yml` under `repo_root`. Never fails: problems are reported in the
/// result and the affected values fall back to their defaults.
pub fn load_config(repo_root: &Path) -> ConfigReport {
    let path = repo_root.join(CONFIG_PATH);
    let (config, found, issues) = match std::fs::read_to_string(&path) {
        Ok(text) => {
            let (config, issues) = parse_config(&text);
            (config, true, issues)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            (Config::default(), false, Vec::new())
        }
        Err(err) => (
            Config::default(),
            true,
            vec![file_issue(format!("could not read {CONFIG_PATH}: {err}"))],
        ),
    };
    let missing_columns = missing_columns(repo_root, &config);
    ConfigReport {
        config,
        found,
        issues,
        missing_columns,
    }
}

/// Parses the text of a config file, key by key.
pub fn parse_config(text: &str) -> (Config, Vec<ConfigIssue>) {
    let mut config = Config::default();
    let mut issues = Vec::new();
    let entries = match serde_norway::from_str::<Value>(text) {
        Ok(Value::Mapping(entries)) => entries,
        // An empty file or one with only comments.
        Ok(Value::Null) => Mapping::new(),
        Ok(_) => {
            issues.push(file_issue(format!(
                "{CONFIG_PATH} must be a list of `key: value` lines"
            )));
            return (config, issues);
        }
        Err(err) => {
            issues.push(file_issue(format!(
                "{CONFIG_PATH} is not valid YAML: {err}"
            )));
            return (config, issues);
        }
    };
    for (key, value) in entries {
        let key = key_name(&key);
        if let Err(message) = apply(&mut config, &key, value, &mut issues) {
            issues.push(key_issue(&key, message));
        }
    }
    check_terminal(&mut config, &mut issues);
    (config, issues)
}

/// Sets one top-level key. Leaves the default in place and returns the problem on failure.
fn apply(
    config: &mut Config,
    key: &str,
    value: Value,
    issues: &mut Vec<ConfigIssue>,
) -> Result<(), String> {
    match key {
        "planning_root" => set(&mut config.planning_root, value, check_relative_path),
        "images_root" => set(&mut config.images_root, value, check_relative_path),
        "templates_dir" => set(&mut config.templates_dir, value, check_relative_path),
        "agents_file" => set(&mut config.agents_file, value, check_relative_path),
        "columns" => set(&mut config.columns, value, check_columns),
        "terminal" => set(&mut config.terminal, value, no_check),
        "notes" => set(&mut config.notes, value, check_folder_names),
        "spec" => set(&mut config.spec, value, no_check),
        "stale_after_days" => set(&mut config.stale_after_days, value, check_days),
        "review_after_days" => set(&mut config.review_after_days, value, check_days),
        "claude_import" => set(&mut config.claude_import, value, no_check),
        "claude_mirror" => set(&mut config.claude_mirror, value, no_check),
        "adapters" => set(&mut config.adapters, value, no_check),
        "gate" => {
            apply_gate(&mut config.gate, value, issues);
            Ok(())
        }
        _ => Err("unknown key, ignored".to_string()),
    }
}

fn apply_gate(gate: &mut GateConfig, value: Value, issues: &mut Vec<ConfigIssue>) {
    let entries = match value {
        Value::Mapping(entries) => entries,
        Value::Null => return,
        _ => {
            issues.push(key_issue(
                "gate",
                "must be a list of `key: value` lines".into(),
            ));
            return;
        }
    };
    for (key, value) in entries {
        let key = key_name(&key);
        let result = match key.as_str() {
            "no_open_blocking_questions" => {
                set(&mut gate.no_open_blocking_questions, value, no_check)
            }
            "nodes_ticked_and_specified" => {
                set(&mut gate.nodes_ticked_and_specified, value, no_check)
            }
            "rules_referenced" => set(&mut gate.rules_referenced, value, no_check),
            _ => Err("unknown key, ignored".to_string()),
        };
        if let Err(message) = result {
            issues.push(key_issue(&format!("gate.{key}"), message));
        }
    }
}

/// Deserializes `value` and runs `check` on it; writes `slot` only when both succeed.
fn set<T: DeserializeOwned>(
    slot: &mut T,
    value: Value,
    check: fn(&T) -> Result<(), String>,
) -> Result<(), String> {
    let parsed: T = serde_norway::from_value(value).map_err(|err| {
        err.to_string()
            .replace("expected u32", "expected a whole number")
    })?;
    check(&parsed)?;
    *slot = parsed;
    Ok(())
}

/// A key as written; non-string keys such as `1:` are shown in YAML form.
fn key_name(key: &Value) -> String {
    match key {
        Value::String(key) => key.clone(),
        other => serde_norway::to_string(other)
            .map(|text| text.trim_end().to_string())
            .unwrap_or_default(),
    }
}

fn no_check<T>(_: &T) -> Result<(), String> {
    Ok(())
}

/// A path inside the repository: not empty, not absolute, no `..`.
#[allow(clippy::ptr_arg)] // `set` passes `&T`, here `&String`.
fn check_relative_path(path: &String) -> Result<(), String> {
    let inside_repo = Path::new(path)
        .components()
        .all(|part| matches!(part, Component::Normal(_) | Component::CurDir));
    if path.trim().is_empty() || !inside_repo {
        return Err(format!(
            "`{path}` must be a path relative to the repository root"
        ));
    }
    Ok(())
}

#[allow(clippy::ptr_arg)] // `set` passes `&T`, here `&Vec<String>`.
fn check_columns(columns: &Vec<String>) -> Result<(), String> {
    if columns.is_empty() {
        return Err("needs at least one column".to_string());
    }
    check_folder_names(columns)
}

/// Plain folder names directly under the planning root, each listed once.
#[allow(clippy::ptr_arg)] // `set` passes `&T`, here `&Vec<String>`.
fn check_folder_names(names: &Vec<String>) -> Result<(), String> {
    for (i, name) in names.iter().enumerate() {
        let plain =
            !name.trim().is_empty() && name != "." && name != ".." && !name.contains(['/', '\\']);
        if !plain {
            return Err(format!("`{name}` must be a single folder name"));
        }
        if names[..i].contains(name) {
            return Err(format!("`{name}` is listed twice"));
        }
    }
    Ok(())
}

fn check_days(days: &u32) -> Result<(), String> {
    if *days == 0 {
        return Err("must be at least 1".to_string());
    }
    Ok(())
}

/// The terminal column must be one of the columns. Otherwise the last column takes its place,
/// because the final column of a board is where finished work ends up.
fn check_terminal(config: &mut Config, issues: &mut Vec<ConfigIssue>) {
    if config.columns.contains(&config.terminal) {
        return;
    }
    let fallback = config
        .columns
        .last()
        .expect("columns is never empty")
        .clone();
    issues.push(key_issue(
        "terminal",
        format!(
            "`{}` is not one of the columns; using `{fallback}`",
            config.terminal
        ),
    ));
    config.terminal = fallback;
}

/// Columns whose folder does not exist under the planning root.
pub fn missing_columns(repo_root: &Path, config: &Config) -> Vec<String> {
    let planning_root = repo_root.join(&config.planning_root);
    config
        .columns
        .iter()
        .filter(|column| !planning_root.join(column).is_dir())
        .cloned()
        .collect()
}

fn key_issue(key: &str, message: String) -> ConfigIssue {
    ConfigIssue {
        key: Some(key.to_string()),
        message,
    }
}

fn file_issue(message: String) -> ConfigIssue {
    ConfigIssue { key: None, message }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(issues: &[ConfigIssue]) -> Vec<Option<&str>> {
        issues.iter().map(|issue| issue.key.as_deref()).collect()
    }

    #[test]
    fn defaults_come_from_the_template() {
        let config = Config::default();
        assert_eq!(config.planning_root, "docs/planning");
        assert_eq!(config.images_root, "docs/images");
        assert_eq!(config.templates_dir, "docs/templates");
        assert_eq!(config.columns, ["inbox", "next", "done"]);
        assert_eq!(config.terminal, "done");
        assert_eq!(config.notes, ["notes"]);
        assert_eq!(config.spec, SpecLocation::Auto);
        assert_eq!(config.stale_after_days, 14);
        assert_eq!(config.review_after_days, 30);
        assert!(config.gate.no_open_blocking_questions);
        assert!(config.gate.nodes_ticked_and_specified);
        assert!(config.gate.rules_referenced);
        assert_eq!(config.agents_file, "AGENTS.md");
        assert!(config.claude_import);
        assert!(!config.claude_mirror);
        assert!(config.adapters.is_empty());
    }

    #[test]
    fn the_template_parses_without_issues() {
        let (config, issues) = parse_config(TemplateKind::Config.builtin());
        assert_eq!(issues, []);
        assert_eq!(config, Config::default());
    }

    #[test]
    fn empty_and_comment_only_files_give_defaults() {
        for text in ["", "# nothing here\n"] {
            let (config, issues) = parse_config(text);
            assert_eq!(issues, [], "{text:?}");
            assert_eq!(config, Config::default());
        }
    }

    #[test]
    fn missing_keys_take_defaults() {
        let (config, issues) =
            parse_config("columns: [todo, doing, finished]\nterminal: finished\n");
        assert_eq!(issues, []);
        assert_eq!(config.columns, ["todo", "doing", "finished"]);
        assert_eq!(config.terminal, "finished");
        assert_eq!(config.planning_root, "docs/planning");
        assert_eq!(config.stale_after_days, 14);
    }

    #[test]
    fn reads_a_full_file() {
        let text = "\
planning_root: plan
images_root: plan/img
templates_dir: plan/templates
columns: [backlog, doing, shipped]
terminal: shipped
notes: [notes, research]
spec: folder
stale_after_days: 7
review_after_days: 60
gate:
  no_open_blocking_questions: false
  nodes_ticked_and_specified: true
  rules_referenced: false
agents_file: docs/AGENTS.md
claude_import: false
claude_mirror: true
adapters: [claude-code]
";
        let (config, issues) = parse_config(text);
        assert_eq!(issues, []);
        assert_eq!(
            config,
            Config {
                planning_root: "plan".into(),
                images_root: "plan/img".into(),
                templates_dir: "plan/templates".into(),
                columns: vec!["backlog".into(), "doing".into(), "shipped".into()],
                terminal: "shipped".into(),
                notes: vec!["notes".into(), "research".into()],
                spec: SpecLocation::Folder,
                stale_after_days: 7,
                review_after_days: 60,
                gate: GateConfig {
                    no_open_blocking_questions: false,
                    nodes_ticked_and_specified: true,
                    rules_referenced: false,
                },
                agents_file: "docs/AGENTS.md".into(),
                claude_import: false,
                claude_mirror: true,
                adapters: vec![Adapter::ClaudeCode],
            }
        );
    }

    #[test]
    fn invalid_values_are_named_and_replaced_by_defaults() {
        let text = "\
stale_after_days: soon
review_after_days: 0
spec: everywhere
claude_import: maybe
adapters: [cursor]
planning_root: /etc
images_root: ../outside
notes: [a/b]
gate:
  rules_referenced: 3
  typo: true
colour: blue
";
        let (config, issues) = parse_config(text);
        assert_eq!(
            keys(&issues),
            [
                Some("stale_after_days"),
                Some("review_after_days"),
                Some("spec"),
                Some("claude_import"),
                Some("adapters"),
                Some("planning_root"),
                Some("images_root"),
                Some("notes"),
                Some("gate.rules_referenced"),
                Some("gate.typo"),
                Some("colour"),
            ]
        );
        assert_eq!(config, Config::default());
        assert!(issues.iter().all(|issue| !issue.message.is_empty()));
        assert!(
            issues[0].message.ends_with("expected a whole number"),
            "{}",
            issues[0].message
        );
    }

    #[test]
    fn valid_keys_still_apply_next_to_invalid_ones() {
        let (config, issues) = parse_config("stale_after_days: -1\nreview_after_days: 5\n");
        assert_eq!(keys(&issues), [Some("stale_after_days")]);
        assert_eq!(config.stale_after_days, 14);
        assert_eq!(config.review_after_days, 5);
    }

    #[test]
    fn bad_columns_fall_back_to_the_defaults() {
        for columns in ["[]", "[todo, todo]", "[todo, ../x]", "todo"] {
            let (config, issues) = parse_config(&format!("columns: {columns}\n"));
            assert_eq!(keys(&issues), [Some("columns")], "{columns}");
            assert_eq!(config.columns, ["inbox", "next", "done"]);
        }
    }

    #[test]
    fn terminal_outside_the_columns_falls_back_to_the_last_column() {
        let (config, issues) = parse_config("columns: [todo, doing, finished]\n");
        assert_eq!(keys(&issues), [Some("terminal")]);
        assert_eq!(config.terminal, "finished");
        assert!(
            issues[0].message.contains("`done`"),
            "{}",
            issues[0].message
        );
    }

    #[test]
    fn broken_yaml_is_a_file_issue_with_defaults() {
        for text in ["columns: [inbox\n", "- just\n- a list\n"] {
            let (config, issues) = parse_config(text);
            assert_eq!(keys(&issues), [None], "{text:?}");
            assert_eq!(config, Config::default());
        }
    }

    #[test]
    fn load_reports_missing_file_and_missing_columns() {
        let root = std::env::temp_dir().join(format!(
            "stardust-config-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(root.join("docs/planning/inbox")).unwrap();

        let without_file = load_config(&root);
        assert!(!without_file.found);
        assert_eq!(without_file.issues, []);
        assert_eq!(without_file.missing_columns, ["next", "done"]);

        std::fs::write(root.join(CONFIG_PATH), "columns: [inbox, done]\n").unwrap();
        std::fs::create_dir_all(root.join("docs/planning/done")).unwrap();
        let with_file = load_config(&root);
        std::fs::remove_dir_all(&root).unwrap();

        assert!(with_file.found);
        assert_eq!(with_file.issues, []);
        assert_eq!(with_file.config.columns, ["inbox", "done"]);
        assert_eq!(with_file.missing_columns, Vec::<String>::new());
    }

    #[test]
    fn this_repository_config_loads_cleanly() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let report = load_config(repo_root);
        assert!(report.found);
        assert_eq!(report.issues, []);
        assert_eq!(report.missing_columns, Vec::<String>::new());
    }
}
