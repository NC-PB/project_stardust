//! Ids and task filenames (`S-ids`, `R-unique-ids`, `R-filename-truth`).
//!
//! An id is `YYYYMMDD-HHMMSS-xxxx`: local time to the second plus 4 random characters
//! from `[a-z0-9]` (D-20261030-213854-k3cv). Questions and decisions carry a `Q-` or `D-`
//! prefix. Uniqueness is checked against the id part without prefix, so a task and a
//! decision never share one.

use std::collections::HashSet;
use std::io;
use std::path::Path;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use specta::Type;
use walkdir::WalkDir;

const SUFFIX_ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
const SUFFIX_LEN: usize = 4;
/// `YYYYMMDD-HHMMSS-xxxx`
const ID_LEN: usize = 8 + 1 + 6 + 1 + SUFFIX_LEN;
const TIMESTAMP_FORMAT: &str = "%Y%m%d-%H%M%S";
/// Collisions need the same second and suffix; this bound only guards against a broken source.
const MAX_ATTEMPTS: usize = 100;
/// Long titles are cut at a word boundary so filenames stay readable and within path limits.
const MAX_SLUG_LEN: usize = 60;

/// What an id is for; decides the prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum IdKind {
    Task,
    Question,
    Decision,
}

impl IdKind {
    fn prefix(self) -> &'static str {
        match self {
            IdKind::Task => "",
            IdKind::Question => "Q-",
            IdKind::Decision => "D-",
        }
    }
}

/// The parts of a task filename `<id>-<slug>.md`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TaskFilename {
    pub id: String,
    /// Empty when the file is named `<id>.md`.
    pub slug: String,
}

#[derive(Debug)]
pub enum IdError {
    Io(io::Error),
    /// Every attempt collided with an existing id.
    Exhausted,
}

impl std::fmt::Display for IdError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IdError::Io(err) => write!(f, "could not read the planning root: {err}"),
            IdError::Exhausted => write!(f, "no free id after {MAX_ATTEMPTS} attempts"),
        }
    }
}

impl From<io::Error> for IdError {
    fn from(err: io::Error) -> Self {
        IdError::Io(err)
    }
}

/// A new id for `kind`, unique across every file under `planning_root`, archive included.
pub fn new_id(kind: IdKind, planning_root: &Path) -> Result<String, IdError> {
    let existing = existing_ids(planning_root)?;
    let now = chrono::Local::now().naive_local();
    generate_id(kind, now, &existing, random_suffix)
}

/// Builds ids from `time` and `next_suffix` until one is not in `existing`.
/// `existing` holds ids without prefix, as returned by [`existing_ids`].
pub fn generate_id(
    kind: IdKind,
    time: NaiveDateTime,
    existing: &HashSet<String>,
    mut next_suffix: impl FnMut() -> String,
) -> Result<String, IdError> {
    let timestamp = time.format(TIMESTAMP_FORMAT).to_string();
    for _ in 0..MAX_ATTEMPTS {
        let id = format!("{timestamp}-{}", next_suffix());
        if !existing.contains(&id) {
            return Ok(format!("{}{id}", kind.prefix()));
        }
    }
    Err(IdError::Exhausted)
}

/// 4 random characters from `[a-z0-9]`.
pub fn random_suffix() -> String {
    (0..SUFFIX_LEN)
        .map(|_| SUFFIX_ALPHABET[fastrand::usize(..SUFFIX_ALPHABET.len())] as char)
        .collect()
}

/// Every id under `planning_root`, without prefix: from all filenames and from the contents
/// of all markdown files, in every subfolder. Ids that are only referenced count as taken.
pub fn existing_ids(planning_root: &Path) -> io::Result<HashSet<String>> {
    let mut ids = HashSet::new();
    for entry in WalkDir::new(planning_root) {
        let entry = entry.map_err(io::Error::other)?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        ids.extend(find_ids(&name).map(str::to_string));
        if name.ends_with(".md") {
            let text = std::fs::read_to_string(entry.path())?;
            ids.extend(find_ids(&text).map(str::to_string));
        }
    }
    Ok(ids)
}

/// Id-shaped tokens in `text`, without prefix. A token must not touch a letter or digit on
/// either side, so longer digit runs or suffixes are not mistaken for ids.
pub fn find_ids(text: &str) -> impl Iterator<Item = &str> {
    let bytes = text.as_bytes();
    (0..bytes.len().saturating_sub(ID_LEN - 1)).filter_map(move |start| {
        let end = start + ID_LEN;
        let before_ok = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        let after_ok = end == bytes.len() || !bytes[end].is_ascii_alphanumeric();
        (before_ok && after_ok && is_id(&bytes[start..end])).then(|| &text[start..end])
    })
}

/// Whether `text` is exactly a task id, `YYYYMMDD-HHMMSS-xxxx` without prefix.
pub fn is_task_id(text: &str) -> bool {
    is_id(text.as_bytes())
}

