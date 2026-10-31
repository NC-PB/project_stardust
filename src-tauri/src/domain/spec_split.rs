//! Splitting `spec.md` into the folder form (`S-spec-split`).
//!
//! The text of `spec.md` is cut at its `## ` headings into the files of [`FOLDER_FILES`], as
//! the folder form expects (D-20261031-010617-ryfp). Links in planning files that point into
//! `spec.md` are rewritten to the file that now holds their heading, and so are the links in
//! the moved text itself. `spec.md` goes to the OS trash only after the folder was written,
//! read back and found to give the same model (`R-no-destroy`).
//!
//! The order keeps every text on disk at every step: the folder is created first, never over
//! an existing file; the links are rewritten next; `spec.md` goes to the trash last. When a
//! step fails, the steps before it are undone (rewritten links written back, the new files
//! moved to the trash) and `spec.md` stays where it is.

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use specta::Type;
use walkdir::WalkDir;

use super::agents_block::{self, START_MARKER};
use super::config::{Config, SpecLocation};
use super::files::{self, SaveOutcome, has_scheme, percent_decode};
use super::spec::{
    FOLDER_FILES, SPEC_FILE, SPEC_FOLDER, SectionKind, Spec, SpecForm, parse_spec, parse_spec_text,
    read_spec,
};

/// What a split would do, shown before it runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SplitPlan {
    /// `spec.md`, relative to the repository root.
    pub location: String,
    /// Why the split cannot run. Empty when it can.
    pub blockers: Vec<String>,
    /// The files the split creates, in reading order.
    pub files: Vec<SplitFile>,
    /// The links the split rewrites, by file. The moved text of the spec is listed under its
    /// new files.
    pub links: Vec<FileLinks>,
}

/// One file of the folder form the split creates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SplitFile {
    /// Relative to the planning root, `spec/<name>.md`.
    pub file: String,
    pub lines: u32,
    pub bytes: u32,
    /// The first non-blank line after the frontmatter: the section heading or the title.
    pub first_line: String,
}

/// The links rewritten in one file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FileLinks {
    /// Relative to the planning root.
    pub file: String,
    pub changes: Vec<LinkChange>,
}

/// One rewritten link target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct LinkChange {
    /// 1-based line in the file.
    pub line: u32,
    pub old: String,
    pub new: String,
}

/// What a split did. Paths are relative to the planning root, except `block_written`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SplitReport {
    pub created: Vec<String>,
    /// Files whose links were rewritten, the new spec files not included.
    pub rewritten: Vec<String>,
    /// `spec.md`, now in the OS trash.
    pub trashed: String,
    /// Files rewritten because the planner block now points to `spec/`, relative to the
    /// repository root.
    pub block_written: Vec<String>,
    /// Why the planner block could not be regenerated, if it could not.
    pub block_error: Option<String>,
}

/// What a split of the spec in the repository at `repo_root` would do. Writes nothing.
pub fn plan_split(repo_root: &Path, config: &Config) -> SplitPlan {
    prepare(repo_root, config).plan
}

/// Splits `spec.md` into the `spec/` folder, rewrites the links into it and moves `spec.md`
/// to the OS trash. Refuses when [`plan_split`] reports a blocker; nothing is changed then.
pub fn split_spec(repo_root: &Path, config: &Config) -> Result<SplitReport, String> {
    split_spec_with(repo_root, config, &|path| {
        files::trash_file(repo_root, path)
    })
}

