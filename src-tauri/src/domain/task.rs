//! Task files (`S-task-format`, `R-one-task-per-file`, `R-filename-truth`).
//!
//! Reading never drops a file: problems are collected as issues next to whatever could be read.
//! Writing edits only the lines of one frontmatter field, so comments, unknown fields, field
//! order, list style and the body stay exactly as they were.

use std::path::Path;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value};
use specta::Type;

use crate::domain::ids::{is_task_id, parse_task_filename};

/// Fields that may still be read line by line when the frontmatter is not valid YAML.
const FALLBACK_FIELDS: [&str; 5] = ["id", "title", "created", "completed", "parent"];
const DATE_FORMAT: &str = "%Y-%m-%d";

/// One task file as read from disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Task {
    pub file_name: String,
    /// The id from the filename (`R-filename-truth`); from the frontmatter only when the
    /// filename has none; `None` when neither has a valid id.
    pub id: Option<String>,
    /// From the frontmatter, or derived from the filename when missing.
    pub title: String,
    pub created: Option<String>,
    pub tags: Vec<String>,
    /// 1 to 5.
    pub priority: Option<u8>,
    pub depends_on: Vec<String>,
    pub parent: Option<String>,
    pub implements: Vec<String>,
    pub completed: Option<String>,
    /// When the file last changed on disk, RFC 3339 in UTC; `None` when not read from disk.
    pub modified: Option<String>,
    /// The `## ` sections of the body, in file order.
    pub sections: Vec<Section>,
    pub issues: Vec<TaskIssue>,
}

/// A `## ` section of a task body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Section {
    pub heading: String,
    /// The text up to the next `## ` heading, without surrounding blank lines.
    pub content: String,
}

/// A problem in a task file. The file is still listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TaskIssue {
    /// The frontmatter field; `None` for problems with the file as a whole.
    pub key: Option<String>,
    pub message: String,
}

/// A value to write into a frontmatter field.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
pub enum FieldValue {
    Text(String),
    List(Vec<String>),
    Number(i32),
}

/// Byte ranges of the frontmatter in a file: `---` line, fields, `---` line, body.
struct Frontmatter {
    /// Start of the first field line.
    start: usize,
    /// Start of the closing `---` line.
    end: usize,
    /// Start of the body, after the closing line.
    body_start: usize,
}

/// Reads every `*.md` file directly in `dir`, sorted by name. Unreadable files are listed
/// with an issue.
pub fn read_column(dir: &Path) -> std::io::Result<Vec<Task>> {
    let mut names: Vec<String> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md"))
        .collect();
    names.sort();
    Ok(names
        .into_iter()
        .map(|name| read_task(&dir.join(&name)))
        .collect())
}

/// Reads one task file. An unreadable file becomes a task with an issue.
pub fn read_task(path: &Path) -> Task {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut task = match std::fs::read_to_string(path) {
        Ok(text) => parse_task(&file_name, &text),
        Err(err) => {
            let mut task = parse_task(&file_name, "");
            task.issues = vec![file_issue(format!("could not read the file: {err}"))];
            task
        }
    };
    task.modified = modified_time(path);
    task
}

/// The last change time of the file at `path`, RFC 3339 in UTC.
fn modified_time(path: &Path) -> Option<String> {
    let time = std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()?;
    Some(
        chrono::DateTime::<chrono::Utc>::from(time)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    )
}

/// Parses the text of a task file named `file_name`.
pub fn parse_task(file_name: &str, text: &str) -> Task {
    let mut issues = Vec::new();
    let from_filename = parse_task_filename(file_name);
    if from_filename.is_none() {
        issues.push(file_issue(
            "the filename does not start with a task id (`<id>-<slug>.md`)".into(),
        ));
    }

    let (fields, body) = match locate_frontmatter(text) {
        Some(range) => (
            parse_fields(&text[range.start..range.end], &mut issues),
            &text[range.body_start..],
        ),
        None => {
            issues.push(file_issue("no frontmatter".into()));
            (Mapping::new(), text)
        }
    };
    let mut read = Reader {
        fields: &fields,
        issues: &mut issues,
    };

    let frontmatter_id: Option<String> = read.optional("id", check_id);
    let id = match (&from_filename, frontmatter_id) {
        (Some(name), Some(front)) if name.id != front => {
            read.issue(
                "id",
                format!(
                    "`{front}` differs from the filename id `{}`; the filename id is used",
                    name.id
                ),
            );
            Some(name.id.clone())
        }
        (Some(name), _) => Some(name.id.clone()),
        (None, front) => front,
    };
    let title = read
        .required::<String>("title", check_not_blank)
        .unwrap_or_else(|| fallback_title(file_name));
    let created = read.required("created", check_date);
    let tags = read.optional("tags", no_check).unwrap_or_default();
    let priority = read.optional("priority", check_priority);
    let depends_on = read.optional("depends_on", check_ids).unwrap_or_default();
    let parent = read.optional("parent", check_id);
    let implements = read.optional("implements", no_check).unwrap_or_default();
    let completed = read.optional("completed", check_date);

    Task {
        file_name: file_name.to_string(),
        id,
        title,
        created,
        tags,
        priority,
        depends_on,
        parent,
        implements,
        completed,
        modified: None,
        sections: parse_sections(body),
        issues,
    }
}

