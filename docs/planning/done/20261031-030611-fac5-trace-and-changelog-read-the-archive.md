---
id: 20261031-030611-fac5
title: Trace and changelog read the archive
tags: [planning]
created: 2026-10-31
implements: [S-trace, S-changelog]
depends_on: [20261031-021018-wsw3]
completed: 2026-10-31
---

## Description
Found while archiving finished tasks ([task](../done/20261031-021018-wsw3-archive-finished-tasks-by-month.md)). Trace and the changelog read the terminal column with `read_column`, which lists only the files directly in the folder, so tasks moved into `done/YYYY-MM/` drop out of both (D-20261031-030552-k3qa):
- Trace: a ticked node implemented only by archived tasks is listed as a ticked node without any task, and its row in the spec view no longer names those tasks.
- Changelog: a draft since a date or tag before the current month misses the archived entries.

The board should keep not showing archived tasks.

## Acceptance criteria
- [x] Trace counts tasks in the archive month folders as implementing their nodes, and lists them under the node with their column
- [x] The changelog draft includes archived tasks finished in the range, linked at their archive path
- [x] The board, the column count and the session panel stay as they are

## Implementation notes
- Done: `read_archive(dir)` in `src-tauri/src/domain/archive.rs` (`ArchivedTask { month, task }`) reads the task files of the month folders `YYYY-MM/` directly in the terminal column folder; other folders are not the archive. Command `read_archive(dir)`.
- Done: `draft_changelog` reads the column and its archive; entries of archived tasks link to `<planning root>/<terminal>/YYYY-MM/<file>`, skipped archived files are listed as `YYYY-MM/<file>`.
- Done: the board store reads the archive beside the terminal column on load and whenever a batch touches the terminal column, into `archived`, which nothing on the board renders. `buildTrace` takes it as an optional fourth argument; archived tasks follow the terminal column's own tasks, carry their `month`, and open at their archive path from the spec view.
- Session panel left as it is (criterion 3): its last finished task still comes from the files directly in the terminal column.

## Result
Trace and the changelog draft now see archived tasks. Rust: `archive::read_archive` and the `read_archive` command; `changelog::draft_changelog` includes archived tasks linked at their archive path. Frontend: `useBoardStore.archived` (read on load and after batches touching the terminal column, never rendered or counted), `buildTrace(columns, structure, terminal, archived)`, `TracedTask.month`, `tracedTaskFile`, `tracedTaskPath`; the spec view's task chips open archived files at their month folder path. Tests: `cargo test` (new `reads_tasks_of_the_month_folders_only`, `includes_archived_tasks_linked_at_their_archive_path`), `src/lib/trace.test.ts`, `src/stores/board-store.test.ts`; `npm run check`, `cargo clippy --all-targets` clean.

Not tried in the running app: the spec view rows and Trace panel with archived tasks, opening an archived task from a chip, and a changelog draft over archived tasks were checked only by tests, not by clicking through the app. The session panel still shows no last finished task when nothing was finished this month and everything earlier is archived (as D-20261031-030552-k3qa describes); the criterion asked to leave it as it is.
