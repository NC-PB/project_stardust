//! The planner block in `AGENTS.md` (`S-agents-block`).
//!
//! The block is rendered from `templates/AGENTS-block.md` with placeholders filled from the
//! config and written between `<!-- planner:start -->` and `<!-- planner:end -->`. Text
//! outside the markers is never touched.

use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::config::{Config, SpecLocation};
use super::templates::TemplateKind;

pub const START_MARKER: &str = "<!-- planner:start -->";
pub const END_MARKER: &str = "<!-- planner:end -->";

/// The file `claude_import` and `claude_mirror` write to, at the repository root.
pub const CLAUDE_FILE: &str = "CLAUDE.md";

/// The block for `config`, from the start marker to the end marker, without a final newline.
/// `repo_root` decides `spec: auto`.
pub fn render_block(config: &Config, repo_root: &Path) -> String {
    TemplateKind::AgentsBlock
        .builtin()
        .trim_end()
        .replace("{planning_root}", &config.planning_root)
        .replace("{spec_location}", &spec_location(config, repo_root))
}

/// The spec path agents are pointed to, relative to the repository root.
pub fn spec_location(config: &Config, repo_root: &Path) -> String {
    let root = &config.planning_root;
    let folder = match config.spec {
        SpecLocation::File => false,
        SpecLocation::Folder => true,
        SpecLocation::Auto => repo_root.join(root).join("spec").is_dir(),
    };
    if folder {
        format!("{root}/spec/")
    } else {
        format!("{root}/spec.md")
    }
}

/// `existing` with `block` between the markers. Without markers the block is appended; without
/// a file (`None`) the block is the whole file. Line endings follow the existing text.
/// Fails when only one marker is present or they are out of order, rather than guess.
pub fn insert_block(existing: Option<&str>, block: &str) -> Result<String, String> {
    let Some(text) = existing else {
        return Ok(format!("{block}\n"));
    };
    let block = if text.contains("\r\n") {
        block.replace('\n', "\r\n")
    } else {
        block.to_string()
    };
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    match (text.find(START_MARKER), text.find(END_MARKER)) {
        (Some(start), Some(end)) if start < end => {
            let end = end + END_MARKER.len();
            Ok(format!("{}{block}{}", &text[..start], &text[end..]))
        }
        (None, None) if text.trim().is_empty() => Ok(format!("{block}{newline}")),
        (None, None) => {
            let separator = if text.ends_with(newline) {
                newline.to_string()
            } else {
                format!("{newline}{newline}")
            };
            Ok(format!("{text}{separator}{block}{newline}"))
        }
        _ => Err(format!(
            "`{START_MARKER}` and `{END_MARKER}` must both appear once, start first"
        )),
    }
}

/// `existing` with the import line `@<agents_file>` added at the end, or `None` when the line
/// is already there. Without a file (`None`) the line is the whole file.
pub fn add_claude_import(existing: Option<&str>, agents_file: &str) -> Option<String> {
    let line = format!("@{agents_file}");
    let Some(text) = existing else {
        return Some(format!("{line}\n"));
    };
    if text.lines().any(|existing| existing.trim() == line) {
        return None;
    }
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let separator = if text.is_empty() || text.ends_with(newline) {
        ""
    } else {
        newline
    };
    Some(format!("{text}{separator}{line}{newline}"))
}

/// What `write_planner_block` changed. Paths are relative to the repository root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct BlockReport {
    /// Files that were created or changed; unchanged files are not written.
    pub written: Vec<String>,
}

