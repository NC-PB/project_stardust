---
id: 20261031-034624-p3vc
title: Doctor reports an unknown parent id
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-subtasks]
depends_on: [20261031-034053-u7dq]
completed: 2026-10-31
---

## Description
The doctor reports `depends_on` ids that no task file carries (task [20261031-034053-u7dq](../done/20261031-034053-u7dq-doctor-reports-unknown-dependency-ids.md), D-20261031-034606-n8vb in the [spec](../spec.md)). A `parent` that names no task file, or the task itself, is the same kind of planning error: the child counts for no parent card. The doctor could report it at the line of `parent`, without a fix, with the same known ids (columns and archive, not checked when a folder could not be read). Which kind it is (`DependencyError` or a new one) needs a decision.

## Acceptance criteria
- [x] The doctor reports a `parent` id that no task file in the columns or the archive carries, with file and line
- [x] The doctor reports a `parent` that is the task's own id
- [x] The phase 3 exit test still has no findings

## Implementation notes
- Spec and code agree on `parent`: `task.rs` reads it as an optional task id (an invalid id is a frontmatter issue), `cardsOf` in `src/lib/board.ts` counts children by it (`S-subtasks`). No proposal needed.
- Done: new kind `ParentError` after `DependencyError` in `src-tauri/src/domain/doctor.rs` (`parent_error`), bindings regenerated, labels in `src/lib/doctor.ts` and `src/lib/stale-view.ts` with tests; tests `a_parent_on_itself_or_unknown_is_reported_without_a_fix`, a parent error in `reports_every_kind_with_file_and_line`, parents in the phase 3 exit test.
- Open: nothing. Found on the way: the board counts a self parent as the card's own sub-task (inbox task [20261031-035143-3197](../inbox/20261031-035143-3197-a-parent-on-itself-is-no-sub-task.md)).

## Result
The doctor reports a `parent` that is the task's own id, or that no task file carries in the columns or the archive's month folders (the filename id, else the frontmatter id), as a new finding kind `ParentError` ("Parent errors" in the panel, "Parent error" in the Stale view), one finding per task at the line of `parent`, without a fix (D-20261031-035143-pr9u). Unknown parents are not checked when a column or month folder could not be read; a self parent always is. An invalid `parent` value stays a frontmatter error only.

Tests: a dedicated Rust test (parents in a column, in the archive and by a mismatched file's filename id are known; a mismatched frontmatter id is not; an unreadable folder leaves only the self parent), a parent error in the every-kind test, and the phase 3 exit test now makes every odd generated task the child of the one before and still has no findings. TS tests for the panel heading and the Stale view entry. `npm run check`, `cargo test` and `cargo clippy --all-targets` pass.

Not tried in the running app: the new group in the doctor panel and the Stale view's Broken group were checked by unit tests only.
