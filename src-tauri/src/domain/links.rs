//! Relative markdown links and keeping them working when files move (`S-links`).
//!
//! The scanning is shared with the split (`S-spec-split`): which lines are markdown text, where
//! link targets sit in a line, and the walk over the repository's markdown files. Only the
//! byte ranges of link targets are ever replaced; everything else in a file stays as it was.
//!
//! After files moved, [`rewrite_after_moves`] repairs links in every searched markdown file of
//! the repository (the walk of the split, D-20261031-015930-k4vn) and in the moved files. A
//! link is rewritten only when it no longer resolves from where its file is now, and does
//! resolve from where its file was to a file that exists once the moved files are followed.
//! So running it twice for the same moves changes nothing, and a link an agent already fixed
//! is left alone.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use walkdir::WalkDir;

use super::files::{self, SaveOutcome, has_scheme, percent_decode};

/// The links rewritten in one file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FileLinks {
    /// Relative to the repository root.
    pub file: String,
    pub changes: Vec<LinkChange>,
}

/// One rewritten link target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkChange {
    /// 1-based line in the file.
    pub line: u32,
    pub old: String,
    pub new: String,
}

/// Folder names never searched for links, besides hidden names (starting with `.`): installed
/// dependencies and build output (D-20261031-015930-k4vn).
pub const SKIPPED: [&str; 2] = ["node_modules", "target"];

/// Whether the walk for links goes into `path`: not into hidden names or [`SKIPPED`] folders,
/// except on the way to the planning root.
pub(crate) fn searched(path: &Path, planning: &Path) -> bool {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    planning.starts_with(path) || !(name.starts_with('.') || SKIPPED.contains(&name.as_ref()))
}

pub(crate) fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum LineKind {
    Text,
    /// Frontmatter, code fences and the lines inside them.
    Literal,
}

/// The lines of `text`, line endings kept, with whether they are markdown text.
pub(crate) fn classify(text: &str) -> Vec<(&str, LineKind)> {
    let mut lines = Vec::new();
    let mut frontmatter = text.starts_with("---\n") || text.starts_with("---\r\n");
    let mut fence: Option<&str> = None;
    for (number, line) in text.split_inclusive('\n').enumerate() {
        let trimmed = line.trim_start_matches(' ');
        let kind = if frontmatter {
            if number > 0 && matches!(line.trim_end(), "---" | "...") {
                frontmatter = false;
            }
            LineKind::Literal
        } else if let Some(open) = fence {
            if trimmed.trim_end().starts_with(open)
                && trimmed.trim_end().trim_start_matches(&open[..1]).is_empty()
            {
                fence = None;
            }
            LineKind::Literal
        } else if line.len() - trimmed.len() <= 3
            && (trimmed.starts_with("```") || trimmed.starts_with("~~~"))
        {
            let mark = &trimmed[..1];
            let run = trimmed.len() - trimmed.trim_start_matches(mark).len();
            fence = Some(&trimmed[..run]);
            LineKind::Literal
        } else {
            LineKind::Text
        };
        lines.push((line, kind));
    }
    lines
}

/// `text` with the target of every inline link, image and link reference definition replaced
/// where `map` returns a new one. Code spans, code fences and frontmatter are left alone.
pub(crate) fn rewrite_links(
    text: &str,
    map: impl Fn(&str) -> Option<String>,
) -> (String, Vec<LinkChange>) {
    let mut out = String::with_capacity(text.len());
    let mut changes = Vec::new();
    for (number, (line, kind)) in classify(text).into_iter().enumerate() {
        if kind == LineKind::Literal {
            out.push_str(line);
            continue;
        }
        let mut done = 0;
        for (start, end) in link_targets(line) {
            let old = &line[start..end];
            if let Some(new) = map(old).filter(|new| new != old) {
                out.push_str(&line[done..start]);
                out.push_str(&new);
                done = end;
                changes.push(LinkChange {
                    line: number as u32 + 1,
                    old: old.to_string(),
                    new,
                });
            }
        }
        out.push_str(&line[done..]);
    }
    (out, changes)
}

