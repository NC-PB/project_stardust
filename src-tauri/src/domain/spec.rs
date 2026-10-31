//! The spec (`S-spec-file`, `S-nodes`): `spec.md` or the `spec/` folder, read into one model.
//!
//! Reading never fails and never drops a part: whatever does not have the expected shape is
//! reported as an issue with its file and line, and kept in the model as far as it could be
//! read. Read only; nothing here writes a file.
//!
//! The folder form holds the same text as `spec.md`, cut at the `## ` headings: the part before
//! the first section (frontmatter, `# ` title, intro) goes to `spec/README.md`, every section to
//! its own file named in [`FOLDER_FILES`]. Both forms give the same model; only the positions
//! (file and line) differ.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use serde_norway::Value;
use specta::Type;

use super::config::{Config, SpecLocation};
use super::ids::{find_ids, is_task_id};

/// The single-file spec, relative to the planning root.
pub const SPEC_FILE: &str = "spec.md";
/// The folder form of the spec, relative to the planning root.
pub const SPEC_FOLDER: &str = "spec";

/// The files of the folder form in reading order, with the section each one holds. `README.md`
/// holds the frontmatter, the `# ` title and the intro. Other `*.md` files in the folder are
/// read after these, by name.
pub const FOLDER_FILES: [(&str, Option<SectionKind>); 9] = [
    ("README.md", None),
    ("vision.md", Some(SectionKind::Vision)),
    ("scope.md", Some(SectionKind::Scope)),
    ("constraints.md", Some(SectionKind::Constraints)),
    ("domain.md", Some(SectionKind::Domain)),
    ("structure.md", Some(SectionKind::Structure)),
    ("questions.md", Some(SectionKind::Questions)),
    ("decisions.md", Some(SectionKind::Decisions)),
    ("glossary.md", Some(SectionKind::Glossary)),
];

/// The whole spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Spec {
    pub form: SpecForm,
    /// `<planning_root>/spec.md` or `<planning_root>/spec/`, relative to the repository root.
    pub location: String,
    /// Whether the file or folder exists. Without it the model is empty and an issue says so.
    pub found: bool,
    /// Every file read, in reading order, with its frontmatter.
    pub files: Vec<SpecFile>,
    /// The `# ` heading.
    pub title: Option<String>,
    /// Every `## ` section in reading order, unknown ones included.
    pub sections: Vec<SpecSection>,
    /// The text of Vision, lines joined with `\n`.
    pub vision: String,
    pub scope: Scope,
    pub constraints: Vec<TextItem>,
    pub domain: Domain,
    /// The top-level nodes of the Structure: the domain areas.
    pub structure: Vec<Node>,
    /// Open and answered questions in file order.
    pub questions: Vec<Question>,
    pub decisions: Vec<Decision>,
    pub glossary: Vec<GlossaryTerm>,
    pub issues: Vec<SpecIssue>,
}

/// Which form the spec was read from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SpecForm {
    /// `spec.md`.
    File,
    /// The `spec/` folder.
    Folder,
}

/// Where a part of the spec starts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SourceLine {
    /// Relative to the planning root: `spec.md`, or `spec/<name>.md` in the folder form.
    pub file: String,
    /// 1-based line in that file.
    pub line: u32,
}

/// One file of the spec and the frontmatter fields the tool uses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SpecFile {
    /// Relative to the planning root.
    pub file: String,
    pub id: Option<String>,
    pub title: Option<String>,
    pub status: Option<String>,
    /// Date of the last review, `YYYY-MM-DD` (`S-staleness`).
    pub reviewed: Option<String>,
}

/// A `## ` section.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SpecSection {
    pub kind: SectionKind,
    pub heading: String,
    /// The heading line.
    pub at: SourceLine,
    /// The last non-blank line of the section, in the same file.
    pub end_line: u32,
}

/// The sections of a spec. `Other` is a section with an unknown heading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SectionKind {
    Vision,
    Scope,
    Constraints,
    Domain,
    Structure,
    Questions,
    Decisions,
    Glossary,
    Other,
}

impl SectionKind {
    const KNOWN: [SectionKind; 8] = [
        Self::Vision,
        Self::Scope,
        Self::Constraints,
        Self::Domain,
        Self::Structure,
        Self::Questions,
        Self::Decisions,
        Self::Glossary,
    ];

    /// The heading text of the section.
    pub fn heading(self) -> &'static str {
        match self {
            Self::Vision => "Vision",
            Self::Scope => "Scope",
            Self::Constraints => "Constraints",
            Self::Domain => "Domain",
            Self::Structure => "Structure",
            Self::Questions => "Questions",
            Self::Decisions => "Decisions",
            Self::Glossary => "Glossary",
            Self::Other => "",
        }
    }

    fn from_heading(heading: &str) -> Self {
        Self::KNOWN
            .into_iter()
            .find(|kind| kind.heading().eq_ignore_ascii_case(heading.trim()))
            .unwrap_or(Self::Other)
    }
}

/// A plain list item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TextItem {
    /// The item text; continuation lines and sub-items follow on their own lines.
    pub text: String,
    pub at: SourceLine,
}

/// The Scope section.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct Scope {
    /// `### In`.
    pub in_scope: Vec<TextItem>,
    /// `### Out`.
    pub out_of_scope: Vec<TextItem>,
    /// `### Later`.
    pub later: Vec<TextItem>,
}

/// The Domain section.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct Domain {
    pub areas: Vec<Area>,
    pub entities: Vec<Entity>,
    pub rules: Vec<Rule>,
    pub workflows: Vec<Workflow>,
}

/// A domain area: `- Name (kind): description`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Area {
    pub name: String,
    pub kind: Option<AreaKind>,
    pub description: String,
    pub at: SourceLine,
}

/// How carefully an area is built.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AreaKind {
    Core,
    Supporting,
    Generic,
}

/// An entity: `- Name: description`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Entity {
    pub name: String,
    pub description: String,
    pub at: SourceLine,
}

/// A rule: ``- `R-slug` · text``.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Rule {
    /// `None` when the item has no `R-` id in inline code.
    pub id: Option<String>,
    pub text: String,
    pub at: SourceLine,
}

/// A workflow: `- Name: step → step → step`; the name is optional.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Workflow {
    pub name: Option<String>,
    pub steps: Vec<String>,
    pub at: SourceLine,
}

/// A node of the Structure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Node {
    /// The `S-` id; `None` when the item has none (reported).
    pub id: Option<String>,
    /// The text before the id.
    pub title: String,
    /// `Some(true)` for `[x]`, `Some(false)` for `[ ]`, `None` without a checkbox (domain areas).
    pub ticked: Option<bool>,
    /// Tagged `#later`.
    pub later: bool,
    /// The `Q-` id linked after the node id: the question that blocks the node.
    pub blocking_question: Option<String>,
    pub criteria: Vec<Criterion>,
    /// `R-` ids in inline code in the criteria, each once, in order.
    pub rules: Vec<String>,
    pub children: Vec<Node>,
    pub at: SourceLine,
    /// The last line of the node with its criteria and children.
    pub end_line: u32,
}

/// An acceptance criterion: a sub-bullet of a node that is not a node itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Criterion {
    pub text: String,
    pub at: SourceLine,
}

