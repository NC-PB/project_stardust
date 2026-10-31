//! Code paths mentioned in tasks (`S-staleness`).
//!
//! A code path is the text of an inline code span in a task body that looks like a relative
//! file path: no spaces, at least one `/`, a last part with a file extension, and only letters,
//! digits and `. _ - + /`. A trailing line number (`:12` or `:12:3`) and a leading `./` are
//! dropped. Absolute paths, `..`, empty parts, URLs, globs and placeholders (`<id>`,
//! `{planning_root}`) are not code paths, so they are never flagged. Spans in the frontmatter
//! and in code fences are skipped. A path exists when it names a file or folder relative to the
//! repository root or to the planning root.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::config::Config;
use super::proposals::{fence_marker, frontmatter_lines};

/// A code path in a text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CodePath {
    /// As written, without a leading `./` or a trailing line number.
    pub path: String,
    /// 1-based line of the text it is on.
    pub line: u32,
}

/// A code path in a task that names nothing in the repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MissingCodePath {
    /// The column folder of the task.
    pub column: String,
    pub file_name: String,
    pub path: String,
    /// 1-based line in the task file.
    pub line: u32,
}

/// Every code path in the task files of the columns other than the terminal one, that exists
/// neither under `repo_root` nor under its planning root. Unreadable columns and files are
/// skipped. Sorted by column order, file name and line.
pub fn missing_code_paths(repo_root: &Path, config: &Config) -> Vec<MissingCodePath> {
    let planning = repo_root.join(config.planning_root.trim_matches('/'));
    let exists = |path: &str| repo_root.join(path).exists() || planning.join(path).exists();
    let mut missing = Vec::new();
    for column in config.columns.iter().filter(|c| **c != config.terminal) {
        let Ok(entries) = std::fs::read_dir(planning.join(column)) else {
            continue;
        };
        let mut names: Vec<String> = entries
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".md"))
            .collect();
        names.sort();
        for name in names {
            let Ok(text) = std::fs::read_to_string(planning.join(column).join(&name)) else {
                continue;
            };
            for found in code_paths(&text) {
                if !exists(&found.path) {
                    missing.push(MissingCodePath {
                        column: column.clone(),
                        file_name: name.clone(),
                        path: found.path,
                        line: found.line,
                    });
                }
            }
        }
    }
    missing
}

/// The code paths in `text`, in order, each once per line.
pub fn code_paths(text: &str) -> Vec<CodePath> {
    let lines: Vec<&str> = text.lines().collect();
    let mut found = Vec::new();
    let mut fence: Option<String> = None;
    for (index, line) in lines.iter().enumerate().skip(frontmatter_lines(&lines)) {
        let marker = fence_marker(line);
        if let Some(open) = &fence {
            if marker.is_some_and(|m| m.starts_with(&open[..1]) && m.len() >= open.len()) {
                fence = None;
            }
            continue;
        }
        if let Some(marker) = marker {
            fence = Some(marker.to_string());
            continue;
        }
        let mut seen: Vec<&str> = Vec::new();
        for span in code_spans(line) {
            if let Some(path) = as_code_path(span)
                && !seen.contains(&path)
            {
                seen.push(path);
                found.push(CodePath {
                    path: path.to_string(),
                    line: index as u32 + 1,
                });
            }
        }
    }
    found
}

/// The contents of the inline code spans of one line: a run of backticks up to the next run of
/// the same length. A run without a closing one is plain text.
fn code_spans(line: &str) -> Vec<&str> {
    let bytes = line.as_bytes();
    let run_at = |start: usize| bytes[start..].iter().take_while(|b| **b == b'`').count();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'`' {
            i += 1;
            continue;
        }
        let open = run_at(i);
        let content = i + open;
        let mut j = content;
        let mut closed = None;
        while j < bytes.len() {
            if bytes[j] == b'`' {
                let run = run_at(j);
                if run == open {
                    closed = Some(j);
                    break;
                }
                j += run;
            } else {
                j += 1;
            }
        }
        match closed {
            Some(end) => {
                spans.push(line[content..end].trim());
                i = end + open;
            }
            None => i = content,
        }
    }
    spans
}

/// The path in the text of a code span, or `None` when it does not look like a relative file
/// path.
fn as_code_path(code: &str) -> Option<&str> {
    let path = without_line_number(code);
    let path = path.strip_prefix("./").unwrap_or(path);
    let allowed = |c: char| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '+' | '/');
    if !path.contains('/') || path.starts_with('/') || !path.chars().all(allowed) {
        return None;
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts.iter().any(|part| matches!(*part, "" | "." | "..")) {
        return None;
    }
    let last = parts.last()?;
    let (stem, extension) = last.rsplit_once('.')?;
    let extension_ok = !extension.is_empty()
        && extension.len() <= 10
        && extension.chars().all(|c| c.is_ascii_alphanumeric())
        && extension.chars().any(|c| c.is_ascii_alphabetic());
    (!stem.is_empty() && extension_ok).then_some(path)
}