/// Everything a split needs, worked out before anything is written.
struct Prepared {
    plan: SplitPlan,
    /// The text of `spec.md` as read.
    text: String,
    /// The model of `spec.md`.
    before: Option<Spec>,
    /// (name in `spec/`, text with its links rewritten).
    parts: Vec<(&'static str, String)>,
    /// (planning file, text as read, text with its links rewritten).
    rewrites: Vec<(PathBuf, String, String)>,
}

fn prepare(repo_root: &Path, config: &Config) -> Prepared {
    let root = &config.planning_root;
    let planning = repo_root.join(root);
    let mut prepared = Prepared {
        plan: SplitPlan {
            location: format!("{root}/{SPEC_FILE}"),
            blockers: Vec::new(),
            files: Vec::new(),
            links: Vec::new(),
        },
        text: String::new(),
        before: None,
        parts: Vec::new(),
        rewrites: Vec::new(),
    };
    let blockers = &mut prepared.plan.blockers;
    if config.spec == SpecLocation::File {
        blockers.push(
            "`spec: file` in the config always reads spec.md; set it to `auto` or `folder` first"
                .to_string(),
        );
    }
    if std::fs::symlink_metadata(planning.join(SPEC_FOLDER)).is_ok() {
        blockers.push(format!("{root}/{SPEC_FOLDER}/ exists already"));
    }
    let text = match std::fs::read_to_string(planning.join(SPEC_FILE)) {
        Ok(text) => text,
        Err(err) => {
            blockers.push(format!("could not read {root}/{SPEC_FILE}: {err}"));
            return prepared;
        }
    };

    let cuts = match cut(&text) {
        Ok(cuts) => cuts,
        Err(problems) => {
            blockers.extend(problems);
            return prepared;
        }
    };
    let anchors = anchors(&text, &cuts);
    for (index, (name, range)) in cuts.iter().enumerate() {
        let (part, changes) = rewrite_links(&text[range.clone()], |target| {
            spec_link(target, index, &cuts, &anchors)
        });
        let file = format!("{SPEC_FOLDER}/{name}");
        if !changes.is_empty() {
            prepared.plan.links.push(FileLinks {
                file: file.clone(),
                changes,
            });
        }
        prepared.plan.files.push(SplitFile {
            file,
            lines: part.lines().count() as u32,
            bytes: part.len() as u32,
            first_line: first_line(&part),
        });
        prepared.parts.push((name, part));
    }

    let before = parse_spec(
        SpecForm::File,
        prepared.plan.location.clone(),
        &[(SPEC_FILE.to_string(), text.clone())],
        true,
    );
    let after = parse_spec(
        SpecForm::Folder,
        format!("{root}/{SPEC_FOLDER}/"),
        &prepared
            .parts
            .iter()
            .map(|(name, part)| (format!("{SPEC_FOLDER}/{name}"), part.clone()))
            .collect::<Vec<_>>(),
        true,
    );
    if let Some(problem) = difference(&before, &after) {
        prepared.plan.blockers.push(problem);
    }
    prepared.before = Some(before);

    for entry in WalkDir::new(&planning)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path();
        let Ok(relative) = path.strip_prefix(&planning) else {
            continue;
        };
        if relative == Path::new(SPEC_FILE) || relative.extension().is_none_or(|ext| ext != "md") {
            continue;
        }
        let file = relative.to_string_lossy().replace('\\', "/");
        let old = match std::fs::read_to_string(path) {
            Ok(old) => old,
            Err(err) => {
                prepared
                    .plan
                    .blockers
                    .push(format!("could not read {root}/{file}: {err}"));
                continue;
            }
        };
        let dir = relative.parent().unwrap_or(Path::new(""));
        let (new, changes) = rewrite_links(&old, |target| {
            let (prefix, anchor) = into_spec(target, dir)?;
            let (index, anchor) = locate(anchor, &anchors);
            Some(format!(
                "{prefix}{SPEC_FOLDER}/{}{}",
                cuts[index].0,
                with_hash(anchor.as_deref())
            ))
        });
        if !changes.is_empty() {
            prepared.plan.links.push(FileLinks { file, changes });
            prepared.rewrites.push((path.to_path_buf(), old, new));
        }
    }
    prepared.text = text;
    prepared
}