/// Writes the block into the agents file and, as configured, the import or mirror into
/// `CLAUDE.md`. Files whose content would not change are left alone.
pub fn write_planner_block(repo_root: &Path, config: &Config) -> Result<BlockReport, String> {
    let block = render_block(config, repo_root);
    let mut written = Vec::new();

    let agents = read_optional(repo_root, &config.agents_file)?;
    let agents_text = insert_block(agents.as_deref(), &block)
        .map_err(|err| format!("{}: {err}", config.agents_file))?;
    write_if_changed(
        repo_root,
        &config.agents_file,
        agents.as_deref(),
        &agents_text,
        &mut written,
    )?;

    if config.claude_import || config.claude_mirror {
        let claude = read_optional(repo_root, CLAUDE_FILE)?;
        let mut claude_text = claude.clone();
        if config.claude_import
            && let Some(text) = add_claude_import(claude_text.as_deref(), &config.agents_file)
        {
            claude_text = Some(text);
        }
        if config.claude_mirror {
            let text = insert_block(claude_text.as_deref(), &block)
                .map_err(|err| format!("{CLAUDE_FILE}: {err}"))?;
            claude_text = Some(text);
        }
        if let Some(text) = claude_text {
            write_if_changed(
                repo_root,
                CLAUDE_FILE,
                claude.as_deref(),
                &text,
                &mut written,
            )?;
        }
    }
    Ok(BlockReport { written })
}

fn read_optional(repo_root: &Path, relative: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(repo_root.join(relative)) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("could not read {relative}: {err}")),
    }
}