/// A question: `- [ ] Q-id · Question? Answer. (date) → targets`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Question {
    pub id: Option<String>,
    /// Everything between the id and the `→`, date included.
    pub text: String,
    /// The text up to and including the first `?`.
    pub question: String,
    /// The text after the first `?`, without the date.
    pub answer: Option<String>,
    /// From the checkbox; under `### Answered` when there is none.
    pub answered: bool,
    /// The date in parentheses at the end of the text.
    pub answered_on: Option<String>,
    /// `(blocking)` after the `→`.
    pub blocking: bool,
    /// `S-` ids after the `→`.
    pub nodes: Vec<String>,
    /// The `D-` id after the `→`.
    pub decision: Option<String>,
    pub at: SourceLine,
    pub end_line: u32,
}

/// A decision: `### D-id · Title` with `- Label: text` lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Decision {
    pub id: Option<String>,
    pub title: String,
    pub fields: Vec<DecisionField>,
    /// `D-` ids in "Superseded by" fields.
    pub superseded_by: Vec<String>,
    /// The heading line.
    pub at: SourceLine,
    /// The last non-blank line of the entry.
    pub end_line: u32,
}

/// A `- Label: text` line of a decision. Text outside such a line has an empty label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct DecisionField {
    pub label: String,
    pub text: String,
    pub at: SourceLine,
}

/// A glossary entry: `- Term: definition`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GlossaryTerm {
    pub term: String,
    pub definition: String,
    pub at: SourceLine,
}

/// A problem in the spec. The part it concerns is still in the model where it could be read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SpecIssue {
    /// Relative to the planning root.
    pub file: String,
    /// `None` for problems with a whole file or the whole spec.
    pub line: Option<u32>,
    pub message: String,
}

/// Which form the config chooses for the repository at `repo_root`.
pub fn spec_form(config: &Config, repo_root: &Path) -> SpecForm {
    let folder = match config.spec {
        SpecLocation::File => false,
        SpecLocation::Folder => true,
        SpecLocation::Auto => repo_root
            .join(&config.planning_root)
            .join(SPEC_FOLDER)
            .is_dir(),
    };
    if folder {
        SpecForm::Folder
    } else {
        SpecForm::File
    }
}

/// Reads the spec of the repository at `repo_root`, in the form the config chooses. Never fails.
pub fn read_spec(repo_root: &Path, config: &Config) -> Spec {
    let root = &config.planning_root;
    let planning = repo_root.join(root);
    let form = spec_form(config, repo_root);
    match form {
        SpecForm::File => {
            let location = format!("{root}/{SPEC_FILE}");
            match std::fs::read_to_string(planning.join(SPEC_FILE)) {
                Ok(text) => parse_spec(form, location, &[(SPEC_FILE.to_string(), text)], true),
                Err(err) => missing(form, location, SPEC_FILE, err),
            }
        }
        SpecForm::Folder => {
            let location = format!("{root}/{SPEC_FOLDER}/");
            let dir = planning.join(SPEC_FOLDER);
            let names = match folder_files(&dir) {
                Ok(names) => names,
                Err(err) => return missing(form, location, &format!("{SPEC_FOLDER}/"), err),
            };
            let mut sources = Vec::new();
            let mut unreadable = Vec::new();
            for name in names {
                let file = format!("{SPEC_FOLDER}/{name}");
                match std::fs::read_to_string(dir.join(&name)) {
                    Ok(text) => sources.push((file, text)),
                    Err(err) => unreadable.push(SpecIssue {
                        file,
                        line: None,
                        message: format!("could not read the file: {err}"),
                    }),
                }
            }
            let mut spec = parse_spec(form, location, &sources, true);
            spec.issues.splice(0..0, unreadable);
            spec
        }
    }
}

/// Parses `text`, an unsaved version of the spec file `file` (relative to the planning root).
/// A file under `spec/` is one part of the folder form, so missing sections are not reported.
pub fn parse_spec_text(file: &str, text: &str) -> Spec {
    let form = if file.starts_with(&format!("{SPEC_FOLDER}/")) {
        SpecForm::Folder
    } else {
        SpecForm::File
    };
    parse_spec(
        form,
        file.to_string(),
        &[(file.to_string(), text.to_string())],
        form == SpecForm::File,
    )
}

/// The `*.md` files of the spec folder in reading order.
fn folder_files(dir: &Path) -> std::io::Result<Vec<String>> {
    let mut names: Vec<String> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md") && !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| {
        let known = FOLDER_FILES.iter().position(|(known, _)| known == name);
        (known.unwrap_or(FOLDER_FILES.len()), name.clone())
    });
    Ok(names)
}

fn missing(form: SpecForm, location: String, file: &str, err: std::io::Error) -> Spec {
    let mut spec = empty_spec(form, location);
    let message = if err.kind() == std::io::ErrorKind::NotFound {
        match form {
            SpecForm::File => format!("no {file} under the planning root"),
            SpecForm::Folder => format!("no {file} folder under the planning root"),
        }
    } else {
        format!("could not read {file}: {err}")
    };
    spec.found = err.kind() != std::io::ErrorKind::NotFound;
    spec.issues.push(SpecIssue {
        file: file.to_string(),
        line: None,
        message,
    });
    spec
}

fn empty_spec(form: SpecForm, location: String) -> Spec {
    Spec {
        form,
        location,
        found: false,
        files: Vec::new(),
        title: None,
        sections: Vec::new(),
        vision: String::new(),
        scope: Scope::default(),
        constraints: Vec::new(),
        domain: Domain::default(),
        structure: Vec::new(),
        questions: Vec::new(),
        decisions: Vec::new(),
        glossary: Vec::new(),
        issues: Vec::new(),
    }
}

/// Parses the files of a spec, given as (path relative to the planning root, text) in reading
/// order. With `complete`, sections missing from all of them are reported.
pub fn parse_spec(
    form: SpecForm,
    location: String,
    sources: &[(String, String)],
    complete: bool,
) -> Spec {
    let mut spec = empty_spec(form, location);
    spec.found = true;
    let mut reader = Reader {
        files: sources.iter().map(|(file, _)| file.clone()).collect(),
        issues: Vec::new(),
    };
    let mut sections: Vec<RawSection> = Vec::new();
    for (index, (file, text)) in sources.iter().enumerate() {
        let lines = file_lines(index, text);
        let body = read_frontmatter(&mut reader, &mut spec.files, file, &lines);
        let expected = FOLDER_FILES
            .iter()
            .find(|(name, _)| form == SpecForm::Folder && *file == format!("{SPEC_FOLDER}/{name}"))
            .and_then(|(_, kind)| *kind);
        let mut current: Option<RawSection> = None;
        for line in body {
            if !line.fenced
                && let Some(heading) = line.text.strip_prefix("## ")
            {
                sections.extend(current.take());
                let kind = SectionKind::from_heading(heading);
                if let Some(expected) = expected
                    && kind != expected
                {
                    reader.issue(
                        line,
                        format!(
                            "this file holds the {} section, not \"{}\"",
                            expected.heading(),
                            heading.trim()
                        ),
                    );
                }
                current = Some(RawSection {
                    heading: heading.trim(),
                    kind,
                    line: *line,
                    lines: Vec::new(),
                });
            } else if let Some(section) = current.as_mut() {
                section.lines.push(*line);
            } else if !line.fenced
                && spec.title.is_none()
                && let Some(title) = line.text.strip_prefix("# ")
            {
                spec.title = Some(title.trim().to_string());
            }
        }
        sections.extend(current);
    }

    let mut seen = HashSet::new();
    for section in &sections {
        spec.sections.push(SpecSection {
            kind: section.kind,
            heading: section.heading.to_string(),
            at: reader.at(&section.line),
            end_line: last_line(&section.line, &section.lines),
        });
        if section.kind == SectionKind::Other {
            reader.issue(
                &section.line,
                format!("unknown section \"{}\", not read", section.heading),
            );
            continue;
        }
        if !seen.insert(section.kind) {
            reader.issue(
                &section.line,
                format!("second {} section", section.kind.heading()),
            );
        }
        match section.kind {
            SectionKind::Vision => read_vision(&mut spec, &section.lines),
            SectionKind::Scope => read_scope(&mut reader, &mut spec.scope, &section.lines),
            SectionKind::Constraints => spec
                .constraints
                .extend(read_text_items(&reader, &section.lines)),
            SectionKind::Domain => read_domain(&mut reader, &mut spec.domain, &section.lines),
            SectionKind::Structure => {
                read_structure(&mut reader, &mut spec.structure, &section.lines)
            }
            SectionKind::Questions => {
                read_questions(&mut reader, &mut spec.questions, &section.lines)
            }
            SectionKind::Decisions => {
                read_decisions(&mut reader, &mut spec.decisions, &section.lines)
            }
            SectionKind::Glossary => read_glossary(&mut reader, &mut spec.glossary, &section.lines),
            SectionKind::Other => {}
        }
    }

    if complete {
        let whole = match form {
            SpecForm::File => SPEC_FILE.to_string(),
            SpecForm::Folder => format!("{SPEC_FOLDER}/"),
        };
        for kind in SectionKind::KNOWN {
            if !seen.contains(&kind) {
                reader.issues.push(SpecIssue {
                    file: whole.clone(),
                    line: None,
                    message: format!("no {} section", kind.heading()),
                });
            }
        }
    }
    check_structure(&mut reader, &spec);
    check_duplicates(&mut reader, &spec);
    spec.issues = reader.issues;
    spec
}

