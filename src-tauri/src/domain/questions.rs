//! Answering a question from the Questions form (`S-questions`, `R-append-only`).
//!
//! An answer is a text edit of the spec file that holds the question, `spec.md` or
//! `spec/questions.md`: the answer and the date are appended to the question's text before the
//! `→`, its checkbox is ticked, and the entry moves to the top of `### Answered`. An Open list
//! left empty gets the `- (none)` placeholder. The rest of the file stays as it was, line by
//! line. The result is checked with the append-only guard before it is written, and it is
//! written only when the file still holds the text it was made from.

use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::append_only::append_only_violations;
use super::config::Config;
use super::files::{SaveOutcome, save_text};
use super::spec::{SectionKind, SourceLine, parse_spec_text, read_spec};

/// The placeholder for an empty list of questions.
const NONE: &str = "- (none)";

/// Where an answered question is now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AnsweredQuestion {
    pub id: String,
    /// The first line of the entry under `### Answered`.
    pub at: SourceLine,
}

/// Answers the open question `id` of the spec of the repository at `repo_root` with `answer`
/// on `today` (`YYYY-MM-DD`) and writes the spec file that holds it. Refuses, writing nothing,
/// when the question is not open, the answer is not usable, the edit would break
/// `R-append-only`, or the file changed on disk after it was read.
pub fn answer_question(
    repo_root: &Path,
    config: &Config,
    id: &str,
    answer: &str,
    today: &str,
) -> Result<AnsweredQuestion, String> {
    let spec = read_spec(repo_root, config);
    let question = spec
        .questions
        .iter()
        .find(|question| question.id.as_deref() == Some(id))
        .ok_or_else(|| format!("{id} is not in the spec"))?;
    let file = question.at.file.clone();
    let path = repo_root.join(&config.planning_root).join(&file);
    let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let (answered, at) = answer_in_text(&file, &text, id, answer, today)?;
    match save_text(&path, &text, &answered)? {
        SaveOutcome::Saved => Ok(AnsweredQuestion {
            id: id.to_string(),
            at,
        }),
        SaveOutcome::ChangedOnDisk { .. } => Err(format!(
            "{file} changed on disk while answering; nothing was written, try again"
        )),
    }
}

/// `text`, the spec file `file` (relative to the planning root), with the open question `id`
/// answered, and where the entry is now. Checked against `R-append-only` and read back.
pub fn answer_in_text(
    file: &str,
    text: &str,
    id: &str,
    answer: &str,
    today: &str,
) -> Result<(String, SourceLine), String> {
    let answer = clean_answer(answer)?;
    let spec = parse_spec_text(file, text);
    let question = spec
        .questions
        .iter()
        .find(|question| question.id.as_deref() == Some(id))
        .ok_or_else(|| format!("{id} is not in {file}"))?;
    if question.answered {
        return Err(format!("{id} is answered already"));
    }
    let section = spec
        .sections
        .iter()
        .find(|section| section.kind == SectionKind::Questions && section.at.file == file)
        .ok_or_else(|| format!("{file} has no Questions section"))?;

    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let first = question.at.line as usize - 1;
    let last = (question.end_line as usize).min(lines.len());
    let mut entry: Vec<String> = lines.drain(first..last).collect();
    tick(&mut entry[0]);
    append_answer(&mut entry, &format!("{answer} ({today})"));

    let heading = section.at.line as usize - 1;
    let end = section_end(&lines, heading);
    // The entry came from the Open list: an emptied list gets the placeholder in its place.
    if let Some(open) = subsection(&lines, heading, end, "open")
        && open < first
        && first <= subsection_end(&lines, open, end)
        && !has_items(&lines[open + 1..subsection_end(&lines, open, end)])
    {
        lines.insert(first, NONE.to_string());
    }

    let end = section_end(&lines, heading);
    let start = match subsection(&lines, heading, end, "answered") {
        Some(answered) => {
            let below = subsection_end(&lines, answered, end);
            let top = (answered + 1..below).find(|&index| !lines[index].trim().is_empty());
            match top {
                Some(index) if lines[index].trim().eq_ignore_ascii_case(NONE) => {
                    lines.remove(index);
                    index
                }
                Some(index) => index,
                None => answered + 1,
            }
        }
        None => {
            // No Answered list yet: one after the last line of the section.
            let mut after = end;
            while after > heading + 1 && lines[after - 1].trim().is_empty() {
                after -= 1;
            }
            lines.splice(after..after, [String::new(), "### Answered".to_string()]);
            after + 2
        }
    };
    let line = start as u32 + 1;
    lines.splice(start..start, entry);

    let mut result = lines.join(newline);
    if text.ends_with('\n') {
        result.push_str(newline);
    }

    let violations = append_only_violations(file, text, &result);
    if let Some(violation) = violations.first() {
        return Err(format!("not written: {}", violation.message));
    }
    let after = parse_spec_text(file, &result);
    let now = after
        .questions
        .iter()
        .find(|question| question.id.as_deref() == Some(id));
    match now {
        Some(question) if question.answered && question.answered_on.as_deref() == Some(today) => {
            Ok((
                result,
                SourceLine {
                    file: file.to_string(),
                    line,
                },
            ))
        }
        _ => Err(format!(
            "{id} could not be answered in {file}; nothing was written"
        )),
    }
}