/// [`split_spec`] with the trash passed in, so tests need not use the OS trash.
fn split_spec_with(
    repo_root: &Path,
    config: &Config,
    trash: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<SplitReport, String> {
    let prepared = prepare(repo_root, config);
    if !prepared.plan.blockers.is_empty() {
        return Err(prepared.plan.blockers.join("; "));
    }
    let planning = repo_root.join(&config.planning_root);
    let folder = planning.join(SPEC_FOLDER);
    let spec_path = planning.join(SPEC_FILE);
    let relative = |path: &Path| {
        path.strip_prefix(&planning)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    };

    let mut undo = Undo {
        folder: folder.clone(),
        created: Vec::new(),
        rewritten: Vec::new(),
        trash,
    };
    std::fs::create_dir(&folder)
        .map_err(|err| format!("could not create {SPEC_FOLDER}/: {err}; nothing was changed"))?;
    for (name, part) in &prepared.parts {
        let path = folder.join(name);
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(err) => {
                return Err(undo.fail(format!("could not create {SPEC_FOLDER}/{name}: {err}")));
            }
        };
        undo.created.push(path);
        if let Err(err) = file.write_all(part.as_bytes()) {
            return Err(undo.fail(format!("could not write {SPEC_FOLDER}/{name}: {err}")));
        }
    }

    let folder_config = Config {
        spec: SpecLocation::Folder,
        ..config.clone()
    };
    let read_back = read_spec(repo_root, &folder_config);
    if let Some(before) = &prepared.before
        && let Some(problem) = difference(before, &read_back)
    {
        return Err(undo.fail(format!("the written folder reads differently: {problem}")));
    }

    for (path, old, new) in &prepared.rewrites {
        match files::save_text(path, old, new) {
            Ok(SaveOutcome::Saved) => undo
                .rewritten
                .push((path.clone(), old.clone(), new.clone())),
            Ok(SaveOutcome::ChangedOnDisk { .. }) => {
                return Err(undo.fail(format!("{} changed during the split", relative(path))));
            }
            Err(err) => {
                return Err(undo.fail(format!("could not rewrite {}: {err}", relative(path))));
            }
        }
    }

    match std::fs::read_to_string(&spec_path) {
        Ok(text) if text == prepared.text => {}
        _ => return Err(undo.fail(format!("{SPEC_FILE} changed during the split"))),
    }
    trash(&spec_path).map_err(|err| {
        format!(
            "{SPEC_FOLDER}/ is written and the links point to it, but {SPEC_FILE} could not be \
             moved to the trash ({err}); it holds the same text, move it away by hand"
        )
    })?;

    let (block_written, block_error) = regenerate_block(repo_root, config);
    Ok(SplitReport {
        created: undo.created.iter().map(|path| relative(path)).collect(),
        rewritten: undo
            .rewritten
            .iter()
            .map(|(path, ..)| relative(path))
            .collect(),
        trashed: SPEC_FILE.to_string(),
        block_written,
        block_error,
    })
}

/// The steps of a split so far, undone when a later step fails.
struct Undo<'t> {
    folder: PathBuf,
    created: Vec<PathBuf>,
    /// (file, text before, text written).
    rewritten: Vec<(PathBuf, String, String)>,
    trash: &'t dyn Fn(&Path) -> Result<(), String>,
}

impl Undo<'_> {
    /// Undoes the steps so far and returns `message` with what became of them.
    fn fail(&self, message: String) -> String {
        let mut problems = Vec::new();
        for (path, old, new) in self.rewritten.iter().rev() {
            match files::save_text(path, new, old) {
                Ok(SaveOutcome::Saved) => {}
                Ok(SaveOutcome::ChangedOnDisk { .. }) => problems.push(format!(
                    "{} changed meanwhile and keeps its new links",
                    path.display()
                )),
                Err(err) => problems.push(format!("{}: {err}", path.display())),
            }
        }
        for path in self.created.iter().rev() {
            if let Err(err) = (self.trash)(path) {
                problems.push(format!("{}: {err}", path.display()));
            }
        }
        // Empty by now; a folder that still holds a file is left alone.
        if problems.is_empty()
            && let Err(err) = std::fs::remove_dir(&self.folder)
        {
            problems.push(format!("{}: {err}", self.folder.display()));
        }
        if problems.is_empty() {
            format!("{message}; nothing was changed, {SPEC_FILE} stays")
        } else {
            format!(
                "{message}; {SPEC_FILE} stays, but undoing the split failed: {}",
                problems.join("; ")
            )
        }
    }
}

/// Regenerates the planner block when the agents file has one, so it names `spec/`.
fn regenerate_block(repo_root: &Path, config: &Config) -> (Vec<String>, Option<String>) {
    let has_block = std::fs::read_to_string(repo_root.join(&config.agents_file))
        .is_ok_and(|text| text.contains(START_MARKER));
    if !has_block {
        return (Vec::new(), None);
    }
    match agents_block::write_planner_block(repo_root, config) {
        Ok(report) => (report.written, None),
        Err(err) => (Vec::new(), Some(err)),
    }
}