/// Byte ranges of the link targets in `line`, outside code spans.
fn link_targets(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut targets = Vec::new();

    // A link reference definition: `[label]: target`.
    let indent = line.len() - line.trim_start_matches(' ').len();
    if indent <= 3
        && line[indent..].starts_with('[')
        && let Some(close) = line[indent..].find("]:")
    {
        let after = indent + close + 2;
        let start = after + (line[after..].len() - line[after..].trim_start().len());
        if let Some(range) = target_at(line, start) {
            targets.push(range);
        }
        return targets;
    }

    let mut code = 0;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            let run = bytes[i..].iter().take_while(|b| **b == b'`').count();
            if code == 0 {
                code = run;
            } else if code == run {
                code = 0;
            }
            i += run;
            continue;
        }
        if code == 0
            && bytes[i] == b']'
            && bytes.get(i + 1) == Some(&b'(')
            && let Some(range) = target_at(line, i + 2)
        {
            targets.push(range);
            i = range.1;
            continue;
        }
        i += 1;
    }
    // A code span left open at the end of the line is no code span; such lines are rare enough
    // that their links are left alone.
    targets
}

/// The range of a link target starting at `start`: `<...>`, or up to a space or the `)` that
/// closes the link.
fn target_at(line: &str, start: usize) -> Option<(usize, usize)> {
    let rest = &line[start..];
    if let Some(inner) = rest.strip_prefix('<') {
        let end = inner.find('>')?;
        return Some((start + 1, start + 1 + end));
    }
    let mut depth = 0usize;
    for (offset, c) in rest.char_indices() {
        match c {
            '(' => depth += 1,
            ')' if depth == 0 => return (offset > 0).then_some((start, start + offset)),
            ')' => depth -= 1,
            c if c.is_whitespace() => return (offset > 0).then_some((start, start + offset)),
            _ => {}
        }
    }
    (!rest.is_empty()).then_some((start, line.len()))
}

/// A file that moved, both paths relative to the repository root with `/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Move {
    pub from: String,
    pub to: String,
}

/// What [`rewrite_after_moves`] did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MoveLinks {
    /// The files whose links were rewritten, with each change, in walk order.
    pub rewritten: Vec<FileLinks>,
    /// Files whose links could not be rewritten, and why.
    pub problems: Vec<String>,
}

impl MoveLinks {
    pub fn is_empty(&self) -> bool {
        self.rewritten.is_empty() && self.problems.is_empty()
    }
}

/// Every markdown file of the repository at `repo_root` that is searched for links, sorted by
/// path, with its path relative to the repository root (`/` separated). See [`searched`].
pub fn markdown_files(repo_root: &Path, planning: &Path) -> Vec<(PathBuf, String)> {
    WalkDir::new(repo_root)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || searched(entry.path(), planning))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let relative = entry.path().strip_prefix(repo_root).ok()?;
            if relative.extension().is_none_or(|ext| ext != "md") {
                return None;
            }
            let relative = relative.to_string_lossy().replace('\\', "/");
            Some((entry.into_path(), relative))
        })
        .collect()
}

/// `target` split into its path and the rest (`?query` or `#anchor`, kept as written), when
/// it is a relative path: not empty, not root-absolute and without a scheme.
pub(crate) fn local_path(target: &str) -> Option<(&str, &str)> {
    let at = target.find(['?', '#']).unwrap_or(target.len());
    let (path, rest) = target.split_at(at);
    let local = !path.is_empty() && !path.starts_with('/') && !has_scheme(path);
    local.then_some((path, rest))
}

