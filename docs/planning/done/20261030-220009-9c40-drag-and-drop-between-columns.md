---
id: 20261030-220009-9c40
title: Drag and drop between columns
tags: [planning, board]
created: 2026-10-30
completed: 2026-10-30
implements: [S-board-dnd]
depends_on: [20261030-220008-6c7c]
---

## Description
Moving a card moves the file. Uses dnd-kit.

Implements `S-board-dnd` in the [spec](../spec.md).

## Acceptance criteria
- [x] Dropping a card in another column moves the file (`R-one-column`)
- [x] Moving into the terminal column sets `completed` to today; moving out removes it
- [x] A failed move leaves the card in its original column and shows the error

## Implementation notes
- Rust `src-tauri/src/domain/board.rs`: `move_task` checks both columns are in `columns`, the file name has no path, the target folder exists and has no file of that name; renames, then sets or removes `completed`; a failed write renames back. Command `move_task(repo_root, file_name, from, to)` takes today in local time.
- Frontend: `@dnd-kit/core` 6.3.1. `moveCard` in `src/lib/board.ts`; `moveTask`, `moveError`, `dismissMoveError` in `useBoardStore` (optimistic move, reverted on error); `board.tsx` has `Column` (droppable), `DraggableCard` and a `DragOverlay` so the card is not clipped by the scrolling column. Pointer drag starts after 5 px; keyboard drag only from the card itself, not from a tag inside it.
- Order and conflicts: D-20261030-232042-h9dm.
- Checks: `npm run check` (51 tests), `cargo test` (87 tests), `cargo clippy` clean. Not tried in `npm run tauri dev`.

## Result
Cards can be dragged between columns with the mouse or the keyboard. A drop renames the file into the target column folder; moving into the terminal column sets `completed` to today, moving out of it removes the field, other moves leave the text unchanged. The card moves at once; if the move fails (same file name in the target, column without folder, unreadable file) it goes back to its column and the error shows above the board until dismissed. An existing file is never overwritten.

- Not yet checked by hand in the running app.
- `S-frontend` still says dnd-kit "comes with its task"; it is now installed (`@dnd-kit/core`). That node was outside this task.
- A moved card goes to the end of its column; ordering is `S-board-sort` (phase 4).

### Next session
- `next/` is empty. The remaining phase 1 board work is done; the [editor](20261030-220011-a93f-markdown-editor-with-source-and-read-mode.md) and [conflict handling](../next/20261030-220012-ff26-reload-and-conflict-handling.md) tasks are in the inbox.