/// `code` without a trailing `:12` or `:12:3`.
fn without_line_number(code: &str) -> &str {
    let mut rest = code;
    for _ in 0..2 {
        match rest.rsplit_once(':') {
            Some((before, number))
                if !number.is_empty() && number.chars().all(|c| c.is_ascii_digit()) =>
            {
                rest = before;
            }
            _ => break,
        }
    }
    rest
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::domain::config::parse_config;

    fn paths(text: &str) -> Vec<(u32, String)> {
        code_paths(text)
            .into_iter()
            .map(|found| (found.line, found.path))
            .collect()
    }

    #[test]
    fn finds_relative_file_paths_in_inline_code() {
        let text = [
            "Change `src/lib/board.ts` and `./src-tauri/src/domain/task.rs:42:7`.",
            "Also ``docs/planning/spec.md`` and `.github/workflows/release.yml`.",
            "Twice `a/b.md`, `a/b.md` on one line.",
        ]
        .join("\n");
        assert_eq!(
            paths(&text),
            vec![
                (1, "src/lib/board.ts".to_string()),
                (1, "src-tauri/src/domain/task.rs".to_string()),
                (2, "docs/planning/spec.md".to_string()),
                (2, ".github/workflows/release.yml".to_string()),
                (3, "a/b.md".to_string()),
            ]
        );
    }

    #[test]
    fn leaves_out_what_is_not_a_relative_file_path() {
        let not_paths = [
            "`board.ts`",                     // no folder
            "`src/lib`",                      // no extension
            "`done/YYYY-MM/`",                // a folder
            "`/etc/hosts.conf`",              // absolute
            "`../spec.md`",                   // leaves the folder
            "`a//b.md`",                      // empty part
            "`https://example.com/a.html`",   // URL
            "`spec/<name>.md`",               // placeholder
            "`{planning_root}/braindump.md`", // placeholder
            "`src/**/*.ts`",                  // glob
            "`npm run check`",                // spaces
            "`v1.2/3.4`",                     // a number, not an extension
            "`src/a.ts#L3`",                  // anchor
            "`@/lib/board`",                  // import alias
            "`docs/spec.md` closing ` unpaired",
        ];
        let text = not_paths.join("\n");
        assert_eq!(paths(&text), vec![(15, "docs/spec.md".to_string())]);
    }

    #[test]
    fn skips_the_frontmatter_and_code_fences() {
        let text = [
            "---",
            "title: \"`in/front.md`\"",
            "---",
            "```sh",
            "cat `in/fence.md`",
            "```",
            "~~~~",
            "```",
            "`in/tilde.md`",
            "~~~~",
            "`out/side.md`",
        ]
        .join("\n");
        assert_eq!(paths(&text), vec![(11, "out/side.md".to_string())]);
    }

    #[test]
    fn lists_missing_paths_in_open_columns_only() {
        let root: PathBuf =
            std::env::temp_dir().join(format!("stardust-code-paths-{}", fastrand::u32(..)));
        let planning = root.join("docs/planning");
        for dir in ["inbox", "next", "done", "spec", "src/lib"] {
            let base = if dir.starts_with("src") {
                &root
            } else {
                &planning
            };
            std::fs::create_dir_all(base.join(dir)).unwrap();
        }
        std::fs::write(root.join("src/lib/board.ts"), "").unwrap();
        std::fs::write(planning.join("spec/README.md"), "").unwrap();
        let body = "Uses `src/lib/board.ts`, `spec/README.md` and `src/lib/gone.ts`.\n";
        std::fs::write(
            planning.join("next/b.md"),
            format!("---\nid: b\n---\n{body}"),
        )
        .unwrap();
        std::fs::write(planning.join("inbox/a.md"), "`src/new/file.rs`\n").unwrap();
        std::fs::write(planning.join("inbox/c.txt"), "`src/x/y.rs`\n").unwrap();
        std::fs::write(planning.join("done/d.md"), body).unwrap();

        let (config, _) = parse_config("");
        let found: Vec<(String, String, String, u32)> = missing_code_paths(&root, &config)
            .into_iter()
            .map(|m| (m.column, m.file_name, m.path, m.line))
            .collect();
        assert_eq!(
            found,
            vec![
                ("inbox".into(), "a.md".into(), "src/new/file.rs".into(), 1),
                ("next".into(), "b.md".into(), "src/lib/gone.ts".into(), 4),
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
