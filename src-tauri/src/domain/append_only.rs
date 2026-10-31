//! The append-only guard for Questions and Decisions (`S-decisions`, `R-append-only`).
//!
//! An edit of a spec file is checked by comparing the entries read from the text before and
//! after it with the spec parser, so the guard sees entries, not keystrokes: an entry may move
//! (an answered question goes from Open to Answered), and new entries may appear anywhere.
//! Allowed on an existing entry are only its marks:
//!
//! - a question gets answered: ticked, its answer and date appended to its text, links after
//!   the `→` added;
//! - an answered question gets more links after the `→`;
//! - a decision gets a `- Superseded by: D-...` line.
//!
//! Everything else that changes or removes an existing entry is a violation. The guard works
//! on one file at a time, `spec.md` or a file of the `spec/` folder, so it holds for both forms.

use std::path::{Component, Path};

use serde::Serialize;
use specta::Type;

use super::config::Config;
use super::spec::{
    Decision, DecisionField, Question, SPEC_FILE, SPEC_FOLDER, SourceLine, parse_spec_text,
};

/// The rule the guard enforces, for explanations.
pub const RULE: &str = "R-append-only";

/// An existing question or decision that an edit changed or removed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AppendOnlyViolation {
    /// The `Q-` or `D-` id; `None` for an entry without one.
    pub id: Option<String>,
    /// Where the entry was before the edit.
    pub at: SourceLine,
    /// The first line of the entry after the edit; `None` when it was removed.
    pub now: Option<u32>,
    /// What happened to the entry and what is allowed instead.
    pub message: String,
}

