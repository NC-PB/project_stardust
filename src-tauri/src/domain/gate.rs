//! The gate (`S-gate`): whether the spec is clear enough to generate tasks.
//!
//! Evaluated over the spec model with the checks the `gate` keys of the config turn on. Every
//! failing item carries the file and line it concerns, so the app can open it. Read only.
//!
//! Which nodes count (D-20261031-011731-g8te): a top-level node without checkbox is a domain
//! area and is not checked itself, its children are; a node tagged `#later` is skipped with its
//! whole subtree. A question is blocking when it says `(blocking)` or a node links it as its
//! blocking question.

use std::collections::HashSet;

use serde::Serialize;
use specta::Type;

use super::config::GateConfig;
use super::spec::{Node, SourceLine, Spec};

/// The gate of a spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GateStatus {
    /// The spec exists and no enabled check fails.
    pub met: bool,
    /// Every failing item of the enabled checks, in spec order per check.
    pub failures: Vec<GateFailure>,
}

/// One item that keeps the gate closed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GateFailure {
    pub kind: GateFailureKind,
    /// The `Q-`, `S-` or `R-` id of the item, when it has one.
    pub id: Option<String>,
    /// What fails, for the user.
    pub message: String,
    /// Where the item is: the question, node or rule line.
    pub at: SourceLine,
}

/// The check an item fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum GateFailureKind {
    /// An open question that blocks (`gate.no_open_blocking_questions`).
    OpenBlockingQuestion,
    /// A node that is not ticked (`gate.nodes_ticked_and_specified`).
    NodeNotTicked,
    /// A node without criteria (`gate.nodes_ticked_and_specified`).
    NodeWithoutCriteria,
    /// A rule no node references (`gate.rules_referenced`).
    RuleNotReferenced,
}

/// The gate of `spec` with the checks `gate` turns on. A spec that was not found never meets
/// the gate and has no failing items.
pub fn gate_status(spec: &Spec, gate: &GateConfig) -> GateStatus {
    let mut failures = Vec::new();
    if gate.no_open_blocking_questions {
        open_blocking_questions(spec, &mut failures);
    }
    if gate.nodes_ticked_and_specified {
        for node in &spec.structure {
            // A top-level node without checkbox is a domain area: it holds nodes, not criteria.
            if node.ticked.is_none() {
                if !node.later {
                    for child in &node.children {
                        unspecified_nodes(child, &mut failures);
                    }
                }
            } else {
                unspecified_nodes(node, &mut failures);
            }
        }
    }
    if gate.rules_referenced {
        unreferenced_rules(spec, &mut failures);
    }
    GateStatus {
        met: spec.found && failures.is_empty(),
        failures,
    }
}

fn open_blocking_questions(spec: &Spec, failures: &mut Vec<GateFailure>) {
    let mut linked = HashSet::new();
    walk(&spec.structure, &mut |node| {
        if let Some(id) = &node.blocking_question {
            linked.insert(id.as_str());
        }
    });
    for question in &spec.questions {
        let blocking =
            question.blocking || question.id.as_deref().is_some_and(|id| linked.contains(id));
        if blocking && !question.answered {
            failures.push(GateFailure {
                kind: GateFailureKind::OpenBlockingQuestion,
                id: question.id.clone(),
                message: format!("Open blocking question: {}", question.question.trim()),
                at: question.at.clone(),
            });
        }
    }
}

/// `node` and its children, unless tagged `#later`.
fn unspecified_nodes(node: &Node, failures: &mut Vec<GateFailure>) {
    if node.later {
        return;
    }
    let name = node_name(node);
    if node.ticked != Some(true) {
        failures.push(GateFailure {
            kind: GateFailureKind::NodeNotTicked,
            id: node.id.clone(),
            message: format!("Not ticked: {name}"),
            at: node.at.clone(),
        });
    }
    if node.criteria.is_empty() {
        failures.push(GateFailure {
            kind: GateFailureKind::NodeWithoutCriteria,
            id: node.id.clone(),
            message: format!("No criteria: {name}"),
            at: node.at.clone(),
        });
    }
    for child in &node.children {
        unspecified_nodes(child, failures);
    }
}

fn unreferenced_rules(spec: &Spec, failures: &mut Vec<GateFailure>) {
    let mut referenced = HashSet::new();
    walk(&spec.structure, &mut |node| {
        referenced.extend(node.rules.iter().map(String::as_str));
    });
    for rule in &spec.domain.rules {
        // A rule without id cannot be referenced; the spec reports it already.
        let Some(id) = &rule.id else { continue };
        if !referenced.contains(id.as_str()) {
            failures.push(GateFailure {
                kind: GateFailureKind::RuleNotReferenced,
                id: Some(id.clone()),
                message: format!("No node references {id}"),
                at: rule.at.clone(),
            });
        }
    }
}

fn walk<'s>(nodes: &'s [Node], visit: &mut impl FnMut(&'s Node)) {
    for node in nodes {
        visit(node);
        walk(&node.children, visit);
    }
}