fn write_if_changed(
    repo_root: &Path,
    relative: &str,
    old: Option<&str>,
    new: &str,
    written: &mut Vec<String>,
) -> Result<(), String> {
    if old == Some(new) {
        return Ok(());
    }
    let path = repo_root.join(relative);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("could not create {relative}: {err}"))?;
    }
    std::fs::write(&path, new).map_err(|err| format!("could not write {relative}: {err}"))?;
    written.push(relative.to_string());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const BLOCK: &str = "<!-- planner:start -->\nnew\n<!-- planner:end -->";

    fn scratch_repo() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "stardust-agents-block-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn the_block_is_filled_from_the_config_and_short() {
        let config = Config {
            planning_root: "plan".into(),
            spec: SpecLocation::Folder,
            ..Config::default()
        };
        let block = render_block(&config, Path::new("/nonexistent"));
        assert!(block.starts_with(START_MARKER));
        assert!(block.ends_with(END_MARKER));
        assert!(block.contains("Planning lives in `plan/`"));
        assert!(block.contains("The spec (`plan/spec/`)"));
        assert!(!block.contains('{'), "unfilled placeholder in {block}");
        assert!(block.lines().count() < 60);
    }

    #[test]
    fn auto_spec_location_follows_the_folder() {
        let root = scratch_repo();
        let config = Config::default();
        let file = spec_location(&config, &root);
        std::fs::create_dir_all(root.join("docs/planning/spec")).unwrap();
        let folder = spec_location(&config, &root);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(file, "docs/planning/spec.md");
        assert_eq!(folder, "docs/planning/spec/");
    }

    #[test]
    fn text_before_and_after_the_markers_is_kept() {
        let existing = "# Agents\n\nintro\n\n<!-- planner:start -->\nold\nlines\n<!-- planner:end -->\n\n## Mine\nkept\n";
        assert_eq!(
            insert_block(Some(existing), BLOCK).unwrap(),
            "# Agents\n\nintro\n\n<!-- planner:start -->\nnew\n<!-- planner:end -->\n\n## Mine\nkept\n"
        );
    }

    #[test]
    fn crlf_files_keep_crlf() {
        let existing = "a\r\n<!-- planner:start -->\r\nold\r\n<!-- planner:end -->\r\nb\r\n";
        assert_eq!(
            insert_block(Some(existing), BLOCK).unwrap(),
            "a\r\n<!-- planner:start -->\r\nnew\r\n<!-- planner:end -->\r\nb\r\n"
        );
    }

    #[test]
    fn without_markers_the_block_is_appended() {
        assert_eq!(
            insert_block(Some("# Agents\n"), BLOCK).unwrap(),
            format!("# Agents\n\n{BLOCK}\n")
        );
        assert_eq!(
            insert_block(Some("# Agents"), BLOCK).unwrap(),
            format!("# Agents\n\n{BLOCK}\n")
        );
        assert_eq!(insert_block(Some(""), BLOCK).unwrap(), format!("{BLOCK}\n"));
        assert_eq!(insert_block(None, BLOCK).unwrap(), format!("{BLOCK}\n"));
    }

    #[test]
    fn broken_markers_are_refused() {
        assert!(insert_block(Some("<!-- planner:start -->\nx\n"), BLOCK).is_err());
        assert!(insert_block(Some("x\n<!-- planner:end -->\n"), BLOCK).is_err());
        assert!(
            insert_block(
                Some("<!-- planner:end -->\n<!-- planner:start -->\n"),
                BLOCK
            )
            .is_err()
        );
    }

    #[test]
    fn the_import_is_added_only_when_missing() {
        assert_eq!(
            add_claude_import(None, "AGENTS.md").unwrap(),
            "@AGENTS.md\n"
        );
        assert_eq!(add_claude_import(Some("@AGENTS.md\n"), "AGENTS.md"), None);
        assert_eq!(
            add_claude_import(Some("# Claude\n\n@AGENTS.md\nmore\n"), "AGENTS.md"),
            None
        );
        assert_eq!(
            add_claude_import(Some("# Claude"), "AGENTS.md").unwrap(),
            "# Claude\n@AGENTS.md\n"
        );
        assert_eq!(
            add_claude_import(Some("# Claude\r\n"), "docs/AGENTS.md").unwrap(),
            "# Claude\r\n@docs/AGENTS.md\r\n"
        );
    }

    #[test]
    fn writes_agents_and_claude_files_once() {
        let root = scratch_repo();
        std::fs::write(root.join("AGENTS.md"), "# Agents\n\nmine\n").unwrap();
        let config = Config::default();

        let first = write_planner_block(&root, &config).unwrap();
        let second = write_planner_block(&root, &config).unwrap();
        let agents = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        let claude = std::fs::read_to_string(root.join(CLAUDE_FILE)).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(first.written, ["AGENTS.md", CLAUDE_FILE]);
        assert_eq!(second.written, Vec::<String>::new());
        assert!(agents.starts_with("# Agents\n\nmine\n\n<!-- planner:start -->\n"));
        assert_eq!(claude, "@AGENTS.md\n");
    }

    #[test]
    fn mirror_writes_the_block_into_claude_md() {
        let root = scratch_repo();
        let config = Config {
            claude_import: false,
            claude_mirror: true,
            ..Config::default()
        };
        let report = write_planner_block(&root, &config).unwrap();
        let claude = std::fs::read_to_string(root.join(CLAUDE_FILE)).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.written, ["AGENTS.md", CLAUDE_FILE]);
        assert_eq!(claude, format!("{}\n", render_block(&config, &root)));
    }

    #[test]
    fn without_import_or_mirror_claude_md_is_not_created() {
        let root = scratch_repo();
        let config = Config {
            claude_import: false,
            ..Config::default()
        };
        let report = write_planner_block(&root, &config).unwrap();
        let exists = root.join(CLAUDE_FILE).exists();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.written, ["AGENTS.md"]);
        assert!(!exists);
    }

    #[test]
    fn broken_markers_leave_the_file_unchanged() {
        let root = scratch_repo();
        std::fs::write(root.join("AGENTS.md"), "<!-- planner:start -->\nmine\n").unwrap();
        let result = write_planner_block(&root, &Config::default());
        let agents = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert!(result.unwrap_err().starts_with("AGENTS.md:"));
        assert_eq!(agents, "<!-- planner:start -->\nmine\n");
    }

    #[test]
    fn this_repository_block_is_current() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let config = crate::domain::config::load_config(repo_root).config;
        let agents = std::fs::read_to_string(repo_root.join(&config.agents_file)).unwrap();
        assert!(agents.contains(&render_block(&config, repo_root)));
    }
}
