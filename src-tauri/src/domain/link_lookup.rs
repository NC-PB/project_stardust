//! Finding files to link to and the files that link to a file (`S-links`).
//!
//! Link candidates are the files of the search index, so they follow watcher batches with it.
//! Backlinks are found per request by walking the repository's markdown files the way
//! [`links::rewrite_after_moves`] does (D-20261031-015930-k4vn): links count wherever they
//! are, also outside the planning root, which the watcher does not see. Only files holding
//! the target's name are read through.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::ids::parse_task_filename;
use super::links::{self, LineKind};
use super::search::SearchIndex;
use super::task;

/// A file that can be linked to from the editor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkCandidate {
    /// Relative to the repository root, with `/`.
    pub path: String,
    pub title: String,
    /// The id in the filename, for task files.
    pub id: Option<String>,
}

/// A file that links to another one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Backlink {
    /// Relative to the repository root, with `/`.
    pub file: String,
    pub title: String,
    /// The 1-based lines holding a link to the file, in order.
    pub lines: Vec<u32>,
}

/// Every file of `index`, sorted by path.
pub fn link_candidates(index: &SearchIndex) -> Vec<LinkCandidate> {
    let mut candidates: Vec<LinkCandidate> = index
        .files()
        .map(|(path, title)| LinkCandidate {
            path: path.to_string(),
            title: title.to_string(),
            id: parse_task_filename(path.rsplit('/').next().unwrap_or(path)).map(|name| name.id),
        })
        .collect();
    candidates.sort_by(|a, b| a.path.cmp(&b.path));
    candidates
}

/// The markdown files of the repository at `repo_root` with a relative link to `file`
/// (relative to the repository root), sorted by path; `file` itself is left out. Links in
/// code spans, code fences and frontmatter do not count; anchors and queries are ignored.
pub fn backlinks(repo_root: &Path, planning_root: &str, file: &str) -> Vec<Backlink> {
    let target = links::components(file);
    let Some(name) = target.last() else {
        return Vec::new();
    };
    let names = [name.clone(), links::escape(name)];
    let mut found = Vec::new();
    for (path, relative) in links::markdown_files(repo_root, &repo_root.join(planning_root)) {
        if relative == file {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        if !names
            .iter()
            .any(|name| links::contains(&bytes, name.as_bytes()))
        {
            continue;
        }
        let Ok(text) = String::from_utf8(bytes) else {
            continue;
        };
        let lines = lines_linking(&text, &relative, &target);
        if !lines.is_empty() {
            let file_name = relative.rsplit('/').next().unwrap_or(&relative);
            found.push(Backlink {
                title: task::parse_task(file_name, &text).title,
                file: relative,
                lines,
            });
        }
    }
    found
}

/// The lines of `text`, the file at `file`, with a link resolving to `target`.
fn lines_linking(text: &str, file: &str, target: &[String]) -> Vec<u32> {
    let mut dir = links::components(file);
    dir.pop();
    links::classify(text)
        .into_iter()
        .enumerate()
        .filter(|(_, (_, kind))| *kind == LineKind::Text)
        .filter(|(_, (line, _))| {
            links::link_targets(line).into_iter().any(|(start, end)| {
                links::local_path(&line[start..end])
                    .and_then(|(path, _)| links::resolve(&dir, path))
                    .is_some_and(|resolved| resolved == target)
            })
        })
        .map(|(number, _)| number as u32 + 1)
        .collect()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::domain::ids::random_suffix;

    const TASK: &str = "docs/planning/next/20261031-000001-aaaa-one.md";

    fn repo(files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-backlinks-{}", random_suffix()));
        for (file, text) in files {
            let path = root.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        root
    }

    fn files(found: &[Backlink]) -> Vec<(&str, &str, Vec<u32>)> {
        found
            .iter()
            .map(|b| (b.file.as_str(), b.title.as_str(), b.lines.clone()))
            .collect()
    }

    #[test]
    fn finds_links_from_anywhere_in_the_repository() {
        let root = repo(&[
            (
                TASK,
                "---\ntitle: One\n---\n\nSee [me](20261031-000001-aaaa-one.md).\n",
            ),
            (
                "docs/planning/done/20261031-000002-bbbb-two.md",
                "---\ntitle: \"Two: done\"\n---\n\nAfter [one](../next/20261031-000001-aaaa-one.md#result).\n\
                 Again [one](./../next/20261031-000001-aaaa-one.md?x) and [ref].\n\n\
                 [ref]: ../next/20261031-000001-aaaa-one.md\n",
            ),
            (
                "README.md",
                "# Readme\n\n[task](docs/planning/next/20261031-000001-aaaa-one.md)\n",
            ),
            (
                "docs/planning/spec.md",
                "---\ntitle: Specification\n---\n\nNames 20261031-000001-aaaa-one.md without a link.\n",
            ),
        ]);
        let found = backlinks(&root, "docs/planning", TASK);
        assert_eq!(
            files(&found),
            vec![
                ("README.md", "README", vec![3]),
                (
                    "docs/planning/done/20261031-000002-bbbb-two.md",
                    "Two: done",
                    vec![5, 6, 8]
                ),
            ]
        );
    }

    #[test]
    fn ignores_code_frontmatter_other_targets_and_skipped_folders() {
        let root = repo(&[
            (TASK, "---\ntitle: One\n---\n"),
            (
                "docs/planning/inbox/a.md",
                "---\nsource: [x](../next/20261031-000001-aaaa-one.md)\n---\n\
                 `[x](../next/20261031-000001-aaaa-one.md)`\n\
                 ```\n[x](../next/20261031-000001-aaaa-one.md)\n```\n\
                 [x](20261031-000001-aaaa-one.md) [web](https://x.org/20261031-000001-aaaa-one.md)\n\
                 [root](/docs/planning/next/20261031-000001-aaaa-one.md)\n",
            ),
            (
                "node_modules/pkg/README.md",
                "[x](../../docs/planning/next/20261031-000001-aaaa-one.md)\n",
            ),
            (
                ".hidden/notes.md",
                "[x](../docs/planning/next/20261031-000001-aaaa-one.md)\n",
            ),
        ]);
        assert!(backlinks(&root, "docs/planning", TASK).is_empty());
    }

    #[test]
    fn finds_escaped_names() {
        let file = "docs/planning/notes/my notes.md";
        let root = repo(&[
            (file, "# Notes\n"),
            ("docs/planning/braindump.md", "[n](notes/my%20notes.md)\n"),
            ("docs/planning/inbox/b.md", "[n](<../notes/my notes.md>)\n"),
        ]);
        let found = backlinks(&root, "docs/planning", file);
        assert_eq!(
            found.iter().map(|b| b.file.as_str()).collect::<Vec<_>>(),
            vec!["docs/planning/braindump.md", "docs/planning/inbox/b.md"]
        );
    }

    #[test]
    fn candidates_are_the_indexed_files_with_their_ids() {
        let root = repo(&[
            (TASK, "---\ntitle: One\n---\n"),
            ("docs/planning/spec.md", "---\ntitle: Specification\n---\n"),
            ("README.md", "# Outside the planning root\n"),
        ]);
        let index = SearchIndex::build(&root, "docs/planning");
        assert_eq!(
            link_candidates(&index),
            vec![
                LinkCandidate {
                    path: TASK.into(),
                    title: "One".into(),
                    id: Some("20261031-000001-aaaa".into()),
                },
                LinkCandidate {
                    path: "docs/planning/spec.md".into(),
                    title: "Specification".into(),
                    id: None,
                },
            ]
        );
    }
}
