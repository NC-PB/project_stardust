//! Make task (`S-make-task`): a new task in the first column from text selected in any file.

use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::domain::agents_block::spec_location;
use crate::domain::config::Config;
use crate::domain::ids::{self, IdKind};
use crate::domain::task::{self, FieldValue};
use crate::domain::templates::{self, TemplateKind};

/// Titles taken from a selection are cut at a word boundary to at most this many characters.
const MAX_TITLE_CHARS: usize = 80;
const UNTITLED: &str = "Untitled task";

/// The files besides tasks that text is usually selected in, as absolute paths; `None` when the
/// file does not exist. A spec split into a folder has no single file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SourceFiles {
    pub braindump: Option<String>,
    pub spec: Option<String>,
}

pub fn source_files(repo_root: &Path, config: &Config) -> SourceFiles {
    let existing = |relative: String| {
        let path = repo_root.join(relative);
        path.is_file()
            .then(|| path.to_string_lossy().replace('\\', "/"))
    };
    SourceFiles {
        braindump: existing(format!("{}/braindump.md", config.planning_root)),
        spec: existing(spec_location(config, repo_root)),
    }
}

/// Creates a task in the first column of the repository at `repo_root` from `selection`, text
/// selected in the file `source`. Returns the path of the new file. Never overwrites a file.
pub fn make_task(
    repo_root: &Path,
    config: &Config,
    source: &Path,
    selection: &str,
    today: &str,
) -> Result<PathBuf, String> {
    let selection = selection.trim_matches(|c| c == '\n' || c == '\r');
    if selection.trim().is_empty() {
        return Err("nothing is selected".to_string());
    }
    let column = config
        .columns
        .first()
        .ok_or_else(|| "no columns are configured".to_string())?;
    let planning_root = repo_root.join(&config.planning_root);
    let dir = planning_root.join(column);
    if !dir.is_dir() {
        return Err(format!("the column folder `{column}` does not exist"));
    }
    let template = templates::resolve(TemplateKind::Task, repo_root, config).text;
    let id = ids::new_id(IdKind::Task, &planning_root).map_err(|err| err.to_string())?;
    let title = title_of(selection);
    let source_name = source.file_stem().map_or_else(
        || "source".to_string(),
        |stem| stem.to_string_lossy().into_owned(),
    );
    let description = format!(
        "{}\n\nSource: [{source_name}]({})",
        selection.trim_end(),
        relative_link(&dir, source)
    );
    let text = fill_template(&template, &id, &title, today, &description)?;
    let path = dir.join(ids::task_filename(&id, &title));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|err| match err.kind() {
            ErrorKind::AlreadyExists => format!("{} exists already", path.display()),
            _ => err.to_string(),
        })?;
    file.write_all(text.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(path)
}

/// The task `template` with its example values replaced: `id`, `title` and `created` set,
/// lists emptied, `priority`, `completed` and `parent` removed, `description` as the
/// Description and one empty criterion. Other sections keep the template's text.
pub fn fill_template(
    template: &str,
    id: &str,
    title: &str,
    created: &str,
    description: &str,
) -> Result<String, String> {
    let mut text = template.to_string();
    for (key, value) in [("id", id), ("title", title), ("created", created)] {
        text = task::set_field(&text, key, &FieldValue::Text(value.to_string()))?;
    }
    for key in ["tags", "implements", "depends_on"] {
        text = task::set_field(&text, key, &FieldValue::List(Vec::new()))?;
    }
    for key in ["priority", "completed", "parent"] {
        text = task::remove_field(&text, key)?;
    }
    text = replace_section(&text, "Description", description);
    if has_section(&text, "Acceptance criteria") {
        text = replace_section(&text, "Acceptance criteria", "- [ ] ");
    }
    Ok(text)
}