// ---------------------------------------------------------------------------------------------
// Cutting the text

type Cuts = Vec<(&'static str, std::ops::Range<usize>)>;

/// The byte ranges of `text` for each file of the folder form, in reading order. `README.md`
/// takes everything before the first section. Fails with the reasons when a section has no
/// file of its own or the sections are not in the reading order of the folder form.
fn cut(text: &str) -> Result<Cuts, Vec<String>> {
    let starts: Vec<usize> = std::iter::once(0)
        .chain(text.split_inclusive('\n').scan(0, |end, line| {
            *end += line.len();
            Some(*end)
        }))
        .collect();
    let mut problems = Vec::new();
    let mut cuts: Cuts = vec![("README.md", 0..text.len())];
    let mut last = 0;
    for section in parse_spec_text(SPEC_FILE, text).sections {
        let line = section.at.line;
        let Some(position) = FOLDER_FILES.iter().position(|(_, kind)| {
            section.kind != SectionKind::Other && *kind == Some(section.kind)
        }) else {
            problems.push(format!(
                "line {line}: the section \"{}\" has no file in the folder form",
                section.heading
            ));
            continue;
        };
        if position == last {
            problems.push(format!("line {line}: second {} section", section.heading));
            continue;
        }
        if position < last {
            problems.push(format!(
                "line {line}: {} comes after {}; the folder form reads {}",
                section.heading,
                FOLDER_FILES[last].1.map_or("", SectionKind::heading),
                FOLDER_FILES[1..]
                    .iter()
                    .filter_map(|(_, kind)| kind.map(SectionKind::heading))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            continue;
        }
        last = position;
        let start = starts[line as usize - 1];
        cuts.last_mut().expect("README.md").1.end = start;
        cuts.push((FOLDER_FILES[position].0, start..text.len()));
    }
    if problems.is_empty() {
        Ok(cuts)
    } else {
        Err(problems)
    }
}

fn first_line(text: &str) -> String {
    let mut lines = text.lines();
    let mut first = lines.next();
    if first.is_some_and(|line| line.trim_end() == "---") {
        let mut rest = lines
            .by_ref()
            .skip_while(|line| !matches!(line.trim_end(), "---" | "..."));
        rest.next();
        first = lines.next();
    }
    std::iter::successors(first, |_| lines.next())
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default()
        .to_string()
}

// ---------------------------------------------------------------------------------------------
// Headings and anchors

/// The anchors of `spec.md` (as GitHub makes them from its headings) mapped to the index of
/// the file that holds the heading after the split and its anchor in that file.
fn anchors(text: &str, cuts: &Cuts) -> HashMap<String, (usize, String)> {
    let mut old_seen: HashMap<String, usize> = HashMap::new();
    let mut new_seen: Vec<HashMap<String, usize>> = vec![HashMap::new(); cuts.len()];
    let mut anchors = HashMap::new();
    let mut offset = 0;
    for (line, kind) in classify(text) {
        let start = offset;
        offset += line.len();
        let LineKind::Text = kind else { continue };
        let Some(heading) = heading_text(line) else {
            continue;
        };
        let slug = slug(heading);
        let index = cuts
            .iter()
            .position(|(_, range)| range.contains(&start))
            .unwrap_or(0);
        let old = numbered(&mut old_seen, &slug);
        let new = numbered(&mut new_seen[index], &slug);
        anchors.entry(old).or_insert((index, new));
    }
    anchors
}

/// `slug`, numbered as GitHub numbers repeated headings in one file: `a`, `a-1`, `a-2`.
fn numbered(seen: &mut HashMap<String, usize>, slug: &str) -> String {
    let count = seen.entry(slug.to_string()).or_insert(0);
    let anchor = if *count == 0 {
        slug.to_string()
    } else {
        format!("{slug}-{count}")
    };
    *count += 1;
    anchor
}

/// The text of an ATX heading line, without the `#` marks.
fn heading_text(line: &str) -> Option<&str> {
    let line = line.trim_end();
    let indent = line.len() - line.trim_start_matches(' ').len();
    let rest = &line[indent..];
    let level = rest.len() - rest.trim_start_matches('#').len();
    if indent > 3 || !(1..=6).contains(&level) {
        return None;
    }
    let rest = &rest[level..];
    if !rest.is_empty() && !rest.starts_with([' ', '\t']) {
        return None;
    }
    let rest = rest.trim();
    let closed = rest.trim_end_matches('#');
    Some(if closed.is_empty() || closed.ends_with([' ', '\t']) {
        closed.trim_end()
    } else {
        rest
    })
}

/// The anchor GitHub gives a heading: lowercase, spaces as `-`, punctuation dropped.
fn slug(heading: &str) -> String {
    heading
        .trim()
        .to_lowercase()
        .chars()
        .filter_map(|c| match c {
            ' ' => Some('-'),
            '-' | '_' => Some(c),
            c if c.is_alphanumeric() => Some(c),
            _ => None,
        })
        .collect()
}

/// The file index and anchor of `#anchor` after the split. An unknown anchor stays as it is,
/// in `README.md`; no anchor means `README.md`.
fn locate(
    anchor: Option<&str>,
    anchors: &HashMap<String, (usize, String)>,
) -> (usize, Option<String>) {
    match anchor {
        None => (0, None),
        Some(anchor) => match anchors.get(&percent_decode(anchor).to_lowercase()) {
            Some((index, new)) => (*index, Some(new.clone())),
            None => (0, Some(anchor.to_string())),
        },
    }
}

fn with_hash(anchor: Option<&str>) -> String {
    anchor
        .map(|anchor| format!("#{anchor}"))
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// Links

/// When `target`, a link in a file in the folder `dir` (relative to the planning root), points
/// to `spec.md`: the part of the target before the file name and the anchor.
fn into_spec<'t>(target: &'t str, dir: &Path) -> Option<(&'t str, Option<&'t str>)> {
    let (path, anchor) = match target.split_once('#') {
        Some((path, anchor)) => (path, Some(anchor)),
        None => (target, None),
    };
    if path.is_empty() || path.contains('?') || path.starts_with('/') || has_scheme(path) {
        return None;
    }
    let mut resolved: Vec<String> = Vec::new();
    for part in dir.join(percent_decode(path)).components() {
        match part {
            Component::Normal(name) => resolved.push(name.to_string_lossy().into_owned()),
            Component::ParentDir => {
                resolved.pop()?;
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    (resolved == [SPEC_FILE]).then(|| (&path[..path.rfind('/').map_or(0, |i| i + 1)], anchor))
}

/// The new target of `target`, a link in the moved text of file `index`.
fn spec_link(
    target: &str,
    index: usize,
    cuts: &Cuts,
    anchors: &HashMap<String, (usize, String)>,
) -> Option<String> {
    let in_spec = |anchor: Option<&str>| {
        let (to, new) = locate(anchor, anchors);
        if to == index && new.is_some() {
            with_hash(new.as_deref())
        } else {
            format!("{}{}", cuts[to].0, with_hash(new.as_deref()))
        }
    };
    if let Some(anchor) = target.strip_prefix('#') {
        return anchors
            .contains_key(&percent_decode(anchor).to_lowercase())
            .then(|| in_spec(Some(anchor)));
    }
    if let Some((_, anchor)) = into_spec(target, Path::new("")) {
        return Some(in_spec(anchor));
    }
    // Every other relative link now starts one folder deeper.
    let local = !target.is_empty() && !target.starts_with('/') && !has_scheme(target);
    local.then(|| format!("../{target}"))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LineKind {
    Text,
    /// Frontmatter, code fences and the lines inside them.
    Literal,
}

/// The lines of `text`, line endings kept, with whether they are markdown text.
fn classify(text: &str) -> Vec<(&str, LineKind)> {
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
fn rewrite_links(text: &str, map: impl Fn(&str) -> Option<String>) -> (String, Vec<LinkChange>) {
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

// ---------------------------------------------------------------------------------------------
// Comparing models

/// Where the models of `before` and `after` differ, ignoring positions and link targets (the
/// split moves both), or `None` when they are the same.
fn difference(before: &Spec, after: &Spec) -> Option<String> {
    let (before, after) = (comparable(before), comparable(after));
    if before == after {
        return None;
    }
    let differing: Vec<&str> = match (&before, &after) {
        (serde_json::Value::Object(a), serde_json::Value::Object(b)) => a
            .iter()
            .filter(|(key, value)| b.get(*key) != Some(value))
            .map(|(key, _)| key.as_str())
            .collect(),
        _ => Vec::new(),
    };
    Some(format!(
        "the folder form would not give the same model ({} differ)",
        differing.join(", ")
    ))
}

/// The model without positions, file names and link targets.
fn comparable(spec: &Spec) -> serde_json::Value {
    fn strip(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                for key in [
                    "at", "end_line", "file", "line", "form", "location", "files",
                ] {
                    map.remove(key);
                }
                map.values_mut().for_each(strip);
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(strip),
            serde_json::Value::String(text) => {
                let (stripped, _) = rewrite_links(text, |_| Some(String::new()));
                *text = stripped;
            }
            _ => {}
        }
    }
    let mut value = serde_json::to_value(spec).unwrap_or_default();
    strip(&mut value);
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ids::random_suffix;

    fn repo_root() -> &'static Path {
        Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap()
    }

    /// A repository with `spec.md` holding `spec` and the given other planning files.
    fn temp_repo(spec: &str, others: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-split-{}", random_suffix()));
        let planning = root.join("docs/planning");
        std::fs::create_dir_all(&planning).unwrap();
        std::fs::write(planning.join(SPEC_FILE), spec).unwrap();
        for (file, text) in others {
            let path = planning.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        root
    }

    /// A trash that moves files into `<root>/.trash/`, numbered.
    fn fake_trash(root: &Path) -> impl Fn(&Path) -> Result<(), String> + '_ {
        move |path: &Path| {
            let dir = root.join(".trash");
            std::fs::create_dir_all(&dir).unwrap();
            let count = std::fs::read_dir(&dir).unwrap().count();
            let name = format!("{count}-{}", path.file_name().unwrap().to_string_lossy());
            std::fs::rename(path, dir.join(name)).map_err(|err| err.to_string())
        }
    }

    fn read(root: &Path, file: &str) -> String {
        std::fs::read_to_string(root.join("docs/planning").join(file)).unwrap()
    }

    const SMALL: &str = "---\nid: x\n---\n\n# Spec\n\nIntro, see [vision](#vision).\n\n\
        ## Vision\n\nSee [the decision](#d-1--a-title) and [arch](../../ARCHITECTURE.md).\n\n\
        ## Structure\n\n- Planning `S-planning`\n  - [x] Board `S-board`\n    - Shows [rules](#structure).\n\n\
        ## Decisions\n\n### D-1 · A title\n- Context: c\n\n### Notes\n\n### Notes\n";

    #[test]
    fn this_repository_spec_splits_into_the_same_model() {
        let text = std::fs::read_to_string(repo_root().join("docs/planning/spec.md")).unwrap();
        let task = "---\nid: t\n---\n\nImplements `S-x` in the [spec](../spec.md).\n\
            Node [S-spec-split](../spec.md#structure), \
            [decision](<../spec.md#d-20261031-010617-ryfp--spec-folder-holds-one-file-per-section-the-spec-is-read-line-by-line>), \
            [unknown](../spec.md#nowhere), [other](../braindump.md), [web](https://example.com/spec.md).\n\
            Code `[spec](../spec.md)` stays.\n\n```\n[spec](../spec.md)\n```\n\n[ref]: ../spec.md#glossary\n";
        let root = temp_repo(
            &text,
            &[
                ("next/20261031-000000-aaaa-task.md", task),
                (
                    "braindump.md",
                    "Ideas, see [spec](spec.md) and [x](./next/../spec.md#vision).\n",
                ),
                ("done/no-links.md", "Nothing.\n"),
            ],
        );
        let config = Config::default();
        let before = read_spec(&root, &config);

        let plan = plan_split(&root, &config);
        assert_eq!(plan.blockers, Vec::<String>::new());
        assert_eq!(plan.location, "docs/planning/spec.md");
        let names: Vec<&str> = plan.files.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(
            names,
            FOLDER_FILES
                .iter()
                .map(|(name, _)| format!("spec/{name}"))
                .collect::<Vec<_>>()
        );
        assert_eq!(plan.files[0].first_line, "# Specification");
        assert_eq!(plan.files[5].first_line, "## Structure");
        assert_eq!(
            plan.files.iter().map(|f| f.bytes as usize).sum::<usize>(),
            text.len()
        );
        let linked: Vec<&str> = plan.links.iter().map(|l| l.file.as_str()).collect();
        assert_eq!(
            linked,
            ["braindump.md", "next/20261031-000000-aaaa-task.md"]
        );

        let trash = fake_trash(&root);
        let report = split_spec_with(&root, &config, &trash).unwrap();
        assert_eq!(report.created, names);
        assert_eq!(report.rewritten, linked);
        assert_eq!(report.trashed, "spec.md");
        assert!(!root.join("docs/planning/spec.md").exists());
        assert_eq!(
            std::fs::read_to_string(root.join(".trash/0-spec.md")).unwrap(),
            text
        );
        // The spec has no links of its own, so the folder holds exactly the text of spec.md.
        let joined: String = names.iter().map(|name| read(&root, name)).collect();
        assert_eq!(joined, text);

        let after = read_spec(&root, &config);
        assert_eq!(after.form, SpecForm::Folder);
        assert_eq!(after.issues.len(), before.issues.len());
        assert_eq!(difference(&before, &after), None);

        assert_eq!(
            read(&root, "next/20261031-000000-aaaa-task.md"),
            "---\nid: t\n---\n\nImplements `S-x` in the [spec](../spec/README.md).\n\
            Node [S-spec-split](../spec/structure.md#structure), \
            [decision](<../spec/decisions.md#d-20261031-010617-ryfp--spec-folder-holds-one-file-per-section-the-spec-is-read-line-by-line>), \
            [unknown](../spec/README.md#nowhere), [other](../braindump.md), [web](https://example.com/spec.md).\n\
            Code `[spec](../spec.md)` stays.\n\n```\n[spec](../spec.md)\n```\n\n[ref]: ../spec/glossary.md#glossary\n"
        );
        assert_eq!(
            read(&root, "braindump.md"),
            "Ideas, see [spec](spec/README.md) and [x](./next/../spec/vision.md#vision).\n"
        );
        assert_eq!(read(&root, "done/no-links.md"), "Nothing.\n");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn links_in_the_spec_follow_their_headings() {
        let root = temp_repo(SMALL, &[]);
        let config = Config::default();
        let before = read_spec(&root, &config);
        let plan = plan_split(&root, &config);
        assert_eq!(plan.blockers, Vec::<String>::new());
        let files: Vec<&str> = plan.files.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(
            files,
            [
                "spec/README.md",
                "spec/vision.md",
                "spec/structure.md",
                "spec/decisions.md"
            ]
        );
        assert_eq!(plan.files[0].first_line, "# Spec");

        let trash = fake_trash(&root);
        split_spec_with(&root, &config, &trash).unwrap();
        assert_eq!(
            read(&root, "spec/README.md"),
            "---\nid: x\n---\n\n# Spec\n\nIntro, see [vision](vision.md#vision).\n\n"
        );
        assert_eq!(
            read(&root, "spec/vision.md"),
            "## Vision\n\nSee [the decision](decisions.md#d-1--a-title) and [arch](../../../ARCHITECTURE.md).\n\n"
        );
        assert!(read(&root, "spec/structure.md").contains("Shows [rules](#structure)."));
        assert_eq!(difference(&before, &read_spec(&root, &config)), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn repeated_headings_are_numbered_per_file() {
        let text = "# T\n\n## Vision\n\n### Notes\n\n## Scope\n\n### Notes\n\n### Notes\n";
        let cuts = cut(text).unwrap();
        let anchors = anchors(text, &cuts);
        assert_eq!(anchors["notes"], (1, "notes".to_string()));
        assert_eq!(anchors["notes-1"], (2, "notes".to_string()));
        assert_eq!(anchors["notes-2"], (2, "notes-1".to_string()));
        assert_eq!(anchors["t"], (0, "t".to_string()));
        assert_eq!(slug("D-1 · A title, `code`!"), "d-1--a-title-code");
        assert_eq!(heading_text("## Closed ##"), Some("Closed"));
        assert_eq!(heading_text("#hashtag"), None);
    }

    #[test]
    fn refuses_what_it_cannot_split_and_changes_nothing() {
        let config = Config::default();
        let blockers = |spec: &str| {
            let root = temp_repo(spec, &[]);
            let plan = plan_split(&root, &config);
            let trash = fake_trash(&root);
            assert!(split_spec_with(&root, &config, &trash).is_err());
            assert_eq!(read(&root, SPEC_FILE), spec);
            assert!(!root.join("docs/planning/spec").exists());
            std::fs::remove_dir_all(&root).unwrap();
            plan.blockers
        };
        assert_eq!(
            blockers("## Vision\n\n## Notes\n"),
            ["line 3: the section \"Notes\" has no file in the folder form"]
        );
        assert_eq!(
            blockers("## Vision\n\n## Vision\n"),
            ["line 3: second Vision section"]
        );
        assert!(
            blockers("## Scope\n\n## Vision\n")[0].starts_with("line 3: Vision comes after Scope")
        );

        let root = temp_repo(SMALL, &[]);
        std::fs::create_dir(root.join("docs/planning/spec")).unwrap();
        let file = Config {
            spec: SpecLocation::File,
            ..Config::default()
        };
        assert_eq!(
            plan_split(&root, &file).blockers,
            [
                "`spec: file` in the config always reads spec.md; set it to `auto` or `folder` first",
                "docs/planning/spec/ exists already",
            ]
        );
        std::fs::remove_dir_all(&root).unwrap();

        let root = std::env::temp_dir().join(format!("stardust-split-{}", random_suffix()));
        let plan = plan_split(&root, &config);
        assert!(plan.blockers[0].starts_with("could not read docs/planning/spec.md"));
    }

    #[test]
    fn a_failed_trash_keeps_spec_md() {
        let root = temp_repo(SMALL, &[("next/t.md", "[spec](../spec.md)\n")]);
        let config = Config::default();
        let err = split_spec_with(&root, &config, &|_| Err("no trash".to_string())).unwrap_err();
        assert!(
            err.contains("could not be moved to the trash (no trash)"),
            "{err}"
        );
        assert_eq!(read(&root, SPEC_FILE), SMALL);
        assert!(root.join("docs/planning/spec/README.md").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_link_rewrite_undoes_the_split() {
        use std::os::unix::fs::PermissionsExt;
        let root = temp_repo(
            SMALL,
            &[
                ("inbox/a.md", "[spec](../spec.md)\n"),
                ("next/b.md", "[spec](../spec.md#vision)\n"),
            ],
        );
        let locked = root.join("docs/planning/next/b.md");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o444)).unwrap();
        let config = Config::default();
        let trash = fake_trash(&root);
        let err = split_spec_with(&root, &config, &trash).unwrap_err();
        assert!(err.starts_with("could not rewrite next/b.md"), "{err}");
        assert!(err.ends_with("nothing was changed, spec.md stays"), "{err}");
        assert_eq!(read(&root, SPEC_FILE), SMALL);
        assert_eq!(read(&root, "inbox/a.md"), "[spec](../spec.md)\n");
        assert!(!root.join("docs/planning/spec").exists());
        assert_eq!(std::fs::read_dir(root.join(".trash")).unwrap().count(), 4);
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_planner_block_is_regenerated_when_there_is_one() {
        let root = temp_repo(SMALL, &[]);
        let config = Config::default();
        std::fs::write(
            root.join("AGENTS.md"),
            format!(
                "# Agents\n\n{}\n",
                agents_block::render_block(&config, &root)
            ),
        )
        .unwrap();
        let trash = fake_trash(&root);
        let report = split_spec_with(&root, &config, &trash).unwrap();
        assert!(report.block_written.contains(&"AGENTS.md".to_string()));
        assert_eq!(report.block_error, None);
        let agents = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.contains("docs/planning/spec/") && !agents.contains("spec.md"));
        std::fs::remove_dir_all(&root).unwrap();

        let root = temp_repo(SMALL, &[]);
        let trash = fake_trash(&root);
        let report = split_spec_with(&root, &config, &trash).unwrap();
        assert_eq!(report.block_written, Vec::<String>::new());
        assert!(!root.join("AGENTS.md").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