/// The frontmatter fields, or what can be read line by line when it is not valid YAML.
fn parse_fields(frontmatter: &str, issues: &mut Vec<TaskIssue>) -> Mapping {
    match serde_norway::from_str::<Value>(frontmatter) {
        Ok(Value::Mapping(fields)) => fields,
        Ok(Value::Null) => Mapping::new(),
        Ok(_) => {
            issues.push(file_issue(
                "the frontmatter must be a list of `key: value` lines".into(),
            ));
            Mapping::new()
        }
        Err(err) => {
            issues.push(file_issue(format!(
                "the frontmatter is not valid YAML ({err}); values containing `: ` need quotes"
            )));
            fallback_fields(frontmatter)
        }
    }
}

/// Top-level `key: value` lines for [`FALLBACK_FIELDS`], taken as raw text.
fn fallback_fields(frontmatter: &str) -> Mapping {
    let mut fields = Mapping::new();
    for line in frontmatter.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if FALLBACK_FIELDS.contains(&key) && !fields.contains_key(key) {
            let value = unquote(value.trim());
            if !value.is_empty() {
                fields.insert(key.into(), value.into());
            }
        }
    }
    fields
}

fn unquote(value: &str) -> &str {
    for quote in ['"', '\''] {
        if let Some(inner) = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote))
        {
            return inner;
        }
    }
    value
}

/// Reads typed fields and collects their issues.
struct Reader<'a> {
    fields: &'a Mapping,
    issues: &'a mut Vec<TaskIssue>,
}

impl Reader<'_> {
    /// A field that may be missing or empty.
    fn optional<T: DeserializeOwned>(
        &mut self,
        key: &str,
        check: fn(&T) -> Result<(), String>,
    ) -> Option<T> {
        let value = self.fields.get(key).filter(|value| !value.is_null())?;
        let parsed = serde_norway::from_value::<T>(value.clone())
            .map_err(|err| err.to_string())
            .and_then(|parsed| check(&parsed).map(|()| parsed));
        match parsed {
            Ok(parsed) => Some(parsed),
            Err(message) => {
                self.issue(key, message);
                None
            }
        }
    }

    /// A field that must be present.
    fn required<T: DeserializeOwned>(
        &mut self,
        key: &str,
        check: fn(&T) -> Result<(), String>,
    ) -> Option<T> {
        let present = self.fields.get(key).is_some_and(|value| !value.is_null());
        if !present {
            self.issue(key, "required field is missing".into());
        }
        self.optional(key, check)
    }

    fn issue(&mut self, key: &str, message: String) {
        self.issues.push(TaskIssue {
            key: Some(key.to_string()),
            message,
        });
    }
}

fn no_check<T>(_: &T) -> Result<(), String> {
    Ok(())
}

#[allow(clippy::ptr_arg)] // `Reader` passes `&T`, here `&String`.
fn check_not_blank(text: &String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("must not be empty".into());
    }
    Ok(())
}

#[allow(clippy::ptr_arg)] // `Reader` passes `&T`, here `&String`.
fn check_date(date: &String) -> Result<(), String> {
    chrono::NaiveDate::parse_from_str(date, DATE_FORMAT)
        .map(|_| ())
        .map_err(|_| format!("`{date}` is not a date like 2026-10-30"))
}

fn check_priority(priority: &u8) -> Result<(), String> {
    if !(1..=5).contains(priority) {
        return Err(format!("`{priority}` is not between 1 and 5"));
    }
    Ok(())
}