/// A title from the first non-empty line of `selection`, without list, heading and quote
/// markers, cut at a word boundary.
pub fn title_of(selection: &str) -> String {
    let Some(line) = selection
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
    else {
        return UNTITLED.to_string();
    };
    let mut line = line;
    loop {
        let before = line;
        line = line.trim_start_matches(['#', '>']).trim_start();
        for marker in [
            "- [ ] ", "- [x] ", "- [X] ", "* [ ] ", "* [x] ", "- ", "* ", "+ ",
        ] {
            line = line.strip_prefix(marker).unwrap_or(line);
        }
        let digits = line.len() - line.trim_start_matches(|c: char| c.is_ascii_digit()).len();
        if digits > 0 && line[digits..].starts_with(['.', ')']) {
            line = &line[digits + 1..];
        }
        line = line.trim_start();
        if line == before {
            break;
        }
    }
    let words: Vec<&str> = line.split_whitespace().collect();
    let mut title = String::new();
    for word in words {
        let added = if title.is_empty() { 0 } else { 1 } + word.chars().count();
        if title.chars().count() + added > MAX_TITLE_CHARS {
            break;
        }
        if !title.is_empty() {
            title.push(' ');
        }
        title.push_str(word);
    }
    if title.is_empty() {
        // A first word longer than the limit is cut inside the word.
        title = line.chars().take(MAX_TITLE_CHARS).collect();
    }
    if title.is_empty() {
        UNTITLED.to_string()
    } else {
        title
    }
}

/// The markdown link from a file in `from_dir` to `to`, with `/` and `%20` for spaces.
pub fn relative_link(from_dir: &Path, to: &Path) -> String {
    let normal = |path: &Path| -> Vec<String> {
        path.components()
            .filter(|part| !matches!(part, Component::CurDir))
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect()
    };
    let from = normal(from_dir);
    let to = normal(to);
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<String> = vec!["..".to_string(); from.len() - common];
    parts.extend(to[common..].iter().cloned());
    parts
        .join("/")
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
}

/// The byte ranges of `## ` headings outside code fences: (heading start, content start, title).
fn headings(text: &str) -> Vec<(usize, usize, String)> {
    let mut found = Vec::new();
    let mut fence: Option<&str> = None;
    let mut pos = 0;
    for line in text.split_inclusive('\n') {
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
            found.push((pos, pos + line.len(), heading.trim().to_string()));
        }
        pos += line.len();
    }
    found
}

fn has_section(text: &str, heading: &str) -> bool {
    headings(text).iter().any(|(_, _, title)| title == heading)
}