/// Whether `candidate` is exactly an id without prefix.
fn is_id(candidate: &[u8]) -> bool {
    candidate.len() == ID_LEN
        && candidate.iter().enumerate().all(|(i, &b)| match i {
            0..=7 | 9..=14 => b.is_ascii_digit(),
            8 | 15 => b == b'-',
            _ => SUFFIX_ALPHABET.contains(&b),
        })
}

/// Splits `<id>-<slug>.md` or `<id>.md`. `None` when the name does not start with a task id.
pub fn parse_task_filename(name: &str) -> Option<TaskFilename> {
    let stem = name.strip_suffix(".md")?;
    let id = stem.get(..ID_LEN)?;
    if !is_id(id.as_bytes()) {
        return None;
    }
    let slug = match &stem[ID_LEN..] {
        "" => "",
        rest => rest.strip_prefix('-').filter(|slug| !slug.is_empty())?,
    };
    Some(TaskFilename {
        id: id.to_string(),
        slug: slug.to_string(),
    })
}

/// `<id>-<slug>.md` for a task, or `<id>.md` when the title has no usable characters.
pub fn task_filename(id: &str, title: &str) -> String {
    match slugify(title) {
        slug if slug.is_empty() => format!("{id}.md"),
        slug => format!("{id}-{slug}.md"),
    }
}

/// Lowercase ascii words joined by hyphens. Common Latin letters with diacritics are
/// transliterated (German umlauts as `ae`, `oe`, `ue`); any other character that is not an
/// ascii letter or digit separates words.
pub fn slugify(title: &str) -> String {
    let mut words: Vec<String> = vec![String::new()];
    for c in title.chars().flat_map(char::to_lowercase) {
        let current = words.last_mut().expect("words is never empty");
        if c.is_ascii_alphanumeric() {
            current.push(c);
        } else if let Some(ascii) = transliterate(c) {
            current.push_str(ascii);
        } else if !current.is_empty() {
            words.push(String::new());
        }
    }
    let mut slug = String::new();
    for word in words.iter().filter(|word| !word.is_empty()) {
        let separator = if slug.is_empty() { 0 } else { 1 };
        if !slug.is_empty() && slug.len() + separator + word.len() > MAX_SLUG_LEN {
            break;
        }
        if separator == 1 {
            slug.push('-');
        }
        slug.push_str(word);
    }
    slug.truncate(MAX_SLUG_LEN);
    slug
}