/// The answer on one line, refused when empty or when it would change what the question links.
fn clean_answer(answer: &str) -> Result<String, String> {
    let answer = answer.split_whitespace().collect::<Vec<_>>().join(" ");
    if answer.is_empty() {
        return Err("the answer is empty".into());
    }
    if answer.contains('→') {
        return Err("the answer cannot contain `→`; links follow it in the spec".into());
    }
    Ok(answer)
}

/// Ticks the checkbox of a list item line, or adds a ticked one.
fn tick(line: &mut String) {
    let indent = line.len() - line.trim_start().len();
    let rest = &line[indent..];
    let marker = if ["- ", "* ", "+ "]
        .iter()
        .any(|bullet| rest.starts_with(bullet))
    {
        2
    } else {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        digits + 2
    };
    let at = indent + marker.min(rest.len());
    if line[at..].starts_with("[ ]") {
        line.replace_range(at..at + 3, "[x]");
    } else if !line[at..].starts_with("[x]") && !line[at..].starts_with("[X]") {
        line.insert_str(at, "[x] ");
    }
}

/// Appends `addition` to the text of the entry, before the last `→` when there is one.
fn append_answer(entry: &mut [String], addition: &str) {
    let arrow = entry
        .iter()
        .rposition(|line| line.contains('→'))
        .map(|index| (index, entry[index].rfind('→').expect("the line holds it")));
    match arrow {
        Some((index, at)) => {
            let line = &mut entry[index];
            let before = line[..at].trim_end().to_string();
            let after = line[at..].to_string();
            *line = if before.trim().is_empty() {
                // The `→` opens a continuation line: the answer goes at the end of the one before.
                format!("{before}{addition} {after}")
            } else {
                format!("{before} {addition} {after}")
            };
        }
        None => {
            let last = entry.len() - 1;
            let line = entry[last].trim_end().to_string();
            entry[last] = format!("{line} {addition}");
        }
    }
}

/// Whether `line` is a `### ` or `## ` heading outside a fence; tracks the fence in `fence`.
fn heading_level(line: &str, fence: &mut Option<&'static str>) -> Option<usize> {
    let trimmed = line.trim_start();
    for marker in ["```", "~~~"] {
        if trimmed.starts_with(marker) {
            match fence {
                None => *fence = Some(marker),
                Some(open) if *open == marker => *fence = None,
                _ => {}
            }
            return None;
        }
    }
    if fence.is_some() {
        return None;
    }
    if line.starts_with("## ") {
        Some(2)
    } else if line.starts_with("### ") {
        Some(3)
    } else {
        None
    }
}

/// The index after the last line of the `## ` section whose heading is at `heading`.
fn section_end(lines: &[String], heading: usize) -> usize {
    let mut fence = None;
    (heading + 1..lines.len())
        .find(|&index| heading_level(&lines[index], &mut fence) == Some(2))
        .unwrap_or(lines.len())
}

/// The `### ` heading named `name` (any case) between `heading` and `end`.
fn subsection(lines: &[String], heading: usize, end: usize, name: &str) -> Option<usize> {
    let mut fence = None;
    (heading + 1..end).find(|&index| {
        heading_level(&lines[index], &mut fence) == Some(3)
            && lines[index][4..].trim().eq_ignore_ascii_case(name)
    })
}