#[allow(clippy::ptr_arg)] // `Reader` passes `&T`, here `&String`.
fn check_id(id: &String) -> Result<(), String> {
    if !is_task_id(id) {
        return Err(format!("`{id}` is not a task id"));
    }
    Ok(())
}

#[allow(clippy::ptr_arg)] // `Reader` passes `&T`, here `&Vec<String>`.
fn check_ids(ids: &Vec<String>) -> Result<(), String> {
    ids.iter().try_for_each(check_id)
}

/// The slug as words, or the file stem when the name has no task id.
fn fallback_title(file_name: &str) -> String {
    match parse_task_filename(file_name) {
        Some(name) if !name.slug.is_empty() => name.slug.replace('-', " "),
        _ => file_name.trim_end_matches(".md").to_string(),
    }
}

fn file_issue(message: String) -> TaskIssue {
    TaskIssue { key: None, message }
}

/// Finds the frontmatter: a first line `---` and a later line `---`.
fn locate_frontmatter(text: &str) -> Option<Frontmatter> {
    let first_end = text.find('\n')?;
    if text[..first_end].trim_end_matches('\r') != "---" {
        return None;
    }
    let start = first_end + 1;
    let mut pos = start;
    loop {
        let line_end = text[pos..].find('\n').map(|i| pos + i);
        let line = &text[pos..line_end.unwrap_or(text.len())];
        if line.trim_end_matches('\r') == "---" {
            return Some(Frontmatter {
                start,
                end: pos,
                body_start: line_end.map_or(text.len(), |end| end + 1),
            });
        }
        pos = line_end? + 1;
    }
}

/// `## ` headings outside code fences and the text under each.
fn parse_sections(body: &str) -> Vec<Section> {
    let mut sections: Vec<Section> = Vec::new();
    let mut fence: Option<&str> = None;
    for line in body.lines() {
        let trimmed = line.trim_start();
        let marker = ["```", "~~~"]
            .into_iter()
            .find(|marker| trimmed.starts_with(marker));
        match (fence, marker) {
            (None, Some(marker)) => fence = Some(marker),
            (Some(open), Some(marker)) if open == marker => fence = None,
            _ => {}
        }
        if fence.is_none()
            && marker.is_none()
            && let Some(heading) = line.strip_prefix("## ")
        {
            sections.push(Section {
                heading: heading.trim().to_string(),
                content: String::new(),
            });
            continue;
        }
        if let Some(section) = sections.last_mut() {
            section.content.push_str(line);
            section.content.push('\n');
        }
    }
    for section in &mut sections {
        section.content = section
            .content
            .trim_matches(|c| c == '\n' || c == '\r')
            .to_string();
    }
    sections
}

/// Sets frontmatter field `key` to `value`. Only the lines of that field change; a new field
/// is added at the end of the frontmatter, and a file without frontmatter gets one.
pub fn set_field(text: &str, key: &str, value: &FieldValue) -> Result<String, String> {
    check_key(key)?;
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let line = format!("{key}: {}{newline}", format_value(value));
    let Some(frontmatter) = locate_frontmatter(text) else {
        return Ok(format!("---{newline}{line}---{newline}{text}"));
    };
    let (start, end) =
        field_range(text, &frontmatter, key).unwrap_or((frontmatter.end, frontmatter.end));
    Ok(format!("{}{line}{}", &text[..start], &text[end..]))
}

/// Removes frontmatter field `key`. The text is unchanged when the field is not there.
pub fn remove_field(text: &str, key: &str) -> Result<String, String> {
    check_key(key)?;
    let range =
        locate_frontmatter(text).and_then(|frontmatter| field_range(text, &frontmatter, key));
    Ok(match range {
        Some((start, end)) => format!("{}{}", &text[..start], &text[end..]),
        None => text.to_string(),
    })
}

fn check_key(key: &str) -> Result<(), String> {
    let valid = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !valid {
        return Err(format!("`{key}` is not a frontmatter field name"));
    }
    Ok(())
}