/// The path `path` of a link (percent escapes decoded) resolved from the folder `dir`, as
/// normal components from the same root as `dir`. `None` when it climbs above that root.
pub(crate) fn resolve(dir: &[String], path: &str) -> Option<Vec<String>> {
    let mut resolved: Vec<String> = dir.to_vec();
    for part in Path::new(&percent_decode(path)).components() {
        match part {
            Component::Normal(name) => resolved.push(name.to_string_lossy().into_owned()),
            Component::ParentDir => {
                resolved.pop()?;
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(resolved)
}

/// The components of a `/` separated relative path.
pub(crate) fn components(path: &str) -> Vec<String> {
    path.split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .map(str::to_string)
        .collect()
}

/// The relative link from a file in the folder `dir` to the file `to`, both from the same
/// root, written in the manner of `old`: a leading `./` is kept, and characters a bare link
/// cannot hold are percent escaped unless `old` held a raw space (a `<...>` target).
pub(crate) fn relative_link(dir: &[String], to: &[String], old: &str) -> String {
    let common = dir.iter().zip(to).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<&str> = vec![".."; dir.len() - common];
    parts.extend(to[common..].iter().map(String::as_str));
    let mut link = parts.join("/");
    if !old.contains(' ') {
        link = escape(&link);
    }
    if old.starts_with("./") && !link.starts_with("../") {
        link = format!("./{link}");
    }
    link
}

/// `path` with the characters a bare link target cannot hold percent escaped.
fn escape(path: &str) -> String {
    path.replace('%', "%25")
        .replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
        .replace('<', "%3C")
        .replace('>', "%3E")
}

/// Rewrites the links broken by `moves` in the repository at `repo_root`, whose planning root
/// is `planning_root`: links to a moved file in every searched markdown file, and the links
/// inside each moved file, which were written from its old folder. Each file is written with
/// [`files::save_text`] against the text read, so a file changed meanwhile is left as it is
/// and named in the problems.
pub fn rewrite_after_moves(repo_root: &Path, planning_root: &str, moves: &[Move]) -> MoveLinks {
    let mut report = MoveLinks::default();
    for planned in plan_after_moves(repo_root, planning_root, moves, &mut report.problems) {
        let Planned {
            path,
            file,
            old,
            new,
            changes,
        } = planned;
        match files::save_text(&path, &old, &new) {
            Ok(SaveOutcome::Saved) => report.rewritten.push(FileLinks { file, changes }),
            Ok(SaveOutcome::ChangedOnDisk { .. }) => report.problems.push(format!(
                "{file} changed while its links were rewritten; it was left as it is"
            )),
            Err(err) => report
                .problems
                .push(format!("could not rewrite the links in {file}: {err}")),
        }
    }
    report
}

/// One file [`rewrite_after_moves`] writes.
struct Planned {
    path: PathBuf,
    /// Relative to the repository root.
    file: String,
    /// The text as read.
    old: String,
    /// The text with its links rewritten.
    new: String,
    changes: Vec<LinkChange>,
}

/// The files whose links `moves` broke, with their new text. Files that cannot be read or
/// checked are added to `problems`.
fn plan_after_moves(
    repo_root: &Path,
    planning_root: &str,
    moves: &[Move],
    problems: &mut Vec<String>,
) -> Vec<Planned> {
    let moves: Vec<&Move> = moves.iter().filter(|m| m.from != m.to).collect();
    if moves.is_empty() {
        return Vec::new();
    }
    let new_place: HashMap<Vec<String>, Vec<String>> = moves
        .iter()
        .map(|m| (components(&m.from), components(&m.to)))
        .collect();
    let old_place: HashMap<&str, &str> = moves
        .iter()
        .map(|m| (m.to.as_str(), m.from.as_str()))
        .collect();
    // A file that links to a moved file holds its name, as written or escaped.
    let names: Vec<String> = moves
        .iter()
        .filter_map(|m| m.from.rsplit('/').next())
        .flat_map(|name| [name.to_string(), escape(name)])
        .collect();
    let exists = |parts: &[String]| {
        parts
            .iter()
            .fold(repo_root.to_path_buf(), |path, part| path.join(part))
            .exists()
    };
    let parent = |parts: Vec<String>| parts[..parts.len().saturating_sub(1)].to_vec();

    let mut planned = Vec::new();
    for (path, file) in markdown_files(repo_root, &repo_root.join(planning_root)) {
        let was = old_place.get(file.as_str()).copied();
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => {
                problems.push(format!("could not read {file}: {err}"));
                continue;
            }
        };
        if was.is_none() && !names.iter().any(|name| contains(&bytes, name.as_bytes())) {
            continue;
        }
        let Ok(old) = String::from_utf8(bytes) else {
            problems.push(format!(
                "could not check the links in {file}: it is not UTF-8 text"
            ));
            continue;
        };
        let dir_now = parent(components(&file));
        let dir_before = parent(components(was.unwrap_or(&file)));
        let (new, changes) = rewrite_links(&old, |target| {
            let (link, rest) = local_path(target)?;
            // A link climbing above the repository from here is broken too.
            if resolve(&dir_now, link).is_some_and(|now| exists(&now)) {
                return None;
            }
            let before = resolve(&dir_before, link)?;
            let after = new_place.get(&before).cloned().unwrap_or(before);
            exists(&after).then(|| format!("{}{rest}", relative_link(&dir_now, &after, link)))
        });
        if !changes.is_empty() {
            planned.push(Planned {
                path,
                file,
                old,
                new,
                changes,
            });
        }
    }
    planned
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ids::random_suffix;

    const A: &str = "20261031-000001-aaaa-one.md";
    const B: &str = "20261031-000002-bbbb-two.md";
    const C: &str = "20261031-000003-cccc-three.md";

    /// A repository holding `files` (path relative to the repository root, text).
    fn repo(files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-links-{}", random_suffix()));
        for (file, text) in files {
            let path = root.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        root
    }

    /// Moves files as an agent or the board does, then rewrites the links for those moves.
    fn move_files(root: &Path, moves: &[(&str, &str)]) -> MoveLinks {
        let moves: Vec<Move> = moves
            .iter()
            .map(|(from, to)| {
                let target = root.join(to);
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::rename(root.join(from), target).unwrap();
                Move {
                    from: from.to_string(),
                    to: to.to_string(),
                }
            })
            .collect();
        rewrite_after_moves(root, "docs/planning", &moves)
    }

    fn read(root: &Path, file: &str) -> String {
        std::fs::read_to_string(root.join(file)).unwrap()
    }

    fn files(report: &MoveLinks) -> Vec<&str> {
        report.rewritten.iter().map(|f| f.file.as_str()).collect()
    }

    #[test]
    fn a_move_between_columns_rewrites_links_to_it_and_in_it() {
        let moved = format!(
            "---\nid: 20261031-000001-aaaa\ntitle: \"One: [x]({B})\"\n---\n\n\
             Implements the [spec](../spec.md#structure), after [two]({B}) and [three](./{C}).\n\
             Not [web](https://example.com/{B}), [here](#result) or [root](/docs/planning/next/{B}).\n\
             Code `[two]({B})` stays.\n\n```\n[two]({B})\n```\n\n[ref]: {B} \"title\"\n"
        );
        let inbox_c = format!("docs/planning/inbox/{C}");
        let next_b = format!("docs/planning/next/{B}");
        let root = repo(&[
            ("docs/planning/spec.md", "# Spec\n"),
            (&format!("docs/planning/next/{A}"), &moved),
            (&next_b, &format!("Sibling [one]({A}).\n")),
            (&format!("docs/planning/next/{C}"), "Unrelated.\n"),
            (
                &inbox_c,
                &format!("Before [one](../next/{A}) and [again](<../next/{A}#result>).\n"),
            ),
            (
                "docs/planning/braindump.md",
                &format!("- [one](next/{A})\n"),
            ),
            (
                "README.md",
                &format!("[one](docs/planning/next/{A}) [two](docs/planning/next/{B})\n"),
            ),
            ("docs/planning/done/.keep", ""),
        ]);
        let from = format!("docs/planning/next/{A}");
        let to = format!("docs/planning/done/{A}");

        let report = move_files(&root, &[(&from, &to)]);
        assert_eq!(report.problems, Vec::<String>::new());
        assert_eq!(
            files(&report),
            [
                "README.md",
                "docs/planning/braindump.md",
                to.as_str(),
                inbox_c.as_str(),
                next_b.as_str(),
            ]
        );
        assert_eq!(
            read(&root, &to),
            format!(
                "---\nid: 20261031-000001-aaaa\ntitle: \"One: [x]({B})\"\n---\n\n\
                 Implements the [spec](../spec.md#structure), after [two](../next/{B}) and [three](../next/{C}).\n\
                 Not [web](https://example.com/{B}), [here](#result) or [root](/docs/planning/next/{B}).\n\
                 Code `[two]({B})` stays.\n\n```\n[two]({B})\n```\n\n[ref]: ../next/{B} \"title\"\n"
            )
        );
        assert_eq!(
            read(&root, &inbox_c),
            format!("Before [one](../done/{A}) and [again](<../done/{A}#result>).\n")
        );
        assert_eq!(
            read(&root, &next_b),
            format!("Sibling [one](../done/{A}).\n")
        );
        assert_eq!(
            read(&root, "docs/planning/braindump.md"),
            format!("- [one](done/{A})\n")
        );
        assert_eq!(
            read(&root, "README.md"),
            format!("[one](docs/planning/done/{A}) [two](docs/planning/next/{B})\n")
        );
        assert_eq!(
            read(&root, &format!("docs/planning/next/{C}")),
            "Unrelated.\n"
        );
        assert_eq!(
            report.rewritten[0].changes,
            [LinkChange {
                line: 1,
                old: format!("docs/planning/next/{A}"),
                new: format!("docs/planning/done/{A}"),
            }]
        );

        // The same moves again, as a later batch might bring them, change nothing.
        let again = rewrite_after_moves(&root, "docs/planning", &[Move { from, to }]);
        assert_eq!(again, MoveLinks::default());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn tasks_moved_together_into_the_archive_keep_their_links_to_each_other() {
        let done_a = format!("docs/planning/done/{A}");
        let done_b = format!("docs/planning/done/{B}");
        let next_c = format!("docs/planning/next/{C}");
        let root = repo(&[
            ("docs/planning/spec.md", "# Spec\n"),
            (
                &done_a,
                &format!("[two]({B}), [spec](../spec.md), [three](../next/{C})\n"),
            ),
            (&done_b, &format!("[one](./{A})\n")),
            (&next_c, &format!("Needs [one](../done/{A}).\n")),
        ]);
        let archived_a = format!("docs/planning/done/2026-10/{A}");
        let archived_b = format!("docs/planning/done/2026-10/{B}");
        let report = move_files(&root, &[(&done_a, &archived_a), (&done_b, &archived_b)]);
        assert_eq!(report.problems, Vec::<String>::new());
        assert_eq!(
            read(&root, &archived_a),
            format!("[two]({B}), [spec](../../spec.md), [three](../../next/{C})\n")
        );
        assert_eq!(read(&root, &archived_b), format!("[one](./{A})\n"));
        assert_eq!(
            read(&root, &next_c),
            format!("Needs [one](../done/2026-10/{A}).\n")
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_move_into_a_subfolder_and_back_out() {
        let inbox_a = format!("docs/planning/inbox/{A}");
        let root = repo(&[
            ("docs/planning/braindump.md", &format!("[one](inbox/{A})\n")),
            (
                &inbox_a,
                "[dump](../braindump.md) [img](../../images/a%20b.png)\n",
            ),
            ("docs/images/a b.png", "png"),
        ]);
        let deep = format!("docs/planning/inbox/later/ideas/{A}");
        move_files(&root, &[(&inbox_a, &deep)]);
        assert_eq!(
            read(&root, "docs/planning/braindump.md"),
            format!("[one](inbox/later/ideas/{A})\n")
        );
        assert_eq!(
            read(&root, &deep),
            "[dump](../../../braindump.md) [img](../../../../images/a%20b.png)\n"
        );

        let top = format!("docs/planning/{A}");
        move_files(&root, &[(&deep, &top)]);
        assert_eq!(
            read(&root, "docs/planning/braindump.md"),
            format!("[one]({A})\n")
        );
        assert_eq!(
            read(&root, &top),
            "[dump](braindump.md) [img](../images/a%20b.png)\n"
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn links_that_still_resolve_or_were_already_fixed_are_left_alone() {
        let from = format!("docs/planning/next/{A}");
        let to = format!("docs/planning/done/{A}");
        let root = repo(&[
            ("docs/planning/spec.md", "# Spec\n"),
            (&format!("docs/planning/next/{B}"), "Other.\n"),
            (&from, "x\n"),
            ("docs/planning/done/.keep", ""),
        ]);
        // An agent moves the task and fixes the links itself before the batch is handled.
        std::fs::rename(root.join(&from), root.join(&to)).unwrap();
        let fixed = format!("[spec](../spec.md) [two](../next/{B}) [missing](nowhere.md)\n");
        std::fs::write(root.join(&to), &fixed).unwrap();
        let note = format!("[gone](../next/{C}) [one](../done/{A})\n");
        std::fs::write(root.join("docs/planning/inbox.md"), &note).unwrap();

        let report = rewrite_after_moves(
            &root,
            "docs/planning",
            &[Move {
                from,
                to: to.clone(),
            }],
        );
        assert_eq!(report, MoveLinks::default());
        assert_eq!(read(&root, &to), fixed);
        assert_eq!(read(&root, "docs/planning/inbox.md"), note);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn hidden_and_skipped_folders_are_not_touched_and_unreadable_text_is_reported() {
        let next_a = format!("docs/planning/next/{A}");
        let link = format!("[one](../{next_a})\n");
        let root = repo(&[
            (&next_a, "x\n"),
            (".github/x.md", &link),
            ("node_modules/x.md", &link),
            ("notes/x.txt", &link),
        ]);
        let mut latin = format!("[one](../{next_a}) caf").into_bytes();
        latin.push(0xe9);
        std::fs::write(root.join("notes/latin.md"), latin).unwrap();
        std::fs::write(root.join("notes/other.md"), b"caf\xe9\n").unwrap();

        let report = move_files(&root, &[(&next_a, &format!("docs/planning/done/{A}"))]);
        assert_eq!(report.rewritten, Vec::<FileLinks>::new());
        assert_eq!(
            report.problems,
            ["could not check the links in notes/latin.md: it is not UTF-8 text"]
        );
        for file in [".github/x.md", "node_modules/x.md", "notes/x.txt"] {
            assert_eq!(read(&root, file), link, "{file}");
        }
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_file_changed_meanwhile_is_not_written() {
        let root = repo(&[
            (&format!("docs/planning/next/{A}"), "x\n"),
            ("docs/planning/note.md", &format!("[one](next/{A})\n")),
        ]);
        std::fs::create_dir_all(root.join("docs/planning/done")).unwrap();
        std::fs::rename(
            root.join(format!("docs/planning/next/{A}")),
            root.join(format!("docs/planning/done/{A}")),
        )
        .unwrap();
        let moves = [Move {
            from: format!("docs/planning/next/{A}"),
            to: format!("docs/planning/done/{A}"),
        }];
        let mut problems = Vec::new();
        let planned = plan_after_moves(&root, "docs/planning", &moves, &mut problems);
        assert_eq!(planned.len(), 1);
        let edited = format!("[one](next/{A}) and more\n");
        std::fs::write(&planned[0].path, &edited).unwrap();
        assert_eq!(
            files::save_text(&planned[0].path, &planned[0].old, &planned[0].new),
            Ok(SaveOutcome::ChangedOnDisk {
                text: edited.clone()
            })
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn relative_links_follow_the_style_of_the_old_one() {
        let parts = |path: &str| components(path);
        assert_eq!(
            relative_link(&parts("a/b"), &parts("a/c/x.md"), "x.md"),
            "../c/x.md"
        );
        assert_eq!(
            relative_link(&parts("a"), &parts("a/x.md"), "./y.md"),
            "./x.md"
        );
        assert_eq!(
            relative_link(&parts(""), &parts("a b/(x).md"), "y.md"),
            "a%20b/%28x%29.md"
        );
        assert_eq!(
            relative_link(&parts(""), &parts("a b/x.md"), "old name.md"),
            "a b/x.md"
        );
        assert_eq!(local_path("x.md#a?b"), Some(("x.md", "#a?b")));
        assert_eq!(local_path("#a"), None);
        assert_eq!(local_path("mailto:x"), None);
        assert_eq!(resolve(&parts("a"), "../../x.md"), None);
    }
}
