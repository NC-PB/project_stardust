//! Adapters (`S-adapters`): agent command files that wrap the prompts of `templates/prompts.md`.
//!
//! Claude Code reads project commands from `.claude/commands/<name>.md`: YAML frontmatter with
//! `description` and `argument-hint`, then the prompt text, where `$ARGUMENTS` stands for what
//! the user types after the command. The tool writes one file per prompt and marks it with the
//! frontmatter line `planner: generated`, which Claude Code ignores as an unknown field. Only
//! files with that line are ever rewritten; any other file at the same path is left alone.

use std::path::Path;

use super::agents_block::{read_optional, write_if_changed};
use super::config::{Adapter, Config};
use super::prompts::{Prompt, fill_from_config, prompt_text};

/// The folder of Claude Code project commands, relative to the repository root.
pub const CLAUDE_COMMANDS_DIR: &str = ".claude/commands";

/// The frontmatter line that marks a command file as written by the tool.
pub const GENERATED_LINE: &str = "planner: generated";

/// What Claude Code substitutes with the command's argument.
const ARGUMENTS: &str = "$ARGUMENTS";

/// The command name of `prompt`, the kebab case of its heading: `work-on-task`.
pub fn command_name(prompt: Prompt) -> String {
    prompt.heading().to_lowercase().replace(' ', "-")
}

/// The path of the Claude Code command file of `prompt`, relative to the repository root.
pub fn claude_command_path(prompt: Prompt) -> String {
    format!("{CLAUDE_COMMANDS_DIR}/{}.md", command_name(prompt))
}

/// The Claude Code command file of `prompt`: the prompt filled from the config, with the task
/// path or node id replaced by `$ARGUMENTS`.
pub fn render_claude_command(
    prompt: Prompt,
    repo_root: &Path,
    config: &Config,
) -> Result<String, String> {
    let template = prompt_text(prompt)?;
    let hint = if template.contains("{task_path}") {
        Some("<task path>")
    } else if template.contains("{node_id}") {
        Some("<node id>")
    } else {
        None
    };
    let body = fill_from_config(&template, repo_root, config)
        .replace("{task_path}", ARGUMENTS)
        .replace("{node_id}", ARGUMENTS);
    let mut text = format!(
        "---\ndescription: {}, a prompt of the planning tool\n",
        prompt.heading()
    );
    if let Some(hint) = hint {
        text.push_str(&format!("argument-hint: \"{hint}\"\n"));
    }
    text.push_str(&format!(
        "{GENERATED_LINE}  # rewritten on every config change; delete this line to keep your own edits\n---\n\n{}\n",
        body.trim_end()
    ));
    Ok(text)
}

/// Whether `text` is a command file the tool wrote: its leading frontmatter has the line
/// `planner: generated`, with or without a comment after it.
pub fn is_generated(text: &str) -> bool {
    let mut lines = text.lines();
    if lines.next().map(str::trim_end) != Some("---") {
        return false;
    }
    lines
        .take_while(|line| line.trim_end() != "---")
        .any(|line| line.split(" #").next().unwrap_or("").trim() == GENERATED_LINE)
}