/// The spec file `path` is, relative to the planning root (`spec.md` or `spec/<name>.md`), or
/// `None` for any other file. Both forms count, whichever the config chooses.
pub fn spec_file_of(repo_root: &Path, config: &Config, path: &Path) -> Option<String> {
    let relative = path
        .strip_prefix(repo_root.join(&config.planning_root))
        .ok()?;
    let parts = relative
        .components()
        .map(|part| match part {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?;
    match parts.as_slice() {
        [name] if *name == SPEC_FILE => Some(SPEC_FILE.to_string()),
        [folder, name] if *folder == SPEC_FOLDER && name.ends_with(".md") => {
            Some(format!("{SPEC_FOLDER}/{name}"))
        }
        _ => None,
    }
}

/// The questions and decisions of the spec file `file` (relative to the planning root) that
/// going from `old` to `new` changes or removes. Empty when the edit is allowed. This is the
/// one check for every writer of the spec: the editor and the Questions form.
pub fn append_only_violations(file: &str, old: &str, new: &str) -> Vec<AppendOnlyViolation> {
    if old == new {
        return Vec::new();
    }
    let before = parse_spec_text(file, old);
    let after = parse_spec_text(file, new);
    let mut violations = Vec::new();

    for question in &before.questions {
        let candidates = after
            .questions
            .iter()
            .filter(|other| match &question.id {
                Some(id) => other.id.as_ref() == Some(id),
                None => other.id.is_none() && same_text(&other.text, &question.text),
            })
            .collect::<Vec<_>>();
        if let Some(violation) = check(
            question.id.as_deref(),
            &question.at,
            "question",
            &candidates,
            |other| question_change(question, other),
            |other| other.at.line,
        ) {
            violations.push(violation);
        }
    }

    for decision in &before.decisions {
        let candidates = after
            .decisions
            .iter()
            .filter(|other| match &decision.id {
                Some(id) => other.id.as_ref() == Some(id),
                None => other.id.is_none() && same_text(&other.title, &decision.title),
            })
            .collect::<Vec<_>>();
        if let Some(violation) = check(
            decision.id.as_deref(),
            &decision.at,
            "decision",
            &candidates,
            |other| decision_change(decision, other),
            |other| other.at.line,
        ) {
            violations.push(violation);
        }
    }
    violations
}

/// The violation for one existing entry, given the entries of the new text that match it: none
/// when one of them is an allowed change of it.
fn check<T>(
    id: Option<&str>,
    at: &SourceLine,
    what: &str,
    candidates: &[&T],
    change: impl Fn(&T) -> Result<(), String>,
    line: impl Fn(&T) -> u32,
) -> Option<AppendOnlyViolation> {
    let name = id.map_or_else(|| format!("The {what} at line {}", at.line), str::to_string);
    let Some(first) = candidates.first() else {
        return Some(AppendOnlyViolation {
            id: id.map(str::to_string),
            at: at.clone(),
            now: None,
            message: format!("{name} was removed; {what}s are never removed"),
        });
    };
    if candidates.iter().any(|candidate| change(candidate).is_ok()) {
        return None;
    }
    let reason = change(first).expect_err("no candidate is allowed");
    Some(AppendOnlyViolation {
        id: id.map(str::to_string),
        at: at.clone(),
        now: Some(line(first)),
        message: format!("{name}: {reason}"),
    })
}

/// Whether `new` is `old` with nothing changed but its marks; otherwise why not.
fn question_change(old: &Question, new: &Question) -> Result<(), String> {
    if old.answered && !new.answered {
        return Err("an answered question cannot be reopened".into());
    }
    if old.answered {
        if !same_text(&new.text, &old.text) {
            return Err("the text of an answered question cannot be changed".into());
        }
    } else if !starts_with_words(&new.text, &old.text) {
        return Err("the question was changed; only an answer can be appended".into());
    }
    let links_kept = old.nodes.iter().all(|node| new.nodes.contains(node))
        && (old.decision.is_none() || new.decision == old.decision)
        && (!old.blocking || new.blocking);
    if !links_kept {
        return Err("links after the `→` can only be added".into());
    }
    Ok(())
}

/// Whether `new` is `old` with nothing added but `Superseded by` lines; otherwise why not.
fn decision_change(old: &Decision, new: &Decision) -> Result<(), String> {
    if !same_text(&new.title, &old.title) {
        return Err("the title was changed; only a `Superseded by` line can be added".into());
    }
    let mut remaining = old.fields.iter().peekable();
    for field in &new.fields {
        if remaining.peek().is_some_and(|old| same_field(old, field)) {
            remaining.next();
        } else if !field.label.eq_ignore_ascii_case("superseded by") {
            return Err(
                "a line was changed or added; only a `Superseded by` line can be added".into(),
            );
        }
    }
    if remaining.next().is_some() {
        return Err(
            "a line was changed or removed; only a `Superseded by` line can be added".into(),
        );
    }
    Ok(())
}

fn same_field(old: &DecisionField, new: &DecisionField) -> bool {
    old.label == new.label && same_text(&old.text, &new.text)
}

/// Equal up to whitespace: rewrapping lines or indenting them is not a change.
fn same_text(a: &str, b: &str) -> bool {
    a.split_whitespace().eq(b.split_whitespace())
}

/// Whether the words of `text` begin with the words of `prefix`, the last one included as a
/// whole word: text was appended, not changed.
fn starts_with_words(text: &str, prefix: &str) -> bool {
    let mut words = text.split_whitespace();
    prefix
        .split_whitespace()
        .all(|word| words.next() == Some(word))
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUESTIONS: &str = "## Questions\n\nAppend-only.\n\n### Open\n- [ ] Q-20261031-100000-aaaa · Which colour? → S-theme (blocking)\n\n### Answered\n- [x] Q-20261030-100000-bbbb · How many? Two. (2026-10-30) → D-20261030-100000-cccc\n";

    const DECISIONS: &str = "## Decisions\n\nAppend-only.\n\n### D-20261030-100000-cccc · Two of them\n- Context: we needed some.\n- Decision: two,\n  not three.\n- Rejected: three.\n";

    fn messages(file: &str, old: &str, new: &str) -> Vec<String> {
        append_only_violations(file, old, new)
            .into_iter()
            .map(|violation| violation.message)
            .collect()
    }

    fn allowed(file: &str, old: &str, new: &str) {
        assert_eq!(messages(file, old, new), Vec::<String>::new());
    }

    #[test]
    fn spec_files_are_found_in_both_forms() {
        let config = Config::default();
        let root = Path::new("/repo");
        let planning = root.join(&config.planning_root);
        assert_eq!(
            spec_file_of(root, &config, &planning.join("spec.md")).as_deref(),
            Some("spec.md")
        );
        assert_eq!(
            spec_file_of(root, &config, &planning.join("spec/questions.md")).as_deref(),
            Some("spec/questions.md")
        );
        assert_eq!(
            spec_file_of(root, &config, &planning.join("next/x.md")),
            None
        );
        assert_eq!(
            spec_file_of(root, &config, &planning.join("spec/a/b.md")),
            None
        );
        assert_eq!(
            spec_file_of(root, &config, Path::new("/elsewhere/spec.md")),
            None
        );
    }

    #[test]
    fn new_entries_are_allowed() {
        let new = QUESTIONS.replace(
            "### Answered",
            "- [ ] Q-20261031-110000-dddd · Another? → S-x\n\n### Answered",
        );
        allowed("spec/questions.md", QUESTIONS, &new);
        let new = format!(
            "{DECISIONS}\n### D-20261031-110000-eeee · Three after all\n- Context: more.\n"
        );
        allowed("spec/decisions.md", DECISIONS, &new);
        // Text outside the entries is free.
        allowed(
            "spec/questions.md",
            QUESTIONS,
            &QUESTIONS.replace("Append-only.", "Append-only. Ids: `Q-...`."),
        );
    }

    #[test]
    fn answering_moves_and_ticks_a_question() {
        let new = "## Questions\n\nAppend-only.\n\n### Open\n- (none)\n\n### Answered\n- [x] Q-20261031-100000-aaaa · Which colour? Blue. (2026-10-31) → S-theme (blocking) D-20261031-120000-ffff\n- [x] Q-20261030-100000-bbbb · How many? Two. (2026-10-30) → D-20261030-100000-cccc\n";
        let violations = append_only_violations("spec/questions.md", QUESTIONS, new);
        // `- (none)` is a new entry without an id, which the parser reports; the guard does not.
        assert_eq!(violations, []);
    }

    #[test]
    fn changing_or_removing_a_question_is_refused() {
        let changed = QUESTIONS.replace("Which colour?", "Which colours?");
        assert_eq!(
            messages("spec/questions.md", QUESTIONS, &changed),
            ["Q-20261031-100000-aaaa: the question was changed; only an answer can be appended"]
        );
        let answer_changed = QUESTIONS.replace("Two.", "Three.");
        assert_eq!(
            messages("spec/questions.md", QUESTIONS, &answer_changed),
            ["Q-20261030-100000-bbbb: the text of an answered question cannot be changed"]
        );
        let reopened = QUESTIONS.replace("- [x] Q-20261030", "- [ ] Q-20261030");
        assert_eq!(
            messages("spec/questions.md", QUESTIONS, &reopened),
            ["Q-20261030-100000-bbbb: an answered question cannot be reopened"]
        );
        let unlinked = QUESTIONS.replace(" → S-theme (blocking)", " → S-theme");
        assert_eq!(
            messages("spec/questions.md", QUESTIONS, &unlinked),
            ["Q-20261031-100000-aaaa: links after the `→` can only be added"]
        );
        let removed = QUESTIONS.replace(
            "- [ ] Q-20261031-100000-aaaa · Which colour? → S-theme (blocking)\n",
            "",
        );
        let violations = append_only_violations("spec/questions.md", QUESTIONS, &removed);
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].id.as_deref(), Some("Q-20261031-100000-aaaa"));
        assert_eq!(violations[0].at.line, 6);
        assert_eq!(violations[0].now, None);
        assert_eq!(
            violations[0].message,
            "Q-20261031-100000-aaaa was removed; questions are never removed"
        );
    }

    #[test]
    fn superseding_a_decision_is_allowed() {
        let new = format!("{DECISIONS}- Superseded by: D-20261031-110000-eeee\n");
        allowed("spec/decisions.md", DECISIONS, &new);
        // Rewrapped lines are the same text.
        allowed(
            "spec/decisions.md",
            DECISIONS,
            &DECISIONS.replace("two,\n  not three.", "two, not three."),
        );
    }

    #[test]
    fn changing_or_removing_a_decision_is_refused() {
        let edited = DECISIONS.replace("not three.", "maybe three.");
        let violations = append_only_violations("spec/decisions.md", DECISIONS, &edited);
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].now, Some(5));
        assert_eq!(
            violations[0].message,
            "D-20261030-100000-cccc: a line was changed or added; only a `Superseded by` line can be added"
        );
        let added = DECISIONS.replace("- Rejected", "- Consequences: none.\n- Rejected");
        assert_eq!(messages("spec/decisions.md", DECISIONS, &added).len(), 1);
        let dropped = DECISIONS.replace("- Rejected: three.\n", "");
        assert_eq!(
            messages("spec/decisions.md", DECISIONS, &dropped),
            [
                "D-20261030-100000-cccc: a line was changed or removed; only a `Superseded by` line can be added"
            ]
        );
        let retitled = DECISIONS.replace("Two of them", "Two");
        assert_eq!(messages("spec/decisions.md", DECISIONS, &retitled).len(), 1);
        assert_eq!(
            messages("spec/decisions.md", DECISIONS, "## Decisions\n"),
            ["D-20261030-100000-cccc was removed; decisions are never removed"]
        );
    }

    #[test]
    fn the_single_file_form_is_guarded_too() {
        let old = format!("# Spec\n\n{QUESTIONS}\n{DECISIONS}");
        allowed(
            SPEC_FILE,
            &old,
            &old.replace("## Questions", "Intro.\n\n## Questions"),
        );
        // Renaming the section heading removes every entry in it.
        let renamed = old.replace("## Decisions", "## Choices");
        assert_eq!(
            messages(SPEC_FILE, &old, &renamed),
            ["D-20261030-100000-cccc was removed; decisions are never removed"]
        );
    }

    #[test]
    fn other_spec_parts_are_not_guarded() {
        let old = "## Structure\n- A `S-a`\n  - does a.\n";
        allowed("spec/structure.md", old, "## Structure\n");
    }

    #[test]
    fn this_repository_spec_can_be_superseded_but_not_edited() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("docs/planning/spec.md");
        let old = std::fs::read_to_string(path).unwrap();
        let heading = "### D-20261031-010817-m4pq · The mind map shows the Structure only\n";
        assert!(old.contains(heading));
        let superseded = old.replace(
            "- Consequences: task 20261031-005409-sqhn builds `S-mindmap` as written.\n",
            "- Consequences: task 20261031-005409-sqhn builds `S-mindmap` as written.\n- Superseded by: D-20261101-000000-zzzz\n",
        );
        assert_ne!(superseded, old);
        allowed(SPEC_FILE, &old, &superseded);
        let edited = old.replace(heading, "### D-20261031-010817-m4pq · The mind map\n");
        assert_eq!(messages(SPEC_FILE, &old, &edited).len(), 1);
    }
}
