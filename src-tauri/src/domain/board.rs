//! Moving tasks between columns (`S-board-dnd`, `R-one-column`, `R-no-destroy`).
//!
//! A move renames the file into the other column folder and then writes `completed`: set to
//! today when the target is the terminal column, removed when the source is. When that write
//! fails the file is renamed back, so a failed move leaves the task where it was.

use std::path::Path;

use super::config::Config;
use super::task::{self, FieldValue};

/// Moves the task file `file_name` from column `from` to column `to` of the repository at
/// `repo_root`. `today` is the `completed` date (`YYYY-MM-DD`) for a move into the terminal
/// column. An existing file in the target column is never overwritten.
pub fn move_task(
    repo_root: &Path,
    config: &Config,
    file_name: &str,
    from: &str,
    to: &str,
    today: &str,
) -> Result<(), String> {
    for column in [from, to] {
        if !config.columns.iter().any(|listed| listed == column) {
            return Err(format!("`{column}` is not a column"));
        }
    }
    if from == to {
        return Ok(());
    }
    let plain = !file_name.is_empty() && file_name != ".." && !file_name.contains(['/', '\\']);
    if !plain {
        return Err(format!("`{file_name}` is not a file name"));
    }

    let planning = repo_root.join(&config.planning_root);
    let source = planning.join(from).join(file_name);
    let target_dir = planning.join(to);
    let target = target_dir.join(file_name);
    if !target_dir.is_dir() {
        return Err(format!("No folder for column `{to}`"));
    }
    if target.exists() {
        return Err(format!("`{to}` already has a file named `{file_name}`"));
    }
    let text = std::fs::read_to_string(&source)
        .map_err(|err| format!("Cannot read `{from}/{file_name}`: {err}"))?;
    let written = if to == config.terminal {
        task::set_field(&text, "completed", &FieldValue::Text(today.to_string()))?
    } else if from == config.terminal {
        task::remove_field(&text, "completed")?
    } else {
        text.clone()
    };

    std::fs::rename(&source, &target)
        .map_err(|err| format!("Cannot move `{file_name}` to `{to}`: {err}"))?;
    if written != text
        && let Err(err) = std::fs::write(&target, written)
    {
        let _ = std::fs::rename(&target, &source);
        return Err(format!("Cannot write `completed` of `{file_name}`: {err}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{config, ids};
    use std::path::PathBuf;

    const TODAY: &str = "2026-10-30";
    const FILE: &str = "20261030-220009-9c40-drag-and-drop.md";

    /// A repository with the default config and its three column folders.
    fn scratch_repo() -> (PathBuf, Config) {
        let root = std::env::temp_dir().join(format!("stardust-board-{}", ids::random_suffix()));
        for column in ["inbox", "next", "done"] {
            std::fs::create_dir_all(root.join("docs/planning").join(column)).unwrap();
        }
        let config = config::load_config(&root).config;
        (root, config)
    }

    fn put(root: &Path, column: &str, text: &str) {
        std::fs::write(root.join("docs/planning").join(column).join(FILE), text).unwrap();
    }

    fn read(root: &Path, column: &str) -> Option<String> {
        std::fs::read_to_string(root.join("docs/planning").join(column).join(FILE)).ok()
    }

    #[test]
    fn moves_the_file_and_keeps_its_text_between_open_columns() {
        let (root, config) = scratch_repo();
        let text = "---\nid: 20261030-220009-9c40\ntitle: Drag\n---\n\nBody\n";
        put(&root, "inbox", text);
        let result = move_task(&root, &config, FILE, "inbox", "next", TODAY);
        let (inbox, next) = (read(&root, "inbox"), read(&root, "next"));
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(result, Ok(()));
        assert_eq!(inbox, None);
        assert_eq!(next.as_deref(), Some(text));
    }

    #[test]
    fn moving_into_the_terminal_column_sets_completed_to_today() {
        let (root, config) = scratch_repo();
        put(
            &root,
            "next",
            "---\ntitle: Drag\ncompleted: 2026-01-01\n---\n",
        );
        let result = move_task(&root, &config, FILE, "next", "done", TODAY);
        let done = read(&root, "done");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(result, Ok(()));
        assert_eq!(
            done.as_deref(),
            Some("---\ntitle: Drag\ncompleted: 2026-10-30\n---\n")
        );
    }

    #[test]
    fn moving_out_of_the_terminal_column_removes_completed() {
        let (root, config) = scratch_repo();
        put(
            &root,
            "done",
            "---\ntitle: Drag\ncompleted: 2026-10-29\ntags: [a]\n---\n",
        );
        let result = move_task(&root, &config, FILE, "done", "inbox", TODAY);
        let inbox = read(&root, "inbox");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(result, Ok(()));
        assert_eq!(inbox.as_deref(), Some("---\ntitle: Drag\ntags: [a]\n---\n"));
    }

    #[test]
    fn never_overwrites_a_file_in_the_target_column() {
        let (root, config) = scratch_repo();
        put(&root, "inbox", "mine");
        put(&root, "next", "theirs");
        let result = move_task(&root, &config, FILE, "inbox", "next", TODAY);
        let (inbox, next) = (read(&root, "inbox"), read(&root, "next"));
        std::fs::remove_dir_all(&root).unwrap();

        assert!(result.unwrap_err().contains("already has"));
        assert_eq!(inbox.as_deref(), Some("mine"));
        assert_eq!(next.as_deref(), Some("theirs"));
    }

    #[test]
    fn refuses_a_column_without_folder_or_outside_the_config() {
        let (root, config) = scratch_repo();
        put(&root, "inbox", "text");
        std::fs::remove_dir(root.join("docs/planning/next")).unwrap();
        let missing = move_task(&root, &config, FILE, "inbox", "next", TODAY);
        let unknown = move_task(&root, &config, FILE, "inbox", "notes", TODAY);
        let inbox = read(&root, "inbox");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(missing, Err("No folder for column `next`".to_string()));
        assert_eq!(unknown, Err("`notes` is not a column".to_string()));
        assert_eq!(inbox.as_deref(), Some("text"));
    }

    #[test]
    fn refuses_paths_as_file_names_and_reports_a_missing_file() {
        let (root, config) = scratch_repo();
        let escape = move_task(&root, &config, "../spec.md", "inbox", "next", TODAY);
        let missing = move_task(&root, &config, FILE, "inbox", "next", TODAY);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(escape, Err("`../spec.md` is not a file name".to_string()));
        assert!(missing.unwrap_err().starts_with("Cannot read"));
    }

    #[test]
    fn a_move_within_one_column_changes_nothing() {
        let (root, config) = scratch_repo();
        put(&root, "done", "---\ntitle: Drag\n---\n");
        let result = move_task(&root, &config, FILE, "done", "done", TODAY);
        let done = read(&root, "done");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(result, Ok(()));
        assert_eq!(done.as_deref(), Some("---\ntitle: Drag\n---\n"));
    }
}