/// Writes the command files of every adapter in `config.adapters`, adding the paths it wrote
/// to `written`. A file that exists without the generated line is not touched; a generated file
/// whose content would not change is not written. Line endings of an existing file are kept.
pub fn write_adapters(
    repo_root: &Path,
    config: &Config,
    written: &mut Vec<String>,
) -> Result<(), String> {
    for adapter in &config.adapters {
        match adapter {
            Adapter::ClaudeCode => {
                for prompt in Prompt::ALL {
                    let relative = claude_command_path(prompt);
                    let existing = read_optional(repo_root, &relative)?;
                    if existing.as_deref().is_some_and(|text| !is_generated(text)) {
                        continue;
                    }
                    let mut text = render_claude_command(prompt, repo_root, config)?;
                    if existing.as_deref().is_some_and(|old| old.contains("\r\n")) {
                        text = text.replace('\n', "\r\n");
                    }
                    write_if_changed(repo_root, &relative, existing.as_deref(), &text, written)?;
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::agents_block::write_planner_block;
    use std::path::PathBuf;

    fn scratch_repo() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "stardust-adapters-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn claude_config() -> Config {
        Config {
            adapters: vec![Adapter::ClaudeCode],
            ..Config::default()
        }
    }

    #[test]
    fn command_names_follow_the_headings() {
        assert_eq!(command_name(Prompt::WorkOnTask), "work-on-task");
        assert_eq!(
            claude_command_path(Prompt::VerifyArea),
            ".claude/commands/verify-area.md"
        );
    }

    #[test]
    fn a_task_command_takes_the_task_path_as_argument() {
        let text = render_claude_command(
            Prompt::WorkOnTask,
            Path::new("/nonexistent"),
            &Config::default(),
        )
        .unwrap();
        assert!(text.starts_with(
            "---\ndescription: Work on task, a prompt of the planning tool\n\
             argument-hint: \"<task path>\"\nplanner: generated  # "
        ));
        assert!(text.contains("\n---\n\nWork on $ARGUMENTS. Follow the planning conventions"));
        assert!(text.ends_with("to match the code.\n"));
        assert!(is_generated(&text));
    }

    #[test]
    fn commands_wrap_the_same_text_as_the_prompts() {
        let config = Config {
            columns: vec!["backlog".into(), "todo".into(), "shipped".into()],
            terminal: "shipped".into(),
            ..Config::default()
        };
        let root = Path::new("/nonexistent");
        for prompt in Prompt::ALL {
            let text = render_claude_command(prompt, root, &config).unwrap();
            let body = text.split_once("\n---\n\n").unwrap().1.trim_end();
            let input = crate::domain::prompts::PromptInput {
                task_path: Some(ARGUMENTS.into()),
                node_id: Some(ARGUMENTS.into()),
            };
            let filled =
                crate::domain::prompts::fill_prompt(prompt, root, &config, &input).unwrap();
            assert_eq!(body, filled, "{prompt:?}");
            assert!(!body.contains('{'), "{prompt:?}");
        }
        let verify = render_claude_command(Prompt::VerifyArea, root, &config).unwrap();
        assert!(verify.contains("argument-hint: \"<node id>\"\n"));
        assert!(verify.contains("subtree of node $ARGUMENTS in"));
        let triage = render_claude_command(Prompt::TriageInbox, root, &config).unwrap();
        assert!(!triage.contains("argument-hint"));
        assert!(triage.contains("docs/planning/backlog/"));
    }

    #[test]
    fn the_marker_is_only_found_in_the_frontmatter() {
        assert!(is_generated("---\nplanner: generated\n---\ntext\n"));
        assert!(is_generated("---\r\nplanner: generated # note\r\n---\r\n"));
        assert!(!is_generated(
            "---\ndescription: mine\n---\nplanner: generated\n"
        ));
        assert!(!is_generated("planner: generated\n"));
        assert!(!is_generated("---\nplanner: generated-by-me\n---\n"));
    }

    #[test]
    fn writes_one_file_per_prompt_with_the_planner_block() {
        let root = scratch_repo();
        let report = write_planner_block(&root, &claude_config()).unwrap();
        for prompt in Prompt::ALL {
            let path = claude_command_path(prompt);
            assert!(report.written.contains(&path), "{path}");
            let text = std::fs::read_to_string(root.join(&path)).unwrap();
            assert!(is_generated(&text));
        }
        assert_eq!(report.written.len(), 2 + Prompt::ALL.len());
        let again = write_planner_block(&root, &claude_config()).unwrap();
        assert!(again.written.is_empty(), "{:?}", again.written);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn files_the_tool_did_not_write_are_never_touched() {
        let root = scratch_repo();
        let mine = root.join(".claude/commands/work-on-task.md");
        std::fs::create_dir_all(mine.parent().unwrap()).unwrap();
        std::fs::write(&mine, "---\ndescription: mine\n---\nMy own text.\n").unwrap();
        let report = write_planner_block(&root, &claude_config()).unwrap();
        assert!(
            !report
                .written
                .contains(&claude_command_path(Prompt::WorkOnTask))
        );
        assert_eq!(
            std::fs::read_to_string(&mine).unwrap(),
            "---\ndescription: mine\n---\nMy own text.\n"
        );
        assert!(
            report
                .written
                .contains(&claude_command_path(Prompt::Handoff))
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn generated_files_are_regenerated_and_keep_crlf() {
        let root = scratch_repo();
        let path = root.join(".claude/commands/handoff.md");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "---\r\nplanner: generated\r\n---\r\n\r\nold\r\n").unwrap();
        let report = write_planner_block(&root, &claude_config()).unwrap();
        assert!(
            report
                .written
                .contains(&claude_command_path(Prompt::Handoff))
        );
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("The session is ending. In $ARGUMENTS,"));
        assert!(text.contains("\r\n") && !text.replace("\r\n", "").contains('\n'));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn without_adapters_nothing_is_written() {
        let root = scratch_repo();
        let report = write_planner_block(&root, &Config::default()).unwrap();
        assert!(!root.join(".claude").exists());
        assert!(
            report
                .written
                .iter()
                .all(|path| !path.starts_with(".claude"))
        );
        std::fs::remove_dir_all(&root).unwrap();
    }
}