/// The title with the id, as the node is named in a message.
fn node_name(node: &Node) -> String {
    match &node.id {
        Some(id) if node.title.is_empty() => id.clone(),
        Some(id) => format!("{} {id}", node.title),
        None => node.title.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::domain::config::load_config;
    use crate::domain::spec::{SPEC_FILE, parse_spec_text, read_spec};

    const ALL: GateConfig = GateConfig {
        no_open_blocking_questions: true,
        nodes_ticked_and_specified: true,
        rules_referenced: true,
    };

    const SPEC: &str = "\
## Domain

### Areas
- Planning (core): tasks

### Rules
- `R-used` · Used.
- `R-unused` · Unused.

## Structure

- Planning `S-planning`
  - [x] Done `S-done`
    - Works (`R-used`).
  - [ ] Open `S-open` Q-20261031-000000-bbbb
    - Criterion.
  - [x] Empty `S-empty`
  - [ ] Later `S-later` #later
    - [ ] Child `S-later-child`
  - [x] Parent `S-parent`
    - Criterion.
    - [ ] Child `S-child`
      - Criterion.

## Questions

### Open
- [ ] Q-20261031-000000-aaaa · Blocking? → S-done (blocking)
- [ ] Q-20261031-000000-bbbb · Linked? → S-open
- [ ] Q-20261031-000000-cccc · Not blocking? → S-done

### Answered
- [x] Q-20261031-000000-dddd · Was blocking? Yes. (2026-10-31) → S-done (blocking)
";

    fn summary(status: &GateStatus) -> Vec<(GateFailureKind, &str, u32)> {
        status
            .failures
            .iter()
            .map(|failure| {
                (
                    failure.kind,
                    failure.id.as_deref().unwrap_or(""),
                    failure.at.line,
                )
            })
            .collect()
    }

    #[test]
    fn lists_every_failing_item_with_its_line() {
        let spec = parse_spec_text(SPEC_FILE, SPEC);
        // Only the sections left out of the example are reported.
        assert!(spec.issues.iter().all(|issue| issue.line.is_none()));
        let status = gate_status(&spec, &ALL);
        assert!(!status.met);
        use GateFailureKind::*;
        assert_eq!(
            summary(&status),
            [
                (OpenBlockingQuestion, "Q-20261031-000000-aaaa", 28),
                (OpenBlockingQuestion, "Q-20261031-000000-bbbb", 29),
                (NodeNotTicked, "S-open", 15),
                (NodeWithoutCriteria, "S-empty", 17),
                (NodeNotTicked, "S-child", 22),
                (RuleNotReferenced, "R-unused", 8),
            ]
        );
        assert_eq!(status.failures[0].at.file, "spec.md");
        assert_eq!(status.failures[3].message, "No criteria: Empty S-empty");
        assert_eq!(status.failures[5].message, "No node references R-unused");
    }

    #[test]
    fn disabled_checks_are_skipped() {
        let spec = parse_spec_text(SPEC_FILE, SPEC);
        let only_rules = GateConfig {
            no_open_blocking_questions: false,
            nodes_ticked_and_specified: false,
            rules_referenced: true,
        };
        let kinds: Vec<_> = gate_status(&spec, &only_rules)
            .failures
            .iter()
            .map(|failure| failure.kind)
            .collect();
        assert_eq!(kinds, [GateFailureKind::RuleNotReferenced]);
        let none = GateConfig {
            rules_referenced: false,
            ..only_rules
        };
        assert_eq!(
            gate_status(&spec, &none),
            GateStatus {
                met: true,
                failures: vec![]
            }
        );
    }

    #[test]
    fn met_when_every_check_passes() {
        let spec = parse_spec_text(
            SPEC_FILE,
            "\
## Domain

### Rules
- `R-used` · Used.

## Structure

- Planning `S-planning`
  - [x] Done `S-done`
    - Works (`R-used`).
  - [ ] Someday `S-someday` #later

## Questions

### Open
- [ ] Q-20261031-000000-aaaa · Not blocking? → S-done
",
        );
        assert!(gate_status(&spec, &ALL).met);
    }

    #[test]
    fn a_top_level_node_with_checkbox_is_checked() {
        let spec = parse_spec_text(SPEC_FILE, "## Structure\n\n- [ ] Planning `S-planning`\n");
        let kinds: Vec<_> = gate_status(&spec, &ALL)
            .failures
            .iter()
            .map(|failure| failure.kind)
            .collect();
        assert_eq!(
            kinds,
            [
                GateFailureKind::NodeNotTicked,
                GateFailureKind::NodeWithoutCriteria
            ]
        );
    }

    #[test]
    fn a_missing_spec_never_meets_the_gate() {
        let dir = std::env::temp_dir().join(format!("gate-missing-{}", std::process::id()));
        let spec = read_spec(&dir, &crate::domain::config::Config::default());
        assert!(!spec.found);
        let status = gate_status(&spec, &ALL);
        assert!(!status.met);
        assert_eq!(status.failures, []);
    }

    /// This repository's own spec meets the gate: every node outside `#later` is ticked and has
    /// criteria, no question is open, every rule is named by a node.
    #[test]
    fn this_repository_spec() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let config = load_config(repo_root).config;
        let status = gate_status(&read_spec(repo_root, &config), &config.gate);
        let failing: Vec<_> = status
            .failures
            .iter()
            .map(|failure| (failure.kind, failure.id.as_deref().unwrap_or("")))
            .collect();
        assert_eq!(failing, []);
        assert!(status.met);
    }
}