/// `text` with the content under `## heading` replaced by `content`; the section is added at
/// the end when the text has none.
fn replace_section(text: &str, heading: &str, content: &str) -> String {
    let found = headings(text);
    let Some(index) = found.iter().position(|(_, _, title)| title == heading) else {
        let separator = if text.ends_with('\n') { "\n" } else { "\n\n" };
        return format!("{text}{separator}## {heading}\n{content}\n");
    };
    let content_start = found[index].1;
    let end = found.get(index + 1).map_or(text.len(), |next| next.0);
    let tail = if end < text.len() { "\n\n" } else { "\n" };
    format!("{}{content}{tail}{}", &text[..content_start], &text[end..])
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEMPLATE: &str = include_str!("../../../templates/task.md");

    #[test]
    fn titles_come_from_the_first_line_without_markers() {
        assert_eq!(
            title_of("\n\n- [ ] Fix the board  sort\nmore"),
            "Fix the board sort"
        );
        assert_eq!(title_of("## Heading"), "Heading");
        assert_eq!(title_of("> - quoted item"), "quoted item");
        assert_eq!(title_of("12. numbered"), "numbered");
        assert_eq!(title_of("  \n "), UNTITLED);
        assert_eq!(title_of("-"), "-");
        let long = "word ".repeat(30);
        let title = title_of(&long);
        assert!(title.chars().count() <= MAX_TITLE_CHARS);
        assert!(title.ends_with("word"));
        assert_eq!(title_of(&"x".repeat(100)).chars().count(), MAX_TITLE_CHARS);
    }

    #[test]
    fn links_are_relative_and_escaped() {
        let inbox = Path::new("/repo/docs/planning/inbox");
        assert_eq!(
            relative_link(inbox, Path::new("/repo/docs/planning/braindump.md")),
            "../braindump.md"
        );
        assert_eq!(
            relative_link(inbox, Path::new("/repo/docs/planning/inbox/a.md")),
            "a.md"
        );
        assert_eq!(
            relative_link(inbox, Path::new("/repo/notes/my idea (1).md")),
            "../../../notes/my%20idea%20%281%29.md"
        );
    }

    #[test]
    fn the_template_examples_are_replaced() {
        let text = fill_template(
            TEMPLATE,
            "20261031-101500-ab12",
            "Board: drag cards",
            "2026-10-31",
            "Drag cards.\n\nSource: [braindump](../braindump.md)",
        )
        .unwrap();
        let task = task::parse_task("20261031-101500-ab12-board-drag-cards.md", &text);
        assert!(task.issues.is_empty(), "{:?}", task.issues);
        assert_eq!(task.title, "Board: drag cards");
        assert_eq!(task.created.as_deref(), Some("2026-10-31"));
        assert!(task.tags.is_empty() && task.implements.is_empty() && task.depends_on.is_empty());
        assert_eq!(task.priority, None);
        let sections: Vec<(&str, &str)> = task
            .sections
            .iter()
            .map(|section| (section.heading.as_str(), section.content.as_str()))
            .collect();
        let template = task::parse_task("x.md", TEMPLATE);
        assert_eq!(
            sections[0],
            (
                "Description",
                "Drag cards.\n\nSource: [braindump](../braindump.md)"
            )
        );
        assert_eq!(sections[1], ("Acceptance criteria", "- [ ] "));
        assert_eq!(&task.sections[2..], &template.sections[2..]);
        assert!(text.contains("\n## Acceptance criteria\n- [ ] \n\n## Implementation notes\n"));
    }

    #[test]
    fn a_template_without_sections_gets_a_description() {
        let text = fill_template(
            "---\ntitle: x\n---\n",
            "20261031-101500-ab12",
            "T",
            "2026-10-31",
            "Body",
        )
        .unwrap();
        assert!(text.ends_with("---\n\n## Description\nBody\n"), "{text}");
        assert!(!text.contains("## Acceptance criteria"));
    }

    #[test]
    fn headings_inside_code_fences_are_not_sections() {
        let text = "## Description\n```\n## Not a section\n```\n## Result\nr\n";
        assert_eq!(
            replace_section(text, "Description", "new"),
            "## Description\nnew\n\n## Result\nr\n"
        );
    }

    #[test]
    fn source_files_exist_or_are_none() {
        let repo = std::env::temp_dir().join(format!("stardust-sources-{}", fastrand::u32(..)));
        let config = Config::default();
        let planning = repo.join(&config.planning_root);
        std::fs::create_dir_all(planning.join("spec")).unwrap();
        std::fs::write(planning.join("braindump.md"), "").unwrap();
        let files = source_files(&repo, &config);
        assert!(
            files
                .braindump
                .unwrap()
                .ends_with("docs/planning/braindump.md")
        );
        assert_eq!(files.spec, None);
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_the_task_in_the_first_column() {
        let repo = std::env::temp_dir().join(format!("stardust-make-{}", fastrand::u32(..)));
        let config = Config::default();
        let planning = repo.join(&config.planning_root);
        std::fs::create_dir_all(planning.join(&config.columns[0])).unwrap();
        let source = planning.join("braindump.md");
        std::fs::write(&source, "- idea one\n").unwrap();

        let path = make_task(&repo, &config, &source, "- idea one\n", "2026-10-31").unwrap();
        assert_eq!(path.parent().unwrap(), planning.join(&config.columns[0]));
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.ends_with("-idea-one.md"), "{name}");
        let task = task::read_task(&path);
        assert!(task.issues.is_empty(), "{:?}", task.issues);
        assert_eq!(task.title, "idea one");
        assert!(
            task.sections[0]
                .content
                .ends_with("Source: [braindump](../braindump.md)")
        );

        assert!(make_task(&repo, &config, &source, " \n", "2026-10-31").is_err());
        std::fs::remove_dir_all(repo).unwrap();
    }
}