// ---------------------------------------------------------------------------------------------
// Lines, frontmatter, lists

/// One line of a spec file.
#[derive(Debug, Clone, Copy)]
struct Line<'a> {
    /// Index into the files read.
    file: usize,
    number: u32,
    text: &'a str,
    /// Inside a code fence, fence lines included.
    fenced: bool,
}

struct RawSection<'a> {
    heading: &'a str,
    kind: SectionKind,
    line: Line<'a>,
    lines: Vec<Line<'a>>,
}

/// Collects issues and turns lines into positions.
struct Reader {
    files: Vec<String>,
    issues: Vec<SpecIssue>,
}

impl Reader {
    fn at(&self, line: &Line) -> SourceLine {
        SourceLine {
            file: self.files[line.file].clone(),
            line: line.number,
        }
    }

    fn issue(&mut self, line: &Line, message: String) {
        self.issues.push(SpecIssue {
            file: self.files[line.file].clone(),
            line: Some(line.number),
            message,
        });
    }

    fn issue_at(&mut self, at: &SourceLine, message: String) {
        self.issues.push(SpecIssue {
            file: at.file.clone(),
            line: Some(at.line),
            message,
        });
    }
}

fn file_lines(file: usize, text: &str) -> Vec<Line<'_>> {
    let mut fence: Option<&str> = None;
    text.lines()
        .enumerate()
        .map(|(index, line)| {
            let trimmed = line.trim_start();
            let marker = ["```", "~~~"]
                .into_iter()
                .find(|marker| trimmed.starts_with(marker));
            let fenced = fence.is_some() || marker.is_some();
            match (fence, marker) {
                (None, Some(marker)) => fence = Some(marker),
                (Some(open), Some(marker)) if open == marker => fence = None,
                _ => {}
            }
            Line {
                file,
                number: index as u32 + 1,
                text: line,
                fenced,
            }
        })
        .collect()
}

/// Reads the frontmatter of one file into `files` and returns the lines after it.
fn read_frontmatter<'l, 'a>(
    reader: &mut Reader,
    files: &mut Vec<SpecFile>,
    file: &str,
    lines: &'l [Line<'a>],
) -> &'l [Line<'a>] {
    let mut entry = SpecFile {
        file: file.to_string(),
        id: None,
        title: None,
        status: None,
        reviewed: None,
    };
    let mut body = lines;
    if lines
        .first()
        .is_some_and(|line| line.text.trim_end() == "---")
    {
        match lines[1..]
            .iter()
            .position(|line| line.text.trim_end() == "---")
        {
            Some(close) => {
                let yaml: Vec<&str> = lines[1..=close].iter().map(|line| line.text).collect();
                match serde_norway::from_str::<Value>(&yaml.join("\n")) {
                    Ok(Value::Mapping(fields)) => {
                        let field = |key: &str| fields.get(key).and_then(scalar_text);
                        entry.id = field("id");
                        entry.title = field("title");
                        entry.status = field("status");
                        entry.reviewed = field("reviewed");
                    }
                    Ok(Value::Null) => {}
                    Ok(_) => reader.issue(
                        &lines[0],
                        "the frontmatter must be a list of `key: value` lines".into(),
                    ),
                    Err(err) => reader.issue(
                        &lines[0],
                        format!("the frontmatter is not valid YAML: {err}"),
                    ),
                }
                body = &lines[close + 2..];
            }
            None => reader.issue(&lines[0], "the frontmatter has no closing `---`".into()),
        }
    }
    files.push(entry);
    body
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

/// The last non-blank line of a block that starts at `first`.
fn last_line(first: &Line, lines: &[Line]) -> u32 {
    lines
        .iter()
        .rev()
        .find(|line| !line.text.trim().is_empty())
        .map_or(first.number, |line| line.number)
}

/// A list item with its sub-items.
#[derive(Debug)]
struct Item<'a> {
    line: Line<'a>,
    indent: usize,
    checkbox: Option<bool>,
    /// The text after the marker and checkbox; continuation lines follow after `\n`.
    text: String,
    /// The last line of the item and its sub-items.
    end: u32,
    children: Vec<Item<'a>>,
}

impl Item<'_> {
    /// The text with every sub-item on its own line.
    fn full_text(&self) -> String {
        let mut text = self.text.clone();
        for child in &self.children {
            text.push('\n');
            text.push_str(&child.full_text());
        }
        text
    }
}

/// The list items in `lines` as a tree, and the lines outside any item.
fn parse_list<'a>(lines: &[Line<'a>]) -> (Vec<Item<'a>>, Vec<Line<'a>>) {
    let mut flat: Vec<(Item<'a>, Option<usize>)> = Vec::new();
    let mut open: Vec<usize> = Vec::new();
    let mut last: Option<usize> = None;
    let mut blank = false;
    let mut prose = Vec::new();
    for line in lines {
        if !line.fenced
            && let Some((indent, rest)) = list_marker(line.text)
        {
            while open.last().is_some_and(|&top| flat[top].0.indent >= indent) {
                open.pop();
            }
            let (checkbox, text) = split_checkbox(rest);
            flat.push((
                Item {
                    line: *line,
                    indent,
                    checkbox,
                    text: text.trim().to_string(),
                    end: line.number,
                    children: Vec::new(),
                },
                open.last().copied(),
            ));
            open.push(flat.len() - 1);
            last = Some(flat.len() - 1);
            blank = false;
            continue;
        }
        if line.text.trim().is_empty() {
            blank = true;
            continue;
        }
        match last {
            Some(index) if !blank || indent_of(line.text) > flat[index].0.indent => {
                let item = &mut flat[index].0;
                item.text.push('\n');
                item.text.push_str(line.text.trim());
                item.end = line.number;
            }
            _ => {
                prose.push(*line);
                last = None;
                open.clear();
            }
        }
    }

    // Assemble the tree from the parent links, children in order.
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); flat.len()];
    let mut roots = Vec::new();
    for (index, (_, parent)) in flat.iter().enumerate() {
        match parent {
            Some(parent) => children[*parent].push(index),
            None => roots.push(index),
        }
    }
    let mut slots: Vec<Option<Item<'a>>> = flat.into_iter().map(|(item, _)| Some(item)).collect();
    fn build<'a>(
        index: usize,
        slots: &mut [Option<Item<'a>>],
        children: &[Vec<usize>],
    ) -> Item<'a> {
        let mut item = slots[index].take().expect("each item is built once");
        for &child in &children[index] {
            let child = build(child, slots, children);
            item.end = item.end.max(child.end);
            item.children.push(child);
        }
        item
    }
    let items = roots
        .into_iter()
        .map(|root| build(root, &mut slots, &children))
        .collect();
    (items, prose)
}

