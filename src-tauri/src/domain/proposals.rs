//! Open proposals (`S-proposals`) across the planning root. A proposal is a blockquote whose
//! first line starts with `**Proposal:**`: the run of consecutive lines starting with `>`
//! (after any indentation), outside the frontmatter and code fences. The frontmatter is a
//! block from a first line `---` to the next `---` line. `src/lib/proposals.ts` finds them by
//! the same rules and applies Accept and Reject.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use walkdir::WalkDir;

const LABEL: &str = "**Proposal:**";

/// One open proposal in a planning file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProposalRef {
    /// Relative to the repository root, with `/`.
    pub path: String,
    /// 1-based line of the proposal's first line.
    pub line: u32,
    /// The first line of the proposal's text, without the label.
    pub text: String,
}

/// Every proposal in the markdown files under `planning_root` of `repo_root`, by path and
/// line. Hidden files and folders are skipped; files that cannot be read are left out.
pub fn list_proposals(repo_root: &Path, planning_root: &str) -> Vec<ProposalRef> {
    let root = repo_root.join(planning_root.trim_matches('/'));
    let mut found: Vec<ProposalRef> = WalkDir::new(&root)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !is_hidden(entry.file_name()))
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_file()
                && entry
                    .file_name()
                    .to_string_lossy()
                    .to_lowercase()
                    .ends_with(".md")
        })
        .flat_map(|entry| {
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                return Vec::new();
            };
            let Ok(relative) = entry.path().strip_prefix(repo_root) else {
                return Vec::new();
            };
            let path = relative.to_string_lossy().replace('\\', "/");
            find_proposals(&text)
                .into_iter()
                .map(|(line, text)| ProposalRef {
                    path: path.clone(),
                    line,
                    text,
                })
                .collect()
        })
        .collect();
    found.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
    found
}

/// The proposals in `text` as (1-based first line, first line of text without the label).
/// When the label stands alone, the text is the next non-blank line of the block.
pub fn find_proposals(text: &str) -> Vec<(u32, String)> {
    let lines: Vec<&str> = text.lines().collect();
    let mut found = Vec::new();
    let mut fence: Option<String> = None;
    let mut i = frontmatter_lines(&lines);
    while i < lines.len() {
        let line = lines[i];
        let marker = fence_marker(line);
        if let Some(open) = &fence {
            if marker.is_some_and(|m| m.starts_with(&open[..1]) && m.len() >= open.len()) {
                fence = None;
            }
            i += 1;
        } else if let Some(marker) = marker {
            fence = Some(marker.to_string());
            i += 1;
        } else if let Some(first) = unquote(line) {
            let mut end = i;
            while end + 1 < lines.len() && unquote(lines[end + 1]).is_some() {
                end += 1;
            }
            if let Some(rest) = first.trim_start().strip_prefix(LABEL) {
                let summary = std::iter::once(rest)
                    .chain(lines[i + 1..=end].iter().filter_map(|l| unquote(l)))
                    .map(str::trim)
                    .find(|l| !l.is_empty())
                    .unwrap_or("")
                    .to_string();
                found.push((i as u32 + 1, summary));
            }
            i = end + 1;
        } else {
            i += 1;
        }
    }
    found
}

/// How many lines the frontmatter takes, both `---` lines included; 0 without one.
pub(crate) fn frontmatter_lines(lines: &[&str]) -> usize {
    if lines.first() != Some(&"---") {
        return 0;
    }
    lines
        .iter()
        .skip(1)
        .position(|l| l.trim_end() == "---")
        .map_or(0, |at| at + 2)
}

/// The opening run of three or more backticks or tildes of a fence line.
pub(crate) fn fence_marker(line: &str) -> Option<&str> {
    let trimmed = line.trim_start_matches([' ', '\t']);
    let first = trimmed.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let run = trimmed.len() - trimmed.trim_start_matches(first).len();
    (run >= 3).then(|| &trimmed[..run])
}

/// The line after its first `>` marker and one space, or `None` when it is not a quote line.
fn unquote(line: &str) -> Option<&str> {
    let rest = line.trim_start_matches([' ', '\t']).strip_prefix('>')?;
    Some(rest.strip_prefix(' ').unwrap_or(rest))
}

fn is_hidden(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    name.starts_with('.') || name.ends_with('~')
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn finds_proposals_by_the_same_rules_as_the_frontend() {
        let text = [
            "---",
            "> **Proposal:** in frontmatter",
            "---",
            "```md",
            "> **Proposal:** in a fence",
            "```",
            "~~~~",
            "```",
            "> **Proposal:** still in the tilde fence",
            "~~~~",
            "> > **Proposal:** nested",
            "",
            "> A plain quote.",
            "> **Proposal:** not at the start",
            "",
            "- item",
            "  > **Proposal:**",
            "  >",
            "  > Indented, label alone.",
            "",
            "> **Proposal:** Rename the board.",
            "> Second line.",
        ]
        .join("\n");
        assert_eq!(
            find_proposals(&text),
            vec![
                (17, "Indented, label alone.".to_string()),
                (21, "Rename the board.".to_string()),
            ]
        );
        assert!(find_proposals("").is_empty());
    }

    #[test]
    fn lists_proposals_across_the_planning_root() {
        let root: PathBuf =
            std::env::temp_dir().join(format!("stardust-proposals-{}", fastrand::u32(..)));
        let planning = root.join("docs/planning");
        for dir in ["next", "notes", ".hidden"] {
            std::fs::create_dir_all(planning.join(dir)).unwrap();
        }
        let proposal = "intro\n\n> **Proposal:** do it\n";
        std::fs::write(planning.join("spec.md"), proposal).unwrap();
        std::fs::write(
            planning.join("next/a.md"),
            "> **Proposal:** a\n\n> **Proposal:** b\n",
        )
        .unwrap();
        std::fs::write(planning.join("notes/n.txt"), proposal).unwrap();
        std::fs::write(planning.join(".hidden/h.md"), proposal).unwrap();
        std::fs::write(root.join("README.md"), proposal).unwrap();

        let found = list_proposals(&root, "docs/planning");
        let summary: Vec<(&str, u32, &str)> = found
            .iter()
            .map(|p| (p.path.as_str(), p.line, p.text.as_str()))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("docs/planning/next/a.md", 1, "a"),
                ("docs/planning/next/a.md", 3, "b"),
                ("docs/planning/spec.md", 3, "do it"),
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
