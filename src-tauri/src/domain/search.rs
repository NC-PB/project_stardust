//! Full text search (`S-search-fulltext`) over every markdown file under the planning root.
//! The text is kept in memory, read when a project opens and updated from watcher batches;
//! nothing is written to disk. A query matches a file that contains every one of its words,
//! ignoring case, as substrings, so ids and node slugs match exactly as typed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use walkdir::WalkDir;

use super::task;
use super::watch::{ChangeBatch, FileChange};

/// A snippet shows this many characters around the first match.
const SNIPPET_CHARS: usize = 120;
/// A match in the title or path counts this much more than one in the text.
const TITLE_WEIGHT: usize = 10;

/// One file found by a search.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SearchHit {
    /// Relative to the repository root, with `/`.
    pub path: String,
    pub title: String,
    /// The line of the first match, shortened around it.
    pub snippet: String,
    /// 1-based line number of the snippet.
    pub line: u32,
}

#[derive(Debug)]
struct Document {
    title: String,
    text: String,
    /// `text` in lowercase, searched for every query.
    lower: String,
    /// `title` and path in lowercase.
    lower_title: String,
}

/// The searchable files of one repository.
#[derive(Debug)]
pub struct SearchIndex {
    repo_root: PathBuf,
    planning_root: String,
    documents: HashMap<String, Document>,
}

impl SearchIndex {
    /// Reads every markdown file under `planning_root` of `repo_root`.
    pub fn build(repo_root: &Path, planning_root: &str) -> SearchIndex {
        let mut index = SearchIndex {
            repo_root: repo_root.to_path_buf(),
            planning_root: planning_root.trim_matches('/').to_string(),
            documents: HashMap::new(),
        };
        let root = repo_root.join(&index.planning_root);
        index.read_tree(&root);
        index
    }

    /// The number of files in the index.
    pub fn len(&self) -> usize {
        self.documents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.documents.is_empty()
    }

    /// Re-reads the files a watcher batch touched and forgets removed ones.
    pub fn apply(&mut self, batch: &ChangeBatch) {
        for change in &batch.changes {
            match change {
                FileChange::Created { path } | FileChange::Modified { path } => self.refresh(path),
                FileChange::Removed { path } => self.forget(path),
                FileChange::Moved { from, to, .. } => {
                    self.forget(from);
                    self.refresh(to);
                }
            }
        }
    }

    /// Files containing every word of `query`, best first: matches in the title or path
    /// before matches in the text, then by number of matches, then by path.
    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let terms: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
        if terms.is_empty() {
            return Vec::new();
        }
        let mut scored: Vec<(usize, &String, &Document)> = self
            .documents
            .iter()
            .filter(|(_, doc)| {
                terms.iter().all(|term| {
                    doc.lower.contains(term.as_str()) || doc.lower_title.contains(term.as_str())
                })
            })
            .map(|(path, doc)| {
                let score = terms
                    .iter()
                    .map(|term| {
                        TITLE_WEIGHT * doc.lower_title.matches(term.as_str()).count()
                            + doc.lower.matches(term.as_str()).count()
                    })
                    .sum();
                (score, path, doc)
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(b.1)));
        scored
            .into_iter()
            .take(limit)
            .map(|(_, path, doc)| {
                let (line, snippet) = snippet(&doc.text, &terms);
                SearchHit {
                    path: path.clone(),
                    title: doc.title.clone(),
                    snippet,
                    line,
                }
            })
            .collect()
    }

    fn read_tree(&mut self, dir: &Path) {
        let files = WalkDir::new(dir)
            .into_iter()
            .filter_entry(|entry| entry.depth() == 0 || !is_hidden(entry.file_name()))
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file());
        for entry in files {
            if let Some(relative) = self.relative(entry.path()) {
                self.read(&relative);
            }
        }
    }

    /// Reads `path` again, or the whole folder when it is one.
    fn refresh(&mut self, path: &str) {
        let absolute = self.repo_root.join(path);
        if absolute.is_dir() {
            self.read_tree(&absolute);
        } else {
            self.read(path);
        }
    }

    /// Adds or replaces the file at `path`, relative to the repository root, if it is a
    /// markdown file under the planning root; forgets it when it cannot be read.
    fn read(&mut self, path: &str) {
        let name = path.rsplit('/').next().unwrap_or(path);
        let under_root =
            self.planning_root.is_empty() || path.starts_with(&format!("{}/", self.planning_root));
        if !under_root || !name.to_lowercase().ends_with(".md") || is_hidden(name.as_ref()) {
            return;
        }
        let Ok(text) = std::fs::read_to_string(self.repo_root.join(path)) else {
            self.documents.remove(path);
            return;
        };
        let title = task::parse_task(name, &text).title;
        let document = Document {
            lower: text.to_lowercase(),
            lower_title: format!("{}\n{}", title.to_lowercase(), path.to_lowercase()),
            title,
            text,
        };
        self.documents.insert(path.to_string(), document);
    }

    /// Forgets `path` and, for a folder, every file under it.
    fn forget(&mut self, path: &str) {
        let folder = format!("{}/", path.trim_end_matches('/'));
        self.documents
            .retain(|known, _| known != path && !known.starts_with(&folder));
    }

    fn relative(&self, path: &Path) -> Option<String> {
        let relative = path.strip_prefix(&self.repo_root).ok()?;
        Some(relative.to_string_lossy().replace('\\', "/"))
    }
}

