---
id: 20261031-032504-k7mz
title: Task reader reports a missing frontmatter id
tags: [files]
created: 2026-10-31
completed: 2026-10-31
implements: [S-task-format]
depends_on: [20261031-021017-7vyg]
---

## Description
`S-task-format` lists `id` as a required frontmatter field and says missing required fields are issues, but `src-tauri/src/domain/task.rs` reads `id` as optional: a task file whose filename carries an id and whose frontmatter has no `id` gets no issue. The doctor (task [20261031-021017-7vyg](20261031-021017-7vyg-doctor-check.md)) works around it with its own check. Decide whether the reader reports it (the editor's issue list and the card would show it) or the spec relaxes the rule, and remove the doctor's own check if the reader reports it.

Implements `S-task-format` in the [spec](../spec.md).

## Acceptance criteria
- [x] A task file without frontmatter `id` gets an issue for `id` from the reader, or `S-task-format` no longer calls `id` required
- [x] The doctor reports a missing frontmatter `id` once, with its fix

## Implementation notes
- Done: the reader reads `id` as required (`src-tauri/src/domain/task.rs`, `task::MISSING_FIELD`); the doctor's own check is gone and the reader's `id` issue becomes the `MissingId` finding (`src-tauri/src/domain/doctor.rs`, `id_and_frontmatter`); `Finding` unchanged.
- Consumers of task issues checked: only the editor's issue list (`src/components/editor.tsx`) shows them; board cards, search, trace, session, staleness and init do not read them. `archive.rs` reads only `completed` and file issues; the doctor's untraced check skips only whole-file issues. Every task file in this repository has a frontmatter `id`, so nothing new shows here.
- Open: none.

## Result
The task reader now reports a missing or empty frontmatter `id` as an issue for `id`, like `title` and `created`, also when the filename carries the id; the editor's issue list shows it. The doctor no longer checks for it itself: it turns the reader's issue into one `MissingId` finding with the `SetId` fix, line of the `id` field or 1. A file whose frontmatter was not read as a whole gets the finding without a fix; a file without a filename id gets only its filename finding, whose rename writes the id. New behaviour: an `id:` line without a value is now reported and fixable (before, the doctor saw the line and reported nothing). Tests: `a_missing_or_empty_frontmatter_id_is_reported` (task.rs), `reports_a_missing_frontmatter_id_once_from_the_reader` (doctor.rs, including applying the fix and checking again); `cargo test`, `cargo clippy --all-targets` and `npm run check` pass. Not tried in the running app: the editor's issue list and the doctor panel for such a file. Criteria of `S-task-format` updated, and the two `S-doctor` criteria on missing ids and their fix, which this change touches. Decision D-20261031-033239-0g9i.