/// Indent and text after the marker of a list item line (`- `, `* `, `+ `, `1. `, `1) `).
fn list_marker(line: &str) -> Option<(usize, &str)> {
    let indent = indent_of(line);
    let rest = line.trim_start();
    for bullet in ["-", "*", "+"] {
        if rest == bullet {
            return Some((indent, ""));
        }
        if let Some(text) = rest.strip_prefix(bullet).and_then(|r| r.strip_prefix(' ')) {
            return Some((indent, text));
        }
    }
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    if digits > 0 && digits <= 9 {
        let after = &rest[digits..];
        for close in [". ", ") "] {
            if let Some(text) = after.strip_prefix(close) {
                return Some((indent, text));
            }
        }
    }
    None
}

fn indent_of(line: &str) -> usize {
    line.chars()
        .take_while(|c| c.is_whitespace())
        .map(|c| if c == '\t' { 4 } else { 1 })
        .sum()
}

fn split_checkbox(text: &str) -> (Option<bool>, &str) {
    for (mark, ticked) in [("[ ]", false), ("[x]", true), ("[X]", true)] {
        if let Some(rest) = text.strip_prefix(mark)
            && (rest.is_empty() || rest.starts_with(' '))
        {
            return (Some(ticked), rest);
        }
    }
    (None, text)
}

/// `### ` subsections: the lines before the first one, and each heading with its lines.
/// A `### ` heading, its line and the lines under it.
type Subsection<'a> = (&'a str, Line<'a>, Vec<Line<'a>>);

fn subsections<'a>(lines: &[Line<'a>]) -> (Vec<Line<'a>>, Vec<Subsection<'a>>) {
    let mut before = Vec::new();
    let mut subs: Vec<Subsection<'a>> = Vec::new();
    for line in lines {
        if !line.fenced
            && let Some(heading) = line.text.strip_prefix("### ")
        {
            subs.push((heading.trim(), *line, Vec::new()));
        } else if let Some((_, _, sub)) = subs.last_mut() {
            sub.push(*line);
        } else {
            before.push(*line);
        }
    }
    (before, subs)
}

// ---------------------------------------------------------------------------------------------
// Inline code and ids

/// The contents of the inline code spans in `text`, with their byte ranges (backticks included).
fn code_spans(text: &str) -> Vec<(usize, usize, &str)> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut pos = 0;
    while let Some(offset) = text[pos..].find('`') {
        let start = pos + offset;
        let run = bytes[start..].iter().take_while(|&&b| b == b'`').count();
        let mut search = start + run;
        let mut closed = None;
        while let Some(offset) = text[search..].find('`') {
            let close = search + offset;
            let close_run = bytes[close..].iter().take_while(|&&b| b == b'`').count();
            if close_run == run {
                closed = Some(close);
                break;
            }
            search = close + close_run;
        }
        match closed {
            Some(close) => {
                spans.push((start, close + run, text[start + run..close].trim()));
                pos = close + run;
            }
            None => pos = start + run,
        }
    }
    spans
}

/// Whether `text` is a slug id with `prefix` (`S-` or `R-`): lowercase letters, digits, `-`.
fn is_slug_id(text: &str, prefix: &str) -> bool {
    text.strip_prefix(prefix).is_some_and(|slug| {
        slug.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
            && slug
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    })
}

/// Whether `text` is a timestamp id with `prefix` (`Q-` or `D-`).
fn is_stamp_id(text: &str, prefix: &str) -> bool {
    text.strip_prefix(prefix).is_some_and(is_task_id)
}

/// Timestamp ids with `prefix` (`Q` or `D`) anywhere in `text`, prefix included.
fn stamp_ids(text: &str, prefix: u8) -> Vec<String> {
    let bytes = text.as_bytes();
    find_ids(text)
        .filter_map(|id| {
            let start = id.as_ptr() as usize - text.as_ptr() as usize;
            (start >= 2 && bytes[start - 2] == prefix && bytes[start - 1] == b'-')
                .then(|| format!("{}-{id}", prefix as char))
        })
        .collect()
}

/// An id at the start of `text`, with or without backticks, and the text after it.
fn leading_id(text: &str, is_id: impl Fn(&str) -> bool) -> Option<(String, &str)> {
    let text = text.trim_start();
    let (token, rest) = match text.strip_prefix('`') {
        Some(inner) => {
            let close = inner.find('`')?;
            (&inner[..close], &inner[close + 1..])
        }
        None => {
            let end = text.find(char::is_whitespace).unwrap_or(text.len());
            (&text[..end], &text[end..])
        }
    };
    is_id(token.trim()).then(|| (token.trim().to_string(), rest))
}

/// `text` without a leading separator (`·`, `-`, `:`) and surrounding spaces.
fn after_separator(text: &str) -> &str {
    text.trim_start()
        .trim_start_matches(['·', '-', ':', '—', '–'])
        .trim()
}

/// Splits `Name: rest` at the first `: ` (or a trailing `:`).
fn split_label(text: &str) -> Option<(&str, &str)> {
    let first_line = text.lines().next().unwrap_or("");
    if let Some(index) = first_line.find(": ") {
        return Some((text[..index].trim(), text[index + 2..].trim()));
    }
    first_line
        .strip_suffix(':')
        .map(|label| (label.trim(), text[first_line.len()..].trim()))
}

// ---------------------------------------------------------------------------------------------
// Sections

fn read_vision(spec: &mut Spec, lines: &[Line]) {
    let text: Vec<&str> = lines.iter().map(|line| line.text.trim_end()).collect();
    let text = text.join("\n");
    if !spec.vision.is_empty() {
        spec.vision.push('\n');
    }
    spec.vision.push_str(text.trim());
}

/// Non-empty list items as text items; prose is ignored.
fn read_text_items(reader: &Reader, lines: &[Line]) -> Vec<TextItem> {
    let (items, _) = parse_list(lines);
    items
        .iter()
        .filter(|item| !item.full_text().trim().is_empty())
        .map(|item| TextItem {
            text: item.full_text(),
            at: reader.at(&item.line),
        })
        .collect()
}