fn is_hidden(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    name.starts_with('.') || name.ends_with('~')
}

/// The first line containing a term, as (1-based number, text shortened around the match).
/// Falls back to the first non-empty line when only the title or path matched.
fn snippet(text: &str, terms: &[String]) -> (u32, String) {
    let lines = text.lines().enumerate();
    let found = lines.clone().find_map(|(number, line)| {
        let lower = line.to_lowercase();
        terms
            .iter()
            .filter_map(|term| lower.find(term.as_str()))
            .min()
            .map(|at| (number, line, char_index(&lower, at)))
    });
    let (number, line, at) = found.unwrap_or_else(|| {
        lines
            .filter(|(_, line)| !line.trim().is_empty() && line.trim() != "---")
            .map(|(number, line)| (number, line, 0))
            .next()
            .unwrap_or((0, "", 0))
    });
    (number as u32 + 1, shorten(line.trim(), at))
}

/// The character position of byte `at` in `text`.
fn char_index(text: &str, at: usize) -> usize {
    text[..at].chars().count()
}

/// `line` cut to `SNIPPET_CHARS` characters, keeping the character `at` in view.
fn shorten(line: &str, at: usize) -> String {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= SNIPPET_CHARS {
        return line.to_string();
    }
    let start = at
        .saturating_sub(SNIPPET_CHARS / 3)
        .min(chars.len() - SNIPPET_CHARS);
    let end = start + SNIPPET_CHARS;
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.extend(&chars[start..end]);
    if end < chars.len() {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    fn repo(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("stardust-search-{name}-{}", fastrand::u32(..)));
        for dir in ["inbox", "done/2026-10", "notes", ".hidden"] {
            std::fs::create_dir_all(root.join("docs/planning").join(dir)).unwrap();
        }
        root
    }

    fn write(root: &Path, path: &str, text: &str) {
        std::fs::write(root.join(path), text).unwrap();
    }

    fn task(title: &str, body: &str) -> String {
        format!("---\ntitle: {title}\n---\n\n## Description\n{body}\n")
    }

    fn paths(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|hit| hit.path.as_str()).collect()
    }

    #[test]
    fn finds_files_with_every_word_in_any_case() {
        let root = repo("words");
        write(
            &root,
            "docs/planning/inbox/a.md",
            &task("Board sort", "Sort cards by Priority, then more cards."),
        );
        write(
            &root,
            "docs/planning/done/2026-10/b.md",
            &task("Old", "priority of cards"),
        );
        write(&root, "docs/planning/notes/c.md", "# Notes\nnothing here\n");
        write(&root, "docs/planning/.hidden/d.md", "priority cards");
        write(&root, "docs/planning/inbox/e.txt", "priority cards");
        write(&root, "outside.md", "priority cards");
        let index = SearchIndex::build(&root, "docs/planning");
        assert_eq!(index.len(), 3);

        let hits = index.search("CARDS priority", 10);
        assert_eq!(
            paths(&hits),
            [
                "docs/planning/inbox/a.md",
                "docs/planning/done/2026-10/b.md"
            ]
        );
        assert_eq!(hits[0].title, "Board sort");
        assert_eq!(hits[0].line, 6);
        assert_eq!(hits[0].snippet, "Sort cards by Priority, then more cards.");
        assert!(index.search("cards missing", 10).is_empty());
        assert!(index.search("   ", 10).is_empty());
        assert_eq!(index.search("priority", 1).len(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ids_and_titles_match_as_typed() {
        let root = repo("ids");
        write(
            &root,
            "docs/planning/inbox/20261030-220014-91bd-search.md",
            &task("Search", "Implements `S-search-fulltext`."),
        );
        write(
            &root,
            "docs/planning/notes/n.md",
            &task("Notes", "search search search"),
        );
        let index = SearchIndex::build(&root, "docs/planning");
        let by_id = index.search("220014-91bd", 10);
        assert_eq!(
            paths(&by_id),
            ["docs/planning/inbox/20261030-220014-91bd-search.md"]
        );
        assert_eq!(
            (by_id[0].line, by_id[0].snippet.as_str()),
            (2, "title: Search"),
            "a path match shows the first line"
        );
        assert_eq!(index.search("s-search-fulltext", 10).len(), 1);
        // The title match ranks first even though the note mentions the word more often.
        assert_eq!(index.search("search", 10)[0].title, "Search");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn follows_watcher_batches() {
        let root = repo("batch");
        write(&root, "docs/planning/inbox/a.md", &task("A", "alpha"));
        let mut index = SearchIndex::build(&root, "docs/planning");

        write(&root, "docs/planning/inbox/a.md", &task("A", "beta"));
        write(&root, "docs/planning/inbox/b.md", &task("B", "beta"));
        index.apply(&ChangeBatch {
            changes: vec![
                FileChange::Modified {
                    path: "docs/planning/inbox/a.md".into(),
                },
                FileChange::Created {
                    path: "docs/planning/inbox/b.md".into(),
                },
            ],
            config_changed: false,
        });
        assert!(index.search("alpha", 10).is_empty());
        assert_eq!(index.search("beta", 10).len(), 2);

        std::fs::rename(
            root.join("docs/planning/inbox/a.md"),
            root.join("docs/planning/notes/a.md"),
        )
        .unwrap();
        std::fs::remove_file(root.join("docs/planning/inbox/b.md")).unwrap();
        index.apply(&ChangeBatch {
            changes: vec![
                FileChange::Moved {
                    id: "a".into(),
                    from: "docs/planning/inbox/a.md".into(),
                    to: "docs/planning/notes/a.md".into(),
                },
                FileChange::Removed {
                    path: "docs/planning/inbox/b.md".into(),
                },
            ],
            config_changed: false,
        });
        assert_eq!(
            paths(&index.search("beta", 10)),
            ["docs/planning/notes/a.md"]
        );

        index.apply(&ChangeBatch {
            changes: vec![FileChange::Removed {
                path: "docs/planning/notes".into(),
            }],
            config_changed: false,
        });
        assert!(index.is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn long_lines_are_shortened_around_the_match() {
        let line = format!("{} needle {}", "a".repeat(200), "b".repeat(200));
        let (_, text) = snippet(&line, &["needle".to_string()]);
        assert!(text.contains("needle"));
        assert!(text.starts_with('…') && text.ends_with('…'));
        assert_eq!(text.chars().count(), SNIPPET_CHARS + 2);
        let (_, umlaut) = snippet(&format!("{}Ärger", "ü".repeat(300)), &["ärger".to_string()]);
        assert!(umlaut.ends_with("Ärger"));
    }

    /// `S-search-fulltext`: 5,000 generated task files. Run with
    /// `cargo test --release -- --ignored --nocapture search_5000` to see the timings.
    #[test]
    #[ignore = "timing run; see the doc comment"]
    fn search_5000_files() {
        let root = repo("bulk");
        let words = [
            "board", "card", "column", "editor", "search", "watcher", "config", "spec",
        ];
        for i in 0..5000 {
            let body: String = (0..400)
                .map(|j| words[(i * 7 + j * 13) % words.len()])
                .collect::<Vec<_>>()
                .join(" ");
            let path = format!(
                "docs/planning/done/2026-10/20261030-{i:06}-x{:03}-task.md",
                i % 1000
            );
            write(&root, &path, &task(&format!("Task {i}"), &body));
        }
        let started = Instant::now();
        let mut index = SearchIndex::build(&root, "docs/planning");
        let built = started.elapsed();
        assert_eq!(index.len(), 5000);
        let mut slowest = std::time::Duration::ZERO;
        for query in [
            "b",
            "bo",
            "boa",
            "board",
            "board car",
            "board card zzz",
            "task 4999",
            "000123",
        ] {
            let started = Instant::now();
            let hits = index.search(query, 50);
            slowest = slowest.max(started.elapsed());
            assert!(query.contains("zzz") || !hits.is_empty(), "{query}");
        }
        let started = Instant::now();
        index.apply(&ChangeBatch {
            changes: vec![FileChange::Modified {
                path: "docs/planning/done/2026-10/20261030-000001-x001-task.md".into(),
            }],
            config_changed: false,
        });
        let updated = started.elapsed();
        println!("build {built:?}, slowest query {slowest:?}, one update {updated:?}");
        std::fs::remove_dir_all(root).unwrap();
    }
}