fn transliterate(c: char) -> Option<&'static str> {
    Some(match c {
        'ä' => "ae",
        'ö' => "oe",
        'ü' => "ue",
        'ß' => "ss",
        'à' | 'á' | 'â' | 'ã' | 'å' => "a",
        'æ' => "ae",
        'ç' => "c",
        'è' | 'é' | 'ê' | 'ë' => "e",
        'ì' | 'í' | 'î' | 'ï' => "i",
        'ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ø' => "o",
        'œ' => "oe",
        'ù' | 'ú' | 'û' => "u",
        'ý' | 'ÿ' => "y",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn time() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 30)
            .unwrap()
            .and_hms_opt(22, 0, 1)
            .unwrap()
    }

    fn suffixes(list: &[&str]) -> impl FnMut() -> String {
        let mut iter = list
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>()
            .into_iter();
        move || iter.next().expect("test ran out of suffixes")
    }

    #[test]
    fn generates_task_id_from_time_and_suffix() {
        let id = generate_id(IdKind::Task, time(), &HashSet::new(), suffixes(&["3fab"])).unwrap();
        assert_eq!(id, "20261030-220001-3fab");
    }

    #[test]
    fn prefixes_question_and_decision_ids() {
        let none = HashSet::new();
        let q = generate_id(IdKind::Question, time(), &none, suffixes(&["9tc3"])).unwrap();
        let d = generate_id(IdKind::Decision, time(), &none, suffixes(&["9tc3"])).unwrap();
        assert_eq!(q, "Q-20261030-220001-9tc3");
        assert_eq!(d, "D-20261030-220001-9tc3");
    }

    #[test]
    fn retries_on_collision() {
        let existing = HashSet::from(["20261030-220001-aaaa".to_string()]);
        let id = generate_id(
            IdKind::Decision,
            time(),
            &existing,
            suffixes(&["aaaa", "bbbb"]),
        )
        .unwrap();
        assert_eq!(id, "D-20261030-220001-bbbb");
    }

    #[test]
    fn gives_up_when_every_attempt_collides() {
        let existing = HashSet::from(["20261030-220001-aaaa".to_string()]);
        let result = generate_id(IdKind::Task, time(), &existing, || "aaaa".to_string());
        assert!(matches!(result, Err(IdError::Exhausted)));
    }

    #[test]
    fn random_suffix_uses_lowercase_base36() {
        for _ in 0..1000 {
            let suffix = random_suffix();
            assert_eq!(suffix.len(), SUFFIX_LEN);
            assert!(
                suffix.bytes().all(|b| SUFFIX_ALPHABET.contains(&b)),
                "{suffix}"
            );
        }
    }

    #[test]
    fn finds_ids_with_and_without_prefix() {
        let text = "see D-20261030-211738-9tc3 and [task](../next/20261030-220001-3fab-ids.md)";
        let found: Vec<_> = find_ids(text).collect();
        assert_eq!(found, ["20261030-211738-9tc3", "20261030-220001-3fab"]);
    }

    #[test]
    fn ignores_id_shaped_text_inside_longer_tokens() {
        assert_eq!(find_ids("120261030-220001-3fab").count(), 0);
        assert_eq!(find_ids("20261030-220001-3fabc").count(), 0);
        assert_eq!(find_ids("20261030-220001-3FAB").count(), 0);
        assert_eq!(find_ids("2026103-220001-3fab").count(), 0);
    }

    #[test]
    fn existing_ids_include_filenames_contents_and_archive() {
        let root = std::env::temp_dir().join(format!("stardust-ids-{}", random_suffix()));
        std::fs::create_dir_all(root.join("done/2026-09")).unwrap();
        std::fs::create_dir_all(root.join("next")).unwrap();
        std::fs::write(
            root.join("next/20261030-220001-aaaa-one.md"),
            "depends_on: []",
        )
        .unwrap();
        std::fs::write(root.join("done/2026-09/20260901-100000-bbbb-two.md"), "").unwrap();
        std::fs::write(root.join("spec.md"), "### D-20261030-211738-cccc · x").unwrap();
        std::fs::write(root.join("image-20261030-220001-dddd.png"), [0xff, 0xd8]).unwrap();

        let ids = existing_ids(&root).unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        let expected =
            ["aaaa", "bbbb", "cccc", "dddd"].map(|s| ids.iter().any(|id| id.ends_with(s)));
        assert_eq!(expected, [true; 4], "{ids:?}");
        assert_eq!(ids.len(), 4);
    }

    #[test]
    fn parses_task_filenames() {
        assert_eq!(
            parse_task_filename("20261030-220001-3fab-id-generation-and-filename-parsing.md"),
            Some(TaskFilename {
                id: "20261030-220001-3fab".into(),
                slug: "id-generation-and-filename-parsing".into(),
            })
        );
        assert_eq!(
            parse_task_filename("20261030-220001-3fab.md"),
            Some(TaskFilename {
                id: "20261030-220001-3fab".into(),
                slug: String::new()
            })
        );
    }

    #[test]
    fn rejects_names_that_are_not_task_files() {
        for name in [
            "spec.md",
            "braindump.md",
            "20261030-220001-3fab-slug.txt",
            "20261030-220001-3fab-.md",
            "20261030-220001-3fabslug.md",
            "D-20261030-220001-3fab-slug.md",
            "20261030-220001-3f.md",
            "äöü.md",
        ] {
            assert_eq!(parse_task_filename(name), None, "{name}");
        }
    }

    #[test]
    fn slugifies_existing_task_titles() {
        assert_eq!(
            slugify("Project scaffold: Tauri, React, TypeScript"),
            "project-scaffold-tauri-react-typescript"
        );
        assert_eq!(
            slugify("Write the planner block into AGENTS.md"),
            "write-the-planner-block-into-agents-md"
        );
        assert_eq!(
            slugify("Task file model: frontmatter and sections"),
            "task-file-model-frontmatter-and-sections"
        );
    }

    #[test]
    fn slugify_transliterates_umlauts_and_drops_other_characters() {
        assert_eq!(
            slugify("Größe ändern – Übersicht"),
            "groesse-aendern-uebersicht"
        );
        assert_eq!(slugify("  Café / naïve!! "), "cafe-naive");
        assert_eq!(slugify("Λόγος 2"), "2");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn slugify_cuts_long_titles_at_a_word_boundary() {
        let slug = slugify(&"word ".repeat(30));
        assert!(slug.len() <= MAX_SLUG_LEN);
        assert!(slug.ends_with("word"), "{slug}");
        assert_eq!(slugify(&"x".repeat(80)).len(), MAX_SLUG_LEN);
    }

    #[test]
    fn task_filename_round_trips_through_the_parser() {
        let name = task_filename("20261030-220001-3fab", "Id generation and filename parsing");
        assert_eq!(
            name,
            "20261030-220001-3fab-id-generation-and-filename-parsing.md"
        );
        assert_eq!(
            parse_task_filename(&name).unwrap().id,
            "20261030-220001-3fab"
        );
        assert_eq!(
            task_filename("20261030-220001-3fab", "?"),
            "20261030-220001-3fab.md"
        );
    }
}