fn read_scope(reader: &mut Reader, scope: &mut Scope, lines: &[Line]) {
    let (before, subs) = subsections(lines);
    report_items_outside(
        reader,
        &before,
        "Scope",
        "`### In`, `### Out` or `### Later`",
    );
    for (heading, line, lines) in subs {
        let target = match heading.to_ascii_lowercase().as_str() {
            "in" => &mut scope.in_scope,
            "out" => &mut scope.out_of_scope,
            "later" => &mut scope.later,
            _ => {
                reader.issue(&line, format!("unknown Scope part \"{heading}\", not read"));
                continue;
            }
        };
        target.extend(read_text_items(reader, &lines));
    }
}

/// Reports list items that sit outside the expected subsections.
fn report_items_outside(reader: &mut Reader, lines: &[Line], section: &str, expected: &str) {
    let (items, _) = parse_list(lines);
    for item in items
        .iter()
        .filter(|item| !item.full_text().trim().is_empty())
    {
        reader.issue(
            &item.line,
            format!("list item in {section} outside {expected}, not read"),
        );
    }
}

fn read_domain(reader: &mut Reader, domain: &mut Domain, lines: &[Line]) {
    let (before, subs) = subsections(lines);
    report_items_outside(
        reader,
        &before,
        "Domain",
        "`### Areas`, `### Entities`, `### Rules` or `### Workflows`",
    );
    for (heading, line, lines) in subs {
        let (items, _) = parse_list(&lines);
        let items = items
            .iter()
            .filter(|item| !item.full_text().trim().is_empty());
        match heading.to_ascii_lowercase().as_str() {
            "areas" => domain
                .areas
                .extend(items.map(|item| read_area(reader, item))),
            "entities" => domain
                .entities
                .extend(items.map(|item| read_entity(reader, item))),
            "rules" => domain
                .rules
                .extend(items.map(|item| read_rule(reader, item))),
            "workflows" => domain
                .workflows
                .extend(items.map(|item| read_workflow(reader, item))),
            _ => reader.issue(
                &line,
                format!("unknown Domain part \"{heading}\", not read"),
            ),
        }
    }
}

fn read_area(reader: &mut Reader, item: &Item) -> Area {
    let text = item.full_text();
    let (head, description) = split_label(&text).unwrap_or((text.as_str(), ""));
    let mut name = head.to_string();
    let mut kind = None;
    if let Some(open) = head.rfind('(')
        && head.ends_with(')')
    {
        let word = head[open + 1..head.len() - 1].trim();
        kind = match word.to_ascii_lowercase().as_str() {
            "core" => Some(AreaKind::Core),
            "supporting" => Some(AreaKind::Supporting),
            "generic" => Some(AreaKind::Generic),
            _ => {
                reader.issue(
                    &item.line,
                    format!("area kind \"{word}\" is not core, supporting or generic"),
                );
                None
            }
        };
        name = head[..open].trim().to_string();
    }
    Area {
        name,
        kind,
        description: description.to_string(),
        at: reader.at(&item.line),
    }
}

fn read_entity(reader: &mut Reader, item: &Item) -> Entity {
    let text = item.full_text();
    let (name, description) = match split_label(&text) {
        Some(parts) => parts,
        None => {
            reader.issue(
                &item.line,
                "an entity needs the form `Name: description`".into(),
            );
            (text.as_str(), "")
        }
    };
    Entity {
        name: name.to_string(),
        description: description.to_string(),
        at: reader.at(&item.line),
    }
}

fn read_rule(reader: &mut Reader, item: &Item) -> Rule {
    let text = item.full_text();
    let (id, rest) = match leading_id(&text, |token| is_slug_id(token, "R-")) {
        Some((id, rest)) => (Some(id), after_separator(rest)),
        None => {
            reader.issue(
                &item.line,
                "a rule needs an `R-` id in inline code at the start".into(),
            );
            (None, text.trim())
        }
    };
    Rule {
        id,
        text: rest.to_string(),
        at: reader.at(&item.line),
    }
}

fn read_workflow(reader: &mut Reader, item: &Item) -> Workflow {
    let text = item.full_text();
    let (name, steps) = match split_label(&text) {
        Some((name, steps)) if !name.contains('→') => (Some(name.to_string()), steps),
        _ => (None, text.trim()),
    };
    Workflow {
        name,
        steps: steps
            .split('→')
            .map(|step| step.trim().to_string())
            .filter(|step| !step.is_empty())
            .collect(),
        at: reader.at(&item.line),
    }
}

/// The head of a node item: title, id, and what follows the id.
struct NodeHead<'a> {
    title: &'a str,
    id: Option<String>,
    tail: &'a str,
}

/// Reads `text` as a node head. Strict: the last inline code is the `S-` id and only a question
/// link and tags follow it. Otherwise, unless `strict`, the first `S-` id in inline code.
fn node_head(text: &str, strict: bool) -> Option<NodeHead<'_>> {
    let first_line = text.lines().next().unwrap_or("");
    let spans = code_spans(first_line);
    if let Some(&(start, end, id)) = spans.last()
        && is_slug_id(id, "S-")
        && first_line[end..]
            .split_whitespace()
            .all(|token| token.starts_with('#') || !stamp_ids(token, b'Q').is_empty())
    {
        return Some(NodeHead {
            title: first_line[..start].trim(),
            id: Some(id.to_string()),
            tail: &first_line[end..],
        });
    }
    if strict {
        return None;
    }
    Some(match spans.iter().find(|span| is_slug_id(span.2, "S-")) {
        Some(&(start, end, id)) => NodeHead {
            title: first_line[..start].trim(),
            id: Some(id.to_string()),
            tail: &first_line[end..],
        },
        None => NodeHead {
            title: first_line.trim(),
            id: None,
            tail: "",
        },
    })
}

fn read_structure(reader: &mut Reader, structure: &mut Vec<Node>, lines: &[Line]) {
    let (items, _) = parse_list(lines);
    for item in &items {
        structure.push(read_node(reader, item));
    }
}

/// A node from a list item that is known to be one.
fn read_node(reader: &mut Reader, item: &Item) -> Node {
    let head = node_head(&item.text, false).expect("lenient heads always parse");
    if head.id.is_none() {
        reader.issue(&item.line, "a node needs an `S-` id in inline code".into());
    }
    let mut node = Node {
        id: head.id,
        title: head.title.to_string(),
        ticked: item.checkbox,
        later: head.tail.split_whitespace().any(|token| token == "#later"),
        blocking_question: stamp_ids(head.tail, b'Q').into_iter().next(),
        criteria: Vec::new(),
        rules: Vec::new(),
        children: Vec::new(),
        at: reader.at(&item.line),
        end_line: item.end,
    };
    for child in &item.children {
        if child.checkbox.is_some() || node_head(&child.text, true).is_some() {
            node.children.push(read_node(reader, child));
        } else {
            let text = child.full_text();
            for (_, _, code) in code_spans(&text) {
                if is_slug_id(code, "R-") && !node.rules.iter().any(|rule| rule == code) {
                    node.rules.push(code.to_string());
                }
            }
            node.criteria.push(Criterion {
                text,
                at: reader.at(&child.line),
            });
        }
    }
    node
}

fn read_questions(reader: &mut Reader, questions: &mut Vec<Question>, lines: &[Line]) {
    let (before, subs) = subsections(lines);
    let mut parts = vec![(None, before)];
    for (heading, line, lines) in subs {
        let answered = match heading.to_ascii_lowercase().as_str() {
            "open" => Some(false),
            "answered" => Some(true),
            _ => {
                reader.issue(
                    &line,
                    format!("unknown Questions part \"{heading}\"; expected Open or Answered"),
                );
                None
            }
        };
        parts.push((answered, lines));
    }
    for (under_answered, lines) in parts {
        let (items, _) = parse_list(&lines);
        for item in items.iter().filter(|item| !is_placeholder(item)) {
            questions.push(read_question(reader, item, under_answered));
        }
    }
}

