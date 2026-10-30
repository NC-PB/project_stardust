//! Templates shipped inside the app, with per project overrides (`S-templates`).
//!
//! Every file of `templates/` is embedded with `include_str!`. A project may override
//! `task.md` and `spec.md` by placing a file of the same name in `templates_dir`; the
//! config, the planner block and the prompts always come from the app.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::config::Config;

/// A template the app ships.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum TemplateKind {
    Spec,
    Task,
    Config,
    AgentsBlock,
    Prompts,
}

impl TemplateKind {
    pub const ALL: [TemplateKind; 5] = [
        TemplateKind::Spec,
        TemplateKind::Task,
        TemplateKind::Config,
        TemplateKind::AgentsBlock,
        TemplateKind::Prompts,
    ];

    /// The filename in `templates/` and in `templates_dir`.
    pub fn file_name(self) -> &'static str {
        match self {
            TemplateKind::Spec => "spec.md",
            TemplateKind::Task => "task.md",
            TemplateKind::Config => "planner.yml",
            TemplateKind::AgentsBlock => "AGENTS-block.md",
            TemplateKind::Prompts => "prompts.md",
        }
    }

    /// Whether a project may replace this template from `templates_dir`.
    pub fn overridable(self) -> bool {
        matches!(self, TemplateKind::Spec | TemplateKind::Task)
    }

    /// The text shipped inside the app.
    pub fn builtin(self) -> &'static str {
        match self {
            TemplateKind::Spec => include_str!("../../../templates/spec.md"),
            TemplateKind::Task => include_str!("../../../templates/task.md"),
            TemplateKind::Config => include_str!("../../../templates/planner.yml"),
            TemplateKind::AgentsBlock => include_str!("../../../templates/AGENTS-block.md"),
            TemplateKind::Prompts => include_str!("../../../templates/prompts.md"),
        }
    }
}

/// A resolved template and where its text came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Template {
    pub kind: TemplateKind,
    pub text: String,
    /// The override file the text was read from, relative to the repository root;
    /// `None` for the built in template.
    pub override_path: Option<String>,
    /// Why an existing override file was not used, if one was found but could not be read.
    pub issue: Option<String>,
}

/// The template of `kind` for the repository at `repo_root`. Never fails: an override that
/// cannot be read is reported and the built in template is used.
pub fn resolve(kind: TemplateKind, repo_root: &Path, config: &Config) -> Template {
    let builtin = |issue| Template {
        kind,
        text: kind.builtin().to_string(),
        override_path: None,
        issue,
    };
    if !kind.overridable() {
        return builtin(None);
    }
    let relative = override_path(kind, config);
    match std::fs::read_to_string(repo_root.join(&relative)) {
        Ok(text) => Template {
            kind,
            text,
            override_path: Some(relative.to_string_lossy().replace('\\', "/")),
            issue: None,
        },
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => builtin(None),
        Err(err) => builtin(Some(format!(
            "could not read {}: {err}",
            relative.display()
        ))),
    }
}

fn override_path(kind: TemplateKind, config: &Config) -> PathBuf {
    Path::new(&config.templates_dir).join(kind.file_name())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_repo() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "stardust-templates-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(root.join("docs/templates")).unwrap();
        root
    }

    #[test]
    fn every_template_is_built_in() {
        for kind in TemplateKind::ALL {
            assert!(!kind.builtin().trim().is_empty(), "{kind:?} is empty");
        }
        assert!(
            TemplateKind::Task
                .builtin()
                .contains("## Acceptance criteria")
        );
        assert!(
            TemplateKind::AgentsBlock
                .builtin()
                .contains("planner:start")
        );
    }

    #[test]
    fn without_overrides_the_built_in_templates_are_used() {
        let root = scratch_repo();
        let config = Config::default();
        let templates: Vec<_> = TemplateKind::ALL
            .iter()
            .map(|&kind| resolve(kind, &root, &config))
            .collect();
        std::fs::remove_dir_all(&root).unwrap();

        for template in templates {
            assert_eq!(template.text, template.kind.builtin());
            assert_eq!(template.override_path, None);
            assert_eq!(template.issue, None);
        }
    }

    #[test]
    fn task_and_spec_are_taken_from_templates_dir() {
        let root = scratch_repo();
        std::fs::write(root.join("docs/templates/task.md"), "own task").unwrap();
        std::fs::write(root.join("docs/templates/spec.md"), "own spec").unwrap();
        let config = Config::default();
        let task = resolve(TemplateKind::Task, &root, &config);
        let spec = resolve(TemplateKind::Spec, &root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(task.text, "own task");
        assert_eq!(
            task.override_path.as_deref(),
            Some("docs/templates/task.md")
        );
        assert_eq!(spec.text, "own spec");
        assert_eq!(
            spec.override_path.as_deref(),
            Some("docs/templates/spec.md")
        );
    }

    #[test]
    fn templates_dir_from_the_config_is_used() {
        let root = scratch_repo();
        std::fs::create_dir_all(root.join("plan/tpl")).unwrap();
        std::fs::write(root.join("plan/tpl/task.md"), "own task").unwrap();
        std::fs::write(root.join("docs/templates/task.md"), "default dir").unwrap();
        let config = Config {
            templates_dir: "plan/tpl".into(),
            ..Config::default()
        };
        let task = resolve(TemplateKind::Task, &root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(task.text, "own task");
        assert_eq!(task.override_path.as_deref(), Some("plan/tpl/task.md"));
    }

    #[test]
    fn config_block_and_prompts_are_never_overridden() {
        let root = scratch_repo();
        for kind in [
            TemplateKind::Config,
            TemplateKind::AgentsBlock,
            TemplateKind::Prompts,
        ] {
            std::fs::write(root.join("docs/templates").join(kind.file_name()), "own").unwrap();
        }
        let config = Config::default();
        let templates: Vec<_> = [
            TemplateKind::Config,
            TemplateKind::AgentsBlock,
            TemplateKind::Prompts,
        ]
        .iter()
        .map(|&kind| resolve(kind, &root, &config))
        .collect();
        std::fs::remove_dir_all(&root).unwrap();

        for template in templates {
            assert!(!template.kind.overridable());
            assert_eq!(template.text, template.kind.builtin());
            assert_eq!(template.override_path, None);
        }
    }

    #[test]
    fn an_unreadable_override_is_reported_and_the_built_in_is_used() {
        let root = scratch_repo();
        // A directory where the file should be cannot be read as text.
        std::fs::create_dir_all(root.join("docs/templates/task.md")).unwrap();
        let task = resolve(TemplateKind::Task, &root, &Config::default());
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(task.text, TemplateKind::Task.builtin());
        assert_eq!(task.override_path, None);
        assert!(task.issue.unwrap().contains("docs/templates/task.md"));
    }
}