/// The byte range of field `key`: its line plus following indented or `-` lines.
fn field_range(text: &str, frontmatter: &Frontmatter, key: &str) -> Option<(usize, usize)> {
    let mut pos = frontmatter.start;
    let mut start = None;
    while pos < frontmatter.end {
        let line_end = text[pos..frontmatter.end]
            .find('\n')
            .map_or(frontmatter.end, |i| pos + i + 1);
        let line = &text[pos..line_end];
        match start {
            None => {
                let after_key = line
                    .strip_prefix(key)
                    .and_then(|rest| rest.strip_prefix(':'));
                if after_key.is_some_and(|rest| {
                    rest.is_empty() || rest.starts_with([' ', '\t', '\r', '\n'])
                }) {
                    start = Some(pos);
                }
            }
            Some(start) if !line.starts_with([' ', '\t', '-']) => return Some((start, pos)),
            Some(_) => {}
        }
        pos = line_end;
    }
    start.map(|start| (start, frontmatter.end))
}

fn format_value(value: &FieldValue) -> String {
    match value {
        FieldValue::Number(number) => number.to_string(),
        FieldValue::Text(text) => quote_unless_plain(
            text,
            |plain| format!("k: {plain}"),
            |parsed| parsed == &Value::String(text.clone()),
        ),
        FieldValue::List(items) => {
            let items: Vec<String> = items
                .iter()
                .map(|item| {
                    quote_unless_plain(
                        item,
                        |plain| format!("k: [{plain}]"),
                        |parsed| parsed == &Value::Sequence(vec![Value::String(item.clone())]),
                    )
                })
                .collect();
            format!("[{}]", items.join(", "))
        }
    }
}

