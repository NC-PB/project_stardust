---
id: 20261030-220012-ff26
title: Reload and conflict handling
tags: [files]
created: 2026-10-30
completed: 2026-10-30
implements: [S-conflicts]
depends_on: [20261030-220007-e420, 20261030-220011-a93f]
---

## Description
Implements `S-conflicts` in the [spec](../spec.md).

## Acceptance criteria
- [x] An open file without unsaved edits reloads silently when it changes on disk
- [x] An open file with unsaved edits keeps the user's version and shows "changed on disk" with a reload button
- [x] No typed text is ever lost

## Implementation notes
- Rust `files::save_text(path, expected, text)` writes only when the disk still holds `expected`, the text last read or saved, and returns the disk text otherwise; it never creates a file. `files::create_text` restores a removed file and never overwrites one. `write_text` is gone.
- `editor-store`: `checkNow` runs for every batch that changes, creates or moves a file to the open path; saves and checks share one queue. `conflict` (`changed` with the disk text, or `removed`) stops saving; `reload`, `keepMine`, `restoreFile`, `discard`; `replaced` keeps edits a reload replaced, with `restoreReplaced` and `dismissReplaced`. The pane shows the choices in a bar under the header.
- `board-store.moveTask` saves the open file before moving its card.
- Decision D-20261030-235513-a2um (my call; Keep mine and restorable replaced edits go beyond the node's single reload button).
- Checks: `npm run check` (80 tests), `cargo test` (94), `cargo clippy` clean. Not tried by hand in the running app.

## Result
An open file now follows the disk. Without unsaved edits it reloads silently. With unsaved edits the editor keeps them, stops saving and shows "Changed on disk" with Reload and Keep mine. Every save first checks that the disk still holds what the editor last saw, so a change the watcher has not reported yet is not overwritten either. Edits replaced by a reload can be restored until dismissed. A removed file with edits stays open with Restore file and Discard edits. Moving a card saves its open file first, so the `completed` change just reloads.

- Not yet checked by hand in the running app.
- Replaced edits are dropped when another file opens; that is the only way typed text leaves the app, and only after the user chose Reload.
- `S-frontend` still lists CodeMirror and remark/rehype as "come with their tasks" (outside this task).

### Next session
- `next/` is empty. Phase 1 candidates in the inbox: [column names in the planner block](20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md), [frontmatter and id wording](20261030-215109-0my7-valid-frontmatter-and-id-wording-in-agent-instructions.md), [deletes to the OS trash](20261030-220017-e886-deletes-go-to-the-os-trash.md). A hand check of the board and editor in `npm run tauri dev` is overdue.