/// An empty item, or `- (none)` standing for an empty list.
fn is_placeholder(item: &Item) -> bool {
    let text = item.full_text();
    let text = text.trim();
    text.is_empty() || (item.checkbox.is_none() && text.eq_ignore_ascii_case("(none)"))
}

fn read_question(reader: &mut Reader, item: &Item, under_answered: Option<bool>) -> Question {
    let text = item.full_text();
    let (id, body) = match leading_id(&text, |token| is_stamp_id(token, "Q-")) {
        Some((id, rest)) => (Some(id), after_separator(rest)),
        None => {
            reader.issue(&item.line, "a question needs a `Q-` id at the start".into());
            (None, text.trim())
        }
    };
    let (body, targets) = match body.rfind('→') {
        Some(arrow) => (body[..arrow].trim(), body[arrow + '→'.len_utf8()..].trim()),
        None => (body, ""),
    };
    let mut question = Question {
        id,
        text: body.to_string(),
        question: body.to_string(),
        answer: None,
        answered: false,
        answered_on: None,
        blocking: false,
        nodes: Vec::new(),
        decision: None,
        at: reader.at(&item.line),
        end_line: item.end,
    };
    let mut rest = body;
    if let Some(open) = rest.rfind('(')
        && rest.ends_with(')')
        && is_date(&rest[open + 1..rest.len() - 1])
    {
        question.answered_on = Some(rest[open + 1..rest.len() - 1].to_string());
        rest = rest[..open].trim_end();
    }
    if let Some(mark) = rest.find('?') {
        question.question = rest[..=mark].trim().to_string();
        let answer = rest[mark + 1..].trim();
        question.answer = (!answer.is_empty()).then(|| answer.to_string());
    } else {
        question.question = rest.to_string();
    }
    for token in targets.split(|c: char| c.is_whitespace() || c == ',') {
        let token = token.trim_matches(|c: char| "`()[].;".contains(c));
        if is_slug_id(token, "S-") {
            question.nodes.push(token.to_string());
        } else if is_stamp_id(token, "D-") && question.decision.is_none() {
            question.decision = Some(token.to_string());
        } else if token.eq_ignore_ascii_case("blocking") {
            question.blocking = true;
        }
    }
    question.answered = match (item.checkbox, under_answered) {
        (Some(ticked), Some(answered)) => {
            if ticked != answered {
                let message = if ticked {
                    "ticked question under Open"
                } else {
                    "unticked question under Answered"
                };
                reader.issue(&item.line, message.into());
            }
            ticked
        }
        (Some(ticked), None) => ticked,
        (None, under) => {
            reader.issue(
                &item.line,
                "a question needs a checkbox `[ ]` or `[x]`".into(),
            );
            under.unwrap_or(false)
        }
    };
    question
}

fn is_date(text: &str) -> bool {
    chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok()
}

fn read_decisions(reader: &mut Reader, decisions: &mut Vec<Decision>, lines: &[Line]) {
    let (before, subs) = subsections(lines);
    report_items_outside(reader, &before, "Decisions", "a `### D-...` entry");
    for (heading, line, lines) in subs {
        let (id, title) = match leading_id(heading, |token| is_stamp_id(token, "D-")) {
            Some((id, rest)) => (Some(id), after_separator(rest)),
            None => {
                reader.issue(
                    &line,
                    "a decision heading needs a `D-` id at the start".into(),
                );
                (None, heading)
            }
        };
        let mut decision = Decision {
            id,
            title: title.to_string(),
            fields: Vec::new(),
            superseded_by: Vec::new(),
            at: reader.at(&line),
            end_line: last_line(&line, &lines),
        };
        let (items, prose) = parse_list(&lines);
        let mut fields: Vec<(u32, DecisionField)> = Vec::new();
        for item in &items {
            let text = item.full_text();
            let field = match split_label(&text).filter(|(label, _)| !label.contains('`')) {
                Some((label, text)) => DecisionField {
                    label: label.to_string(),
                    text: text.to_string(),
                    at: reader.at(&item.line),
                },
                None => {
                    reader.issue(
                        &item.line,
                        "a decision line needs the form `Label: text`".into(),
                    );
                    DecisionField {
                        label: String::new(),
                        text: text.trim().to_string(),
                        at: reader.at(&item.line),
                    }
                }
            };
            fields.push((item.line.number, field));
        }
        for line in prose {
            reader.issue(
                &line,
                "text in a decision outside a `- Label: text` line".into(),
            );
            fields.push((
                line.number,
                DecisionField {
                    label: String::new(),
                    text: line.text.trim().to_string(),
                    at: reader.at(&line),
                },
            ));
        }
        fields.sort_by_key(|(number, _)| *number);
        decision.fields = fields.into_iter().map(|(_, field)| field).collect();
        decision.superseded_by = decision
            .fields
            .iter()
            .filter(|field| field.label.eq_ignore_ascii_case("superseded by"))
            .flat_map(|field| stamp_ids(&field.text, b'D'))
            .collect();
        decisions.push(decision);
    }
}

fn read_glossary(reader: &mut Reader, glossary: &mut Vec<GlossaryTerm>, lines: &[Line]) {
    let (items, _) = parse_list(lines);
    for item in items
        .iter()
        .filter(|item| !item.full_text().trim().is_empty())
    {
        let text = item.full_text();
        let (term, definition) = match split_label(&text) {
            Some(parts) => parts,
            None => {
                reader.issue(
                    &item.line,
                    "a glossary entry needs the form `Term: meaning`".into(),
                );
                (text.as_str(), "")
            }
        };
        glossary.push(GlossaryTerm {
            term: term.to_string(),
            definition: definition.to_string(),
            at: reader.at(&item.line),
        });
    }
}

// ---------------------------------------------------------------------------------------------
// Checks across sections

/// Top-level nodes are the domain areas.
fn check_structure(reader: &mut Reader, spec: &Spec) {
    if spec.domain.areas.is_empty() {
        return;
    }
    for node in &spec.structure {
        let is_area = spec
            .domain
            .areas
            .iter()
            .any(|area| area.name.eq_ignore_ascii_case(&node.title));
        if !is_area {
            reader.issue_at(
                &node.at,
                format!("top-level node \"{}\" is not a domain area", node.title),
            );
        }
    }
}

