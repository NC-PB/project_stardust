---
id: 20261031-021018-wsw3
title: Archive finished tasks by month
tags: [planning]
created: 2026-10-31
implements: [S-archive]
depends_on: [20261031-021013-ihmk]
completed: 2026-10-31
---

## Description
Phase 3. 

Implements `S-archive` in the [spec](../spec.md).

## Acceptance criteria
- [x] Moves terminal tasks older than the current month into `done/YYYY-MM/`, by their `completed` date
- [x] Shows the list first; moves only after confirmation
- [x] Links to archived tasks keep working
- [x] Archived tasks stay searchable and count for id uniqueness

## Implementation notes
- Checked against the code: board, session panel, trace and changelog read only the files directly in the terminal column (`read_column`); search, id uniqueness and the watcher walk the planning root recursively. Moves seen in one watcher batch get their links rewritten (`links::rewrite_after_moves`).
- Done: `src-tauri/src/domain/archive.rs` (`plan_archive`, `archive`) with tests, commands `plan_archive` and `archive_tasks`, `src/stores/archive-store.ts`, `src/lib/archive.ts`, `src/components/archive.tsx`, an Archive button and panel in the project bar.
- The archive only renames; links come from the watcher (D-20261031-023039-a9u7). A test starts the real watcher with the same callback as `watch_project` and archives 150 tasks linking to each other, to the spec and to an open task; it passed five runs in a row.
- Archived tasks are not cards (D-20261031-030552-k3qa). Trace and changelog losing them is follow-up work: [inbox task](../done/20261031-030611-fac5-trace-and-changelog-read-the-archive.md).
- The archive was not run on this repository's own planning folder.

## Result
An "Archive" button in the project bar previews the tasks of the terminal column finished before the current month, grouped by `done/YYYY-MM/` folder, with the count of tasks that stay and the tasks left in place with their reason (no `completed`, invalid date, name taken in the month folder). "Move n tasks" moves exactly the previewed files, creating the month folders; it is refused when the column changed since the preview, and never writes over a file. The watcher then rewrites the links to and in the moved files. Archived tasks leave the board, stay searchable and keep their ids taken.
- `npm run check` passes (tsc, biome, 302 tests); `cargo test` (223 passed, 1 ignored) and `cargo clippy --all-targets` are clean.
- Tested in Rust: planning by month with all skip reasons, the moves and unchanged text, refusal after a change, blockers, and the end-to-end run with the real watcher (links, search, ids) for 150 tasks.
- Not tried in the running app: the panel layout, the board reloading after the batch, and the link report in the project panel were not checked by hand. A very large archive (thousands of files) that outlasts the watcher's one second batch limit was not tried; a rename split across batches would leave its links broken until repair by id.
- Trace and the changelog no longer see archived tasks: inbox task 20261031-030611-fac5.
