---
id: 20261031-005358-alo6
title: "Spec model: parse spec.md and the spec folder"
tags: [ideation]
created: 2026-10-31
completed: 2026-10-31
implements: [S-spec-file, S-nodes]
depends_on: []
---

## Description
Rust domain module that reads the spec into a typed model. Everything else in phase 2 builds on it. Read only; editing comes with the tasks that need it.

Implements `S-spec-file`, `S-nodes` in the [spec](../spec.md).

## Acceptance criteria
- [x] Reads `spec.md`, or the `spec/` folder when it exists, following `spec` in the config; both give the same model
- [x] Sections: Vision, Scope, Constraints, Domain (areas, entities, rules, workflows), Structure, Questions, Decisions, Glossary
- [x] Structure nodes with id, tick state, criteria, link to a blocking question, `#later`, children; domain areas are the top level
- [x] Rules with id and text; questions with id, text, open or answered, blocking flag, linked node and decision; decisions with id, title and fields; glossary terms
- [x] Malformed parts are reported with line numbers, never dropped
- [x] The model is available in TypeScript through the generated bindings
- [x] Tests parse this repository's own `spec.md` and `templates/spec.md` without errors

## Implementation notes
- Done: `src-tauri/src/domain/spec.rs` with the model, `read_spec`, `parse_spec_text`, `spec_form`, `FOLDER_FILES`; commands `read_spec(repo_root)` and `parse_spec_text(file, text)` registered in `lib.rs`; `agents_block::spec_location` uses `spec_form`.
- The folder layout and the node/criterion rule are in D-20261031-010617-ryfp and the `S-spec-file` / `S-nodes` criteria.
- Tests: this repository's `spec.md` and the built in `templates/spec.md` read without issues; `spec.md` cut into the folder form gives the same model apart from file and line; malformed input gives issues with lines and keeps the parts.

## Result
The spec is read into one typed model, from `spec.md` or the `spec/` folder as `spec` in the config chooses; both forms give the same model. It holds the frontmatter of each file, all sections, scope, constraints, domain (areas with kind, entities, rules, workflows), the Structure as a node tree (id, title, tick state, `#later`, blocking question, criteria, referenced rules, children), questions (answered, question and answer, date, blocking, linked nodes and decision), decisions with labelled fields and "Superseded by" ids, and the glossary. Every part carries file and line; sections, nodes, questions and decisions also their last line. Reading never fails: everything that does not fit is an issue with file and line, and is kept where it could be read. Available in TypeScript as `commands.readSpec(repoRoot)` and `commands.parseSpecText(file, text)`, type `Spec`.

- The folder layout is `spec/README.md` plus one file per section (`vision.md` ... `glossary.md`); the split task writes exactly that.
- A criterion whose first line ends with a node id in inline code reads as a child node; none in this repository's spec does.
- Not used by any view yet.

### Next session
- The phase 2 inbox tasks that depend on this one can start: spec view, append-only guard, questions form, fog meter, gate status, traceability, proposals, glossary hover, session panel, split spec. Triage moves them to `next/`.