/// `text` as written, when YAML reads it back as the same value; otherwise double quoted.
/// JSON string syntax is valid YAML double-quoted syntax.
fn quote_unless_plain(
    text: &str,
    document: impl Fn(&str) -> String,
    reads_back: impl Fn(&Value) -> bool,
) -> String {
    let plain_ok = !text.is_empty()
        && text.trim() == text
        && !text.contains(['\n', '\r'])
        && serde_norway::from_str::<Mapping>(&document(text))
            .ok()
            .and_then(|fields| fields.get("k").map(&reads_back))
            .unwrap_or(false);
    if plain_ok {
        text.to_string()
    } else {
        serde_json::to_string(text).expect("strings always serialize")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEMPLATE: &str = include_str!("../../../templates/task.md");
    const TEMPLATE_NAME: &str = "20261030-143201-8f2a-board-columns-from-config.md";

    fn issue_keys(task: &Task) -> Vec<Option<&str>> {
        task.issues
            .iter()
            .map(|issue| issue.key.as_deref())
            .collect()
    }

    fn text(value: &str) -> FieldValue {
        FieldValue::Text(value.into())
    }

    fn list(items: &[&str]) -> FieldValue {
        FieldValue::List(items.iter().map(|item| item.to_string()).collect())
    }

    #[test]
    fn reads_the_template() {
        let task = parse_task(TEMPLATE_NAME, TEMPLATE);
        assert_eq!(task.issues, []);
        assert_eq!(task.id.as_deref(), Some("20261030-143201-8f2a"));
        assert_eq!(task.title, "Board columns from config");
        assert_eq!(task.created.as_deref(), Some("2026-10-30"));
        assert_eq!(task.tags, ["board"]);
        assert_eq!(task.priority, Some(2));
        assert_eq!(task.implements, ["S-board-columns"]);
        assert!(task.depends_on.is_empty());
        assert_eq!(task.parent, None);
        assert_eq!(task.completed, None);
        let headings: Vec<_> = task.sections.iter().map(|s| s.heading.as_str()).collect();
        assert_eq!(
            headings,
            [
                "Description",
                "Acceptance criteria",
                "Implementation notes",
                "Result"
            ]
        );
        assert!(
            task.sections[1]
                .content
                .starts_with("- [ ] The board shows")
        );
    }

    #[test]
    fn writing_the_template_fields_with_their_own_values_changes_nothing() {
        let fields = [
            ("id", text("20261030-143201-8f2a")),
            ("title", text("Board columns from config")),
            ("tags", list(&["board"])),
            ("created", text("2026-10-30")),
            ("priority", FieldValue::Number(2)),
            ("implements", list(&["S-board-columns"])),
            ("depends_on", list(&[])),
        ];
        let mut written = TEMPLATE.to_string();
        for (key, value) in &fields {
            written = set_field(&written, key, value).unwrap();
        }
        assert_eq!(written, TEMPLATE);
        assert_eq!(remove_field(TEMPLATE, "completed").unwrap(), TEMPLATE);
    }

    #[test]
    fn writing_keeps_unknown_fields_order_comments_and_body() {
        let original = "---\nid: 20261030-220003-9910\ntitle: Old\nestimate: 3 # hours\ntags:\n  - a\n  - b\ncreated: 2026-10-30\n---\n\n## Description\ntitle: not frontmatter\n";
        let written = set_field(original, "tags", &list(&["c"])).unwrap();
        let written = set_field(&written, "title", &text("New")).unwrap();
        assert_eq!(
            written,
            "---\nid: 20261030-220003-9910\ntitle: New\nestimate: 3 # hours\ntags: [c]\ncreated: 2026-10-30\n---\n\n## Description\ntitle: not frontmatter\n"
        );
    }

    #[test]
    fn adds_and_removes_fields() {
        let original = "---\nid: 20261030-220003-9910\ntitle: T\ncreated: 2026-10-30\n---\nbody\n";
        let done = set_field(original, "completed", &text("2026-10-31")).unwrap();
        assert_eq!(
            done,
            "---\nid: 20261030-220003-9910\ntitle: T\ncreated: 2026-10-30\ncompleted: 2026-10-31\n---\nbody\n"
        );
        assert_eq!(remove_field(&done, "completed").unwrap(), original);
    }

    #[test]
    fn does_not_mistake_a_longer_key_for_the_field() {
        let original = "---\ntitle_old: x\ntitle: T\n---\n";
        let written = set_field(original, "title", &text("U")).unwrap();
        assert_eq!(written, "---\ntitle_old: x\ntitle: U\n---\n");
    }

    #[test]
    fn keeps_crlf_line_endings() {
        let original = "---\r\ntitle: T\r\ncreated: 2026-10-30\r\n---\r\nbody\r\n";
        let written = set_field(original, "title", &text("U")).unwrap();
        assert_eq!(
            written,
            "---\r\ntitle: U\r\ncreated: 2026-10-30\r\n---\r\nbody\r\n"
        );
        let added = set_field(original, "priority", &FieldValue::Number(1)).unwrap();
        assert_eq!(
            added,
            "---\r\ntitle: T\r\ncreated: 2026-10-30\r\npriority: 1\r\n---\r\nbody\r\n"
        );
    }

    #[test]
    fn adds_frontmatter_to_a_file_without_one() {
        let written = set_field("# Note\n", "title", &text("Note")).unwrap();
        assert_eq!(written, "---\ntitle: Note\n---\n# Note\n");
    }

    #[test]
    fn quotes_values_that_plain_yaml_would_misread() {
        let cases = [
            (
                "Project scaffold: Tauri, React",
                "\"Project scaffold: Tauri, React\"",
            ),
            ("true", "\"true\""),
            ("42", "\"42\""),
            ("# heading", "\"# heading\""),
            ("", "\"\""),
            (" padded", "\" padded\""),
            ("say \"hi\"", "say \"hi\""),
            ("Board columns from config", "Board columns from config"),
        ];
        for (value, written) in cases {
            let file = set_field("---\n---\n", "title", &text(value)).unwrap();
            assert_eq!(file, format!("---\ntitle: {written}\n---\n"), "{value:?}");
            let fields: Mapping = serde_norway::from_str(&format!("title: {written}")).unwrap();
            assert_eq!(
                fields.get("title"),
                Some(&Value::String(value.into())),
                "{value:?}"
            );
        }
        assert_eq!(
            format_value(&list(&["a, b", "[x]", "S-ids"])),
            "[\"a, b\", \"[x]\", S-ids]"
        );
    }

    #[test]
    fn rejects_invalid_field_names() {
        for key in ["", "a b", "a:b", "x\ny"] {
            assert!(set_field("---\n---\n", key, &text("v")).is_err(), "{key:?}");
        }
    }

    #[test]
    fn filename_id_wins_over_a_different_frontmatter_id() {
        let file = "---\nid: 20261030-000000-aaaa\ntitle: T\ncreated: 2026-10-30\n---\n";
        let task = parse_task("20261030-220003-9910-t.md", file);
        assert_eq!(task.id.as_deref(), Some("20261030-220003-9910"));
        assert_eq!(issue_keys(&task), [Some("id")]);
        assert!(task.issues[0].message.contains("20261030-000000-aaaa"));
    }

    #[test]
    fn uses_the_frontmatter_id_when_the_filename_has_none() {
        let file = "---\nid: 20261030-220003-9910\ntitle: T\ncreated: 2026-10-30\n---\n";
        let task = parse_task("loose-note.md", file);
        assert_eq!(task.id.as_deref(), Some("20261030-220003-9910"));
        assert_eq!(issue_keys(&task), [None]);
    }

    #[test]
    fn a_file_without_frontmatter_is_listed_with_issues() {
        let task = parse_task("20261030-220003-9910-task-file-model.md", "Just text\n");
        assert_eq!(task.id.as_deref(), Some("20261030-220003-9910"));
        assert_eq!(task.title, "task file model");
        assert_eq!(issue_keys(&task), [None, Some("title"), Some("created")]);
    }

    #[test]
    fn invalid_yaml_still_gives_id_and_title() {
        let file = "---\nid: 20261030-220003-9910\ntitle: Task file model: frontmatter and sections\ntags: [planning]\ncreated: 2026-10-30\n---\n## Description\nx\n";
        let task = parse_task("20261030-220003-9910-task-file-model.md", file);
        assert_eq!(task.title, "Task file model: frontmatter and sections");
        assert_eq!(task.created.as_deref(), Some("2026-10-30"));
        assert_eq!(task.sections.len(), 1);
        assert_eq!(issue_keys(&task), [None]);
        assert!(task.issues[0].message.contains("not valid YAML"));
    }

    #[test]
    fn invalid_values_are_reported_by_field() {
        let file = "---\ntitle: ''\ncreated: 30.10.2026\npriority: 9\ntags: board\ndepends_on: [nope]\nparent: 20261030-220003-9910\ncompleted:\n---\n";
        let task = parse_task("20261030-220003-9910-t.md", file);
        assert_eq!(
            issue_keys(&task),
            [
                Some("title"),
                Some("created"),
                Some("tags"),
                Some("priority"),
                Some("depends_on")
            ]
        );
        assert_eq!(task.title, "t");
        assert_eq!(task.priority, None);
        assert!(task.tags.is_empty());
        assert_eq!(task.parent.as_deref(), Some("20261030-220003-9910"));
        assert_eq!(task.completed, None);
    }

    #[test]
    fn headings_inside_code_fences_are_not_sections() {
        let body = "## Description\n```md\n## not a section\n```\n## Result\ndone\n";
        let task = parse_task(
            "20261030-220003-9910-t.md",
            &format!("---\ntitle: T\ncreated: 2026-10-30\n---\n{body}"),
        );
        let headings: Vec<_> = task.sections.iter().map(|s| s.heading.as_str()).collect();
        assert_eq!(headings, ["Description", "Result"]);
        assert_eq!(task.sections[0].content, "```md\n## not a section\n```");
    }

    #[test]
    fn reads_every_file_in_a_column_including_broken_ones() {
        let dir = std::env::temp_dir().join(format!(
            "stardust-task-{}",
            crate::domain::ids::random_suffix()
        ));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join(TEMPLATE_NAME), TEMPLATE).unwrap();
        std::fs::write(dir.join("broken.md"), "no frontmatter").unwrap();
        std::fs::write(dir.join("image.png"), [0u8]).unwrap();
        std::fs::write(dir.join("sub/20261030-000000-aaaa-x.md"), "").unwrap();

        let tasks = read_column(&dir).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        let names: Vec<_> = tasks.iter().map(|t| t.file_name.as_str()).collect();
        assert_eq!(names, [TEMPLATE_NAME, "broken.md"]);
        assert_eq!(tasks[0].issues, []);
        assert!(!tasks[1].issues.is_empty());
        let modified = tasks[0].modified.as_deref().unwrap();
        assert!(
            chrono::DateTime::parse_from_rfc3339(modified).is_ok(),
            "{modified}"
        );
    }

    #[test]
    fn parsed_text_has_no_modified_time() {
        assert_eq!(parse_task(TEMPLATE_NAME, TEMPLATE).modified, None);
    }

    #[test]
    fn this_repository_tasks_are_all_listed() {
        let planning = Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/planning");
        for column in ["inbox", "next", "done"] {
            let dir = planning.join(column);
            let files = std::fs::read_dir(&dir)
                .unwrap()
                .filter(|entry| {
                    entry
                        .as_ref()
                        .unwrap()
                        .file_name()
                        .to_string_lossy()
                        .ends_with(".md")
                })
                .count();
            let tasks = read_column(&dir).unwrap();
            assert_eq!(tasks.len(), files, "{column}");
            for task in &tasks {
                assert!(task.id.is_some(), "{}", task.file_name);
                assert!(task.created.is_some(), "{}", task.file_name);
            }
        }
    }
}
