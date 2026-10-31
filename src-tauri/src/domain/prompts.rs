//! Prompt buttons (`S-prompts`): the prompts of `templates/prompts.md`, filled for one task
//! or the whole project, ready to paste into an agent.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::agents_block::spec_location;
use super::columns::fill_columns;
use super::config::Config;
use super::templates::TemplateKind;

/// A prompt of `templates/prompts.md`, named after its `## ` heading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Prompt {
    WorkOnTask,
    VerifyTask,
    VerifyArea,
    Handoff,
    TriageInbox,
    StructureThis,
    InterviewMe,
    IntegrateAnswers,
    GenerateTasks,
}

impl Prompt {
    pub const ALL: [Prompt; 9] = [
        Prompt::WorkOnTask,
        Prompt::VerifyTask,
        Prompt::VerifyArea,
        Prompt::Handoff,
        Prompt::TriageInbox,
        Prompt::StructureThis,
        Prompt::InterviewMe,
        Prompt::IntegrateAnswers,
        Prompt::GenerateTasks,
    ];

    /// The heading of the prompt in `templates/prompts.md`.
    pub fn heading(self) -> &'static str {
        match self {
            Prompt::WorkOnTask => "Work on task",
            Prompt::VerifyTask => "Verify task",
            Prompt::VerifyArea => "Verify area",
            Prompt::Handoff => "Handoff",
            Prompt::TriageInbox => "Triage inbox",
            Prompt::StructureThis => "Structure this",
            Prompt::InterviewMe => "Interview me",
            Prompt::IntegrateAnswers => "Integrate answers",
            Prompt::GenerateTasks => "Generate tasks",
        }
    }
}

/// What a prompt is filled with besides the config.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PromptInput {
    /// The task file, relative to the repository root, with `/`.
    pub task_path: Option<String>,
    /// A Structure node such as `S-board`.
    pub node_id: Option<String>,
}

/// The text of `prompt` from the built in `templates/prompts.md`, unfilled.
pub fn prompt_text(prompt: Prompt) -> Result<String, String> {
    prompt_in(TemplateKind::Prompts.builtin(), prompt.heading())
        .ok_or_else(|| format!("the prompt \"{}\" is missing", prompt.heading()))
}

/// `prompt` filled for the repository at `repo_root`. A placeholder without a value is an error,
/// so a half filled prompt never reaches the clipboard.
pub fn fill_prompt(
    prompt: Prompt,
    repo_root: &Path,
    config: &Config,
    input: &PromptInput,
) -> Result<String, String> {
    let mut text = fill_from_config(&prompt_text(prompt)?, repo_root, config);
    for (placeholder, value, what) in [
        ("{task_path}", &input.task_path, "a task"),
        ("{node_id}", &input.node_id, "a node"),
    ] {
        if !text.contains(placeholder) {
            continue;
        }
        let value = value
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("\"{}\" needs {what}", prompt.heading()))?;
        text = text.replace(placeholder, value);
    }
    Ok(text)
}

/// `text` with the placeholders that come from the config filled: `{planning_root}`,
/// `{spec_location}` and the column names. `{task_path}` and `{node_id}` stay.
pub fn fill_from_config(text: &str, repo_root: &Path, config: &Config) -> String {
    let text = text
        .replace("{planning_root}", &config.planning_root)
        .replace("{spec_location}", &spec_location(config, repo_root));
    fill_columns(&text, config)
}

/// The fenced block under `## heading` in `markdown`, without the fences.
fn prompt_in(markdown: &str, heading: &str) -> Option<String> {
    let mut lines = markdown.lines();
    lines.find(|line| {
        line.strip_prefix("## ")
            .is_some_and(|title| title.trim() == heading)
    })?;
    let fence = lines
        .by_ref()
        .take_while(|line| !line.starts_with("## "))
        .find(|line| line.trim_start().starts_with("```"))?
        .trim_start();
    let fence = &fence[..fence.len() - fence.trim_start_matches('`').len()];
    let body: Vec<&str> = lines
        .take_while(|line| line.trim_start() != fence)
        .collect();
    Some(body.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(task_path: Option<&str>) -> PromptInput {
        PromptInput {
            task_path: task_path.map(str::to_string),
            node_id: None,
        }
    }

    #[test]
    fn every_prompt_is_in_the_template() {
        for prompt in Prompt::ALL {
            let text = prompt_text(prompt).unwrap();
            assert!(!text.trim().is_empty(), "{prompt:?}");
            assert!(!text.contains("```"), "{prompt:?}");
        }
    }

    #[test]
    fn fills_the_task_and_the_config() {
        let config = Config::default();
        let text = fill_prompt(
            Prompt::VerifyTask,
            Path::new("/nonexistent"),
            &config,
            &input(Some("docs/planning/next/a.md")),
        )
        .unwrap();
        assert_eq!(
            text,
            "Verify docs/planning/next/a.md against the code. For every acceptance criterion \
             report pass or fail with the evidence (file, function, test). Change nothing. Do \
             not move the file."
        );
        let triage = fill_prompt(
            Prompt::TriageInbox,
            Path::new("/nonexistent"),
            &config,
            &input(None),
        )
        .unwrap();
        assert!(triage.starts_with("Read every task in docs/planning/inbox/."));
        let structure = fill_prompt(
            Prompt::StructureThis,
            Path::new("/nonexistent"),
            &config,
            &input(None),
        )
        .unwrap();
        assert!(structure.contains("create docs/planning/spec.md "));
    }

    #[test]
    fn names_the_configured_columns() {
        let config = Config {
            columns: vec!["backlog".into(), "todo".into(), "shipped".into()],
            terminal: "shipped".into(),
            ..Config::default()
        };
        let root = Path::new("/nonexistent");
        let triage = fill_prompt(Prompt::TriageInbox, root, &config, &input(None)).unwrap();
        assert!(triage.starts_with("Read every task in docs/planning/backlog/."));
        assert!(triage.contains("move it to docs/planning/todo/ "));
        assert!(triage.contains("leave it in backlog/ "));
        let generate = fill_prompt(Prompt::GenerateTasks, root, &config, &input(None)).unwrap();
        assert!(generate.contains("create task files in docs/planning/backlog/ "));
        for prompt in Prompt::ALL {
            let text = prompt_text(prompt).unwrap();
            let filled = fill_columns(&text, &config);
            assert!(!filled.contains("_column}"), "{prompt:?}");
        }
    }

    #[test]
    fn a_missing_value_is_an_error() {
        let config = Config::default();
        let root = Path::new("/nonexistent");
        for blank in [None, Some(" ")] {
            let err = fill_prompt(Prompt::Handoff, root, &config, &input(blank)).unwrap_err();
            assert!(err.contains("needs a task"), "{err}");
        }
        let err = fill_prompt(Prompt::VerifyArea, root, &config, &input(None)).unwrap_err();
        assert!(err.contains("needs a node"), "{err}");
    }

    #[test]
    fn reads_only_the_block_of_its_heading() {
        let markdown = "## A\n\n```\none\ntwo\n```\n\n## B\n\n````\n```\nnested\n```\n````\n";
        assert_eq!(prompt_in(markdown, "A").as_deref(), Some("one\ntwo"));
        assert_eq!(
            prompt_in(markdown, "B").as_deref(),
            Some("```\nnested\n```")
        );
        assert_eq!(prompt_in(markdown, "C"), None);
        assert_eq!(prompt_in("## A\ntext only\n## B\n```\nx\n```", "A"), None);
    }
}