/// The index after the last line of the `### ` subsection at `start`, before `end`.
fn subsection_end(lines: &[String], start: usize, end: usize) -> usize {
    let mut fence = None;
    (start + 1..end)
        .find(|&index| heading_level(&lines[index], &mut fence).is_some())
        .unwrap_or(end)
}

/// Whether `lines` hold a list item other than the placeholder.
fn has_items(lines: &[String]) -> bool {
    lines.iter().any(|line| {
        let trimmed = line.trim_start();
        let item = ["- ", "* ", "+ "]
            .iter()
            .any(|bullet| trimmed.starts_with(bullet))
            || trimmed.split_once(['.', ')']).is_some_and(|(digits, _)| {
                !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
            });
        item && !trimmed.trim().eq_ignore_ascii_case(NONE)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ids::random_suffix;
    use std::path::PathBuf;

    const DAY: &str = "2026-10-31";

    const QUESTIONS: &str = "## Questions\n\nAppend-only.\n\n### Open\n\
        - [ ] Q-20261031-100000-aaaa · Which colour? → S-theme (blocking)\n\
        - [ ] Q-20261031-100001-bbbb · How wide?\n\n\
        ### Answered\n\
        - [x] Q-20261030-100000-cccc · How many? Two. (2026-10-30) → D-20261030-100000-cccc\n\n\
        ## Decisions\n\n### D-20261030-100000-cccc · Two\n- Context: c\n";

    fn answer(text: &str, id: &str, answer: &str) -> Result<String, String> {
        answer_in_text("spec.md", text, id, answer, DAY).map(|(text, _)| text)
    }

    #[test]
    fn the_answer_is_appended_before_the_links_and_the_entry_moves_to_the_top_of_answered() {
        let (text, at) = answer_in_text(
            "spec.md",
            QUESTIONS,
            "Q-20261031-100000-aaaa",
            " Blue,\n  mostly. ",
            DAY,
        )
        .unwrap();
        assert_eq!(
            text,
            "## Questions\n\nAppend-only.\n\n### Open\n\
            - [ ] Q-20261031-100001-bbbb · How wide?\n\n\
            ### Answered\n\
            - [x] Q-20261031-100000-aaaa · Which colour? Blue, mostly. (2026-10-31) → S-theme (blocking)\n\
            - [x] Q-20261030-100000-cccc · How many? Two. (2026-10-30) → D-20261030-100000-cccc\n\n\
            ## Decisions\n\n### D-20261030-100000-cccc · Two\n- Context: c\n"
        );
        assert_eq!(at.line, 9);
        let spec = parse_spec_text("spec.md", &text);
        let question = &spec.questions[1];
        assert!(question.answered);
        assert_eq!(question.answer.as_deref(), Some("Blue, mostly."));
        assert_eq!(question.nodes, vec!["S-theme"]);
        assert!(question.blocking);
    }

    #[test]
    fn an_emptied_open_list_gets_the_placeholder_and_a_placeholder_under_answered_goes() {
        let text = "## Questions\n\n### Open\n- [ ] Q-20261031-100000-aaaa · Why?\n\n### Answered\n- (none)\n";
        assert_eq!(
            answer(text, "Q-20261031-100000-aaaa", "Because.").unwrap(),
            "## Questions\n\n### Open\n- (none)\n\n### Answered\n\
            - [x] Q-20261031-100000-aaaa · Why? Because. (2026-10-31)\n"
        );
    }

    #[test]
    fn a_missing_answered_list_is_added_at_the_end_of_the_section() {
        let text = "## Questions\n\n### Open\n- [ ] Q-20261031-100000-aaaa · Why?\n\n## Glossary\n";
        assert_eq!(
            answer(text, "Q-20261031-100000-aaaa", "Because.").unwrap(),
            "## Questions\n\n### Open\n- (none)\n\n### Answered\n\
            - [x] Q-20261031-100000-aaaa · Why? Because. (2026-10-31)\n\n## Glossary\n"
        );
    }

    #[test]
    fn continuation_lines_keep_their_place() {
        let text = "## Questions\n\n### Open\n- [ ] Q-20261031-100000-aaaa · Why\n  this? → S-a\n- [ ] Q-20261031-100001-bbbb · And?\n\n### Answered\n";
        assert_eq!(
            answer(text, "Q-20261031-100000-aaaa", "So.").unwrap(),
            "## Questions\n\n### Open\n- [ ] Q-20261031-100001-bbbb · And?\n\n### Answered\n\
            - [x] Q-20261031-100000-aaaa · Why\n  this? So. (2026-10-31) → S-a\n"
        );
    }

    #[test]
    fn the_folder_form_file_and_crlf_line_ends_work() {
        let text = "## Questions\r\n\r\n### Open\r\n- [ ] Q-20261031-100000-aaaa · Why?\r\n\r\n### Answered\r\n- (none)\r\n";
        let (answered, at) = answer_in_text(
            "spec/questions.md",
            text,
            "Q-20261031-100000-aaaa",
            "So.",
            DAY,
        )
        .unwrap();
        assert_eq!(
            answered,
            "## Questions\r\n\r\n### Open\r\n- (none)\r\n\r\n### Answered\r\n\
            - [x] Q-20261031-100000-aaaa · Why? So. (2026-10-31)\r\n"
        );
        assert_eq!(at.file, "spec/questions.md");
        assert_eq!(at.line, 7);
    }

    #[test]
    fn unusable_answers_and_answered_or_unknown_questions_are_refused() {
        let open = "Q-20261031-100000-aaaa";
        assert_eq!(
            answer(QUESTIONS, open, "  \n "),
            Err("the answer is empty".into())
        );
        assert!(
            answer(QUESTIONS, open, "see → S-x")
                .unwrap_err()
                .contains('→')
        );
        assert_eq!(
            answer(QUESTIONS, "Q-20261030-100000-cccc", "Three."),
            Err("Q-20261030-100000-cccc is answered already".into())
        );
        assert_eq!(
            answer(QUESTIONS, "Q-20991231-000000-zzzz", "x"),
            Err("Q-20991231-000000-zzzz is not in spec.md".into())
        );
    }

    #[test]
    fn this_repository_spec_answers_without_violations() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let text = std::fs::read_to_string(root.join("docs/planning/spec.md")).unwrap();
        let open = text.replacen(
            "### Open\n- (none)\n",
            "### Open\n- [ ] Q-20261031-120000-test · Is this a test? → S-questions\n",
            1,
        );
        let answered = answer(&open, "Q-20261031-120000-test", "Yes.").unwrap();
        assert!(answered.contains(
            "### Open\n- (none)\n\n### Answered\n- [x] Q-20261031-120000-test · Is this a test? Yes. (2026-10-31) → S-questions\n- [x] Q-"
        ));
    }

    fn temp_repo(files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-questions-{}", random_suffix()));
        for (file, text) in files {
            let path = root.join("docs/planning").join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        root
    }

    #[test]
    fn answering_writes_the_file_holding_the_question_in_both_forms() {
        let config = Config::default();
        let root = temp_repo(&[("spec.md", QUESTIONS)]);
        let done = answer_question(&root, &config, "Q-20261031-100001-bbbb", "Wide.", DAY).unwrap();
        assert_eq!(done.at.file, "spec.md");
        let text = std::fs::read_to_string(root.join("docs/planning/spec.md")).unwrap();
        assert!(text.contains(
            "### Answered\n- [x] Q-20261031-100001-bbbb · How wide? Wide. (2026-10-31)\n"
        ));
        assert!(
            answer_question(&root, &config, "Q-20261031-100001-bbbb", "Again.", DAY)
                .unwrap_err()
                .contains("answered already")
        );
        std::fs::remove_dir_all(&root).unwrap();

        let root = temp_repo(&[
            ("spec/README.md", "# Spec\n"),
            (
                "spec/questions.md",
                QUESTIONS.split("## Decisions").next().unwrap(),
            ),
        ]);
        let done = answer_question(&root, &config, "Q-20261031-100000-aaaa", "Red.", DAY).unwrap();
        assert_eq!(done.at.file, "spec/questions.md");
        let text = std::fs::read_to_string(root.join("docs/planning/spec/questions.md")).unwrap();
        assert!(text.contains("### Answered\n- [x] Q-20261031-100000-aaaa · Which colour? Red. (2026-10-31) → S-theme (blocking)\n"));
        std::fs::remove_dir_all(&root).unwrap();
    }
}