/// Every id once (`R-unique-ids`); the second and later uses are reported.
fn check_duplicates(reader: &mut Reader, spec: &Spec) {
    let mut seen = HashSet::new();
    let mut ids: Vec<(&str, &SourceLine)> = Vec::new();
    fn walk<'s>(nodes: &'s [Node], ids: &mut Vec<(&'s str, &'s SourceLine)>) {
        for node in nodes {
            if let Some(id) = &node.id {
                ids.push((id, &node.at));
            }
            walk(&node.children, ids);
        }
    }
    walk(&spec.structure, &mut ids);
    ids.extend(
        spec.domain
            .rules
            .iter()
            .filter_map(|r| Some((r.id.as_deref()?, &r.at))),
    );
    ids.extend(
        spec.questions
            .iter()
            .filter_map(|q| Some((q.id.as_deref()?, &q.at))),
    );
    ids.extend(
        spec.decisions
            .iter()
            .filter_map(|d| Some((d.id.as_deref()?, &d.at))),
    );
    for (id, at) in ids {
        if !seen.insert(id) {
            reader.issue_at(at, format!("id {id} is used more than once"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_root() -> &'static Path {
        Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap()
    }

    fn parse(text: &str) -> Spec {
        parse_spec_text(SPEC_FILE, text)
    }

    fn find<'s>(nodes: &'s [Node], id: &str) -> Option<&'s Node> {
        nodes.iter().find_map(|node| {
            (node.id.as_deref() == Some(id))
                .then_some(node)
                .or_else(|| find(&node.children, id))
        })
    }

    fn count(nodes: &[Node]) -> usize {
        nodes.iter().map(|node| 1 + count(&node.children)).sum()
    }

    fn messages(spec: &Spec) -> Vec<(Option<u32>, &str)> {
        spec.issues
            .iter()
            .map(|issue| (issue.line, issue.message.as_str()))
            .collect()
    }

    #[test]
    fn this_repository_spec_reads_without_issues() {
        let spec = read_spec(
            repo_root(),
            &crate::domain::config::load_config(repo_root()).config,
        );
        assert_eq!(spec.issues, []);
        assert!(spec.found);
        assert_eq!(spec.form, SpecForm::File);
        assert_eq!(spec.location, "docs/planning/spec.md");
        assert_eq!(spec.title.as_deref(), Some("Specification"));
        assert_eq!(spec.files[0].id.as_deref(), Some("20260918-200000-0a1f"));
        assert!(spec.files[0].reviewed.is_some());
        assert_eq!(spec.sections.len(), 8);
        assert!(spec.vision.starts_with("Solo developers"));
        assert!(!spec.scope.in_scope.is_empty() && !spec.scope.later.is_empty());
        assert!(!spec.constraints.is_empty());

        // Every area is a top-level node; every checkbox in the Structure is a node.
        let text = std::fs::read_to_string(repo_root().join(&spec.location)).unwrap();
        let structure =
            &text[text.find("\n## Structure").unwrap()..text.find("\n## Questions").unwrap()];
        let boxes = structure
            .lines()
            .filter(|l| l.starts_with("  - [x] ") || l.starts_with("  - [ ] "))
            .count();
        assert_eq!(count(&spec.structure), boxes + spec.structure.len());
        assert_eq!(spec.structure.len(), spec.domain.areas.len());
        assert!(spec.structure.iter().all(|node| node.ticked.is_none()));
        assert!(spec.domain.areas.iter().all(|area| area.kind.is_some()));

        let init = find(&spec.structure, "S-init").unwrap();
        assert_eq!(init.title, "Project init");
        assert_eq!(init.ticked, Some(true));
        assert!(init.rules.contains(&"R-no-destroy".to_string()));
        assert!(init.rules.contains(&"R-plain-markdown".to_string()));
        assert!(init.criteria.len() >= 5);
        assert!(find(&spec.structure, "S-combined-view").unwrap().later);
        assert_eq!(
            find(&spec.structure, "S-combined-view").unwrap().ticked,
            Some(false)
        );

        assert!(
            spec.domain
                .rules
                .iter()
                .any(|r| r.id.as_deref() == Some("R-append-only"))
        );
        assert!(spec.domain.entities.iter().any(|e| e.name == "Node"));
        assert!(
            spec.domain
                .workflows
                .iter()
                .any(|w| w.name.as_deref() == Some("Capture"))
        );

        let answered = spec.questions.iter().find(|q| q.answered).unwrap();
        assert!(answered.decision.is_some() && answered.answered_on.is_some());
        assert!(answered.answer.is_some());

        let renamed = spec
            .decisions
            .iter()
            .find(|d| d.id.as_deref() == Some("D-20261030-121000-8e1a"))
            .unwrap();
        assert_eq!(renamed.title, "Rename idea to spec");
        assert_eq!(renamed.fields[2].label, "Supersedes");
        assert!(spec.glossary.iter().any(|t| t.term == "Planning root"));
    }

    #[test]
    fn the_template_reads_without_issues() {
        let spec = parse(crate::domain::templates::TemplateKind::Spec.builtin());
        assert_eq!(spec.issues, []);
        let area = &spec.structure[0];
        assert_eq!(area.id.as_deref(), Some("S-area-a"));
        assert_eq!(area.title, "Area A");
        let feature = &area.children[0];
        assert_eq!(feature.id.as_deref(), Some("S-feature"));
        assert_eq!(feature.ticked, Some(false));
        assert_eq!(
            feature.blocking_question.as_deref(),
            Some("Q-20261030-143201-8f2a")
        );
        assert_eq!(feature.rules, ["R-example"]);
        assert_eq!(feature.criteria.len(), 1);
        assert!(area.children[1].later);
        assert_eq!(spec.domain.areas[0].kind, Some(AreaKind::Core));
        assert_eq!(spec.domain.rules[0].id.as_deref(), Some("R-example"));
        assert_eq!(spec.domain.workflows[0].name, None);
        assert_eq!(spec.domain.workflows[0].steps, ["Step", "step", "step"]);
        let open = &spec.questions[0];
        assert!(!open.answered && open.blocking);
        assert_eq!(open.nodes, ["S-feature"]);
        assert_eq!(open.question, "Question text?");
        assert_eq!(open.answer, None);
        let answered = &spec.questions[1];
        assert!(answered.answered && !answered.blocking);
        assert_eq!(answered.answer.as_deref(), Some("Answer."));
        assert_eq!(answered.answered_on.as_deref(), Some("2026-10-30"));
        assert_eq!(answered.decision.as_deref(), Some("D-20261030-101800-3e9f"));
        let decision = &spec.decisions[0];
        assert_eq!(decision.title, "Title");
        let labels: Vec<&str> = decision.fields.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, ["Context", "Decision", "Rejected", "Consequences"]);
        assert_eq!(spec.glossary[0].term, "Term");
        assert!(spec.scope.in_scope.is_empty() && spec.constraints.is_empty());
    }

    /// The model without positions, so the file and folder forms can be compared.
    fn without_positions(spec: &Spec) -> serde_json::Value {
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
                _ => {}
            }
        }
        let mut value = serde_json::to_value(spec).unwrap();
        strip(&mut value);
        value
    }

    /// Cuts `text` at the `## ` headings into the files of the folder form.
    fn split(text: &str) -> Vec<(String, String)> {
        let mut files = vec![("README.md".to_string(), String::new())];
        for line in text.split_inclusive('\n') {
            if let Some(heading) = line.strip_prefix("## ") {
                let kind = SectionKind::from_heading(heading);
                let name = FOLDER_FILES
                    .iter()
                    .find(|(_, k)| *k == Some(kind))
                    .unwrap()
                    .0;
                files.push((name.to_string(), String::new()));
            }
            files.last_mut().unwrap().1.push_str(line);
        }
        files
    }

    #[test]
    fn the_folder_form_gives_the_same_model() {
        let text = std::fs::read_to_string(repo_root().join("docs/planning/spec.md")).unwrap();
        let root = std::env::temp_dir().join(format!(
            "stardust-spec-{}",
            crate::domain::ids::random_suffix()
        ));
        let folder = root.join("docs/planning/spec");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(root.join("docs/planning/spec.md"), &text).unwrap();
        let parts = split(&text);
        for (name, part) in &parts {
            std::fs::write(folder.join(name), part).unwrap();
        }
        let mut config = Config {
            spec: SpecLocation::File,
            ..Config::default()
        };
        let file = read_spec(&root, &config);
        config.spec = SpecLocation::Auto;
        let folder_spec = read_spec(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(folder_spec.form, SpecForm::Folder);
        assert_eq!(folder_spec.location, "docs/planning/spec/");
        assert_eq!(folder_spec.issues, []);
        assert_eq!(folder_spec.files.len(), 9);
        assert_eq!(folder_spec.files[0].file, "spec/README.md");
        assert_eq!(without_positions(&file), without_positions(&folder_spec));
        let structure = find(&folder_spec.structure, "S-init").unwrap();
        assert_eq!(structure.at.file, "spec/structure.md");
        assert!(structure.at.line < find(&file.structure, "S-init").unwrap().at.line);
    }

    #[test]
    fn a_missing_spec_is_reported() {
        let root = std::env::temp_dir().join(format!(
            "stardust-spec-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let mut config = Config::default();
        let file = read_spec(&root, &config);
        config.spec = SpecLocation::Folder;
        let folder = read_spec(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();
        assert!(!file.found);
        assert_eq!(file.issues[0].message, "no spec.md under the planning root");
        assert!(!folder.found);
        assert_eq!(
            folder.issues[0].message,
            "no spec/ folder under the planning root"
        );
    }

    const BROKEN: &str = "\
# Spec

## Vision
Text.

## Scope
- stray item

## Constraints

## Domain
### Areas
- Planning (major): tasks
### Rules
- no id here
- `R-a` · first
- `R-a` · again

## Structure
- Planning `S-planning`
  - [x] Feature without id
    - criterion
  - Sub `S-sub` #later
    - uses `R-a`
- Elsewhere `S-elsewhere`

## Questions
### Open
- [x] Q-20261030-143201-8f2a · Done? Yes.
- [ ] What, no id?
### Answered
- Q-20261030-143202-8f2a · Unticked? Yes. → `S-sub`

## Decisions
### Missing id
- Context: something
- free text without label

Loose prose.

## Glossary
- Lonely term

## Appendix
- anything
";

    #[test]
    fn malformed_parts_are_reported_with_lines_and_kept() {
        let spec = parse(BROKEN);
        assert_eq!(
            messages(&spec),
            [
                (
                    Some(7),
                    "list item in Scope outside `### In`, `### Out` or `### Later`, not read"
                ),
                (
                    Some(13),
                    "area kind \"major\" is not core, supporting or generic"
                ),
                (
                    Some(15),
                    "a rule needs an `R-` id in inline code at the start"
                ),
                (Some(21), "a node needs an `S-` id in inline code"),
                (Some(29), "ticked question under Open"),
                (Some(30), "a question needs a `Q-` id at the start"),
                (Some(32), "a question needs a checkbox `[ ]` or `[x]`"),
                (Some(35), "a decision heading needs a `D-` id at the start"),
                (Some(37), "a decision line needs the form `Label: text`"),
                (
                    Some(39),
                    "text in a decision outside a `- Label: text` line"
                ),
                (Some(42), "a glossary entry needs the form `Term: meaning`"),
                (Some(44), "unknown section \"Appendix\", not read"),
                (
                    Some(25),
                    "top-level node \"Elsewhere\" is not a domain area"
                ),
                (Some(17), "id R-a is used more than once"),
            ]
        );
        assert_eq!(spec.domain.areas[0].name, "Planning");
        assert_eq!(spec.domain.rules.len(), 3);
        let planning = &spec.structure[0];
        assert_eq!(planning.children.len(), 2);
        assert_eq!(planning.children[0].id, None);
        assert_eq!(planning.children[0].title, "Feature without id");
        assert_eq!(planning.children[0].criteria[0].text, "criterion");
        assert_eq!(planning.children[1].ticked, None);
        assert!(planning.children[1].later);
        assert_eq!(planning.children[1].rules, ["R-a"]);
        assert_eq!(planning.end_line, 24);
        assert_eq!(spec.questions.len(), 3);
        assert_eq!(spec.questions[1].id, None);
        assert!(spec.questions[2].answered);
        assert_eq!(spec.questions[2].nodes, ["S-sub"]);
        assert_eq!(spec.decisions[0].id, None);
        assert_eq!(spec.decisions[0].fields.len(), 3);
        assert_eq!(spec.decisions[0].fields[2].text, "Loose prose.");
        assert_eq!(spec.decisions[0].end_line, 39);
        assert_eq!(spec.glossary[0].term, "Lonely term");
        assert_eq!(spec.sections.len(), 9);
        assert_eq!(spec.sections[8].kind, SectionKind::Other);
    }

    #[test]
    fn missing_sections_are_reported_for_a_whole_spec_only() {
        let spec = parse("## Vision\nText.\n");
        assert_eq!(spec.issues.len(), 7);
        assert_eq!(spec.issues[0].message, "no Scope section");
        assert_eq!(spec.issues[0].line, None);
        let part = parse_spec_text("spec/vision.md", "## Vision\nText.\n");
        assert_eq!(part.issues, []);
        let wrong = parse_spec_text("spec/vision.md", "## Glossary\n- A: b\n");
        assert_eq!(
            messages(&wrong),
            [(
                Some(1),
                "this file holds the Vision section, not \"Glossary\""
            )]
        );
    }

    #[test]
    fn superseded_by_and_continuations_are_read() {
        let spec = parse_spec_text(
            "spec/decisions.md",
            "## Decisions\r\n\r\n### D-20261030-101800-3e9f · Old\r\n- Decision: a\r\n  over two lines\r\n- Superseded by: D-20261031-101800-aaaa\r\n",
        );
        assert_eq!(spec.issues, []);
        let decision = &spec.decisions[0];
        assert_eq!(decision.fields[0].text, "a\nover two lines");
        assert_eq!(decision.superseded_by, ["D-20261031-101800-aaaa"]);
        assert_eq!(decision.at.line, 3);
        assert_eq!(decision.end_line, 6);
    }

    #[test]
    fn none_stands_for_an_empty_questions_list() {
        let spec = parse_spec_text(
            "spec.md",
            "## Questions\n\n### Open\n- (none)\n\n### Answered\n- (None)\n",
        );
        assert!(spec.questions.is_empty());
        assert!(
            spec.issues
                .iter()
                .all(|issue| !issue.message.contains("question")),
            "{:?}",
            spec.issues
        );
    }

    #[test]
    fn headings_in_code_fences_are_not_sections() {
        let spec = parse_spec_text("spec/vision.md", "## Vision\n```\n## Glossary\n```\n");
        assert_eq!(spec.sections.len(), 1);
        assert!(spec.vision.contains("## Glossary"));
    }

    #[test]
    fn criteria_naming_a_node_stay_criteria() {
        let spec = parse_spec_text(
            "spec/structure.md",
            "## Structure\n- A `S-a`\n  - [ ] B `S-b` ([Q-20261030-143201-8f2a](questions.md))\n    - See `S-a` for more.\n    - Follows `S-a`\n",
        );
        let b = &spec.structure[0].children[0];
        assert_eq!(
            b.blocking_question.as_deref(),
            Some("Q-20261030-143201-8f2a")
        );
        assert_eq!(b.criteria.len(), 1);
        // A sub-item that ends with an id is a node, even without a checkbox.
        assert_eq!(b.children[0].id.as_deref(), Some("S-a"));
        assert_eq!(b.children[0].title, "Follows");
    }
}
