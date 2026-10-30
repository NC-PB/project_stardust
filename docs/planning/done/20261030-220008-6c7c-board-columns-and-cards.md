---
id: 20261030-220008-6c7c
title: Board columns and cards
tags: [planning, board]
created: 2026-10-30
completed: 2026-10-30
implements: [S-board-columns, S-board-card]
depends_on: [20261030-220003-9910, 20261030-220007-e420]
---

## Description
The main view. Commit info on cards is phase 4 (`S-commit-info`) and not part of this task.

Implements `S-board-columns`, `S-board-card` in the [spec](../spec.md).

## Acceptance criteria
- [x] The board shows the folders listed in `columns`, in config order
- [x] Folders not listed in `columns` are not shown
- [x] Cards show title, tags, age since last change, sub-task count, blocked marker and new-since-last-visit marker
- [x] Last visit times are stored in app settings, never in the repository
- [x] The board updates from watcher events without reload

## Implementation notes
- `Task` has `modified` (file time, RFC 3339 UTC) from `read_task`; `parse_task` leaves it `None`.
- `src/lib/board.ts`: `columnDir`, `touchedColumns`, `ageLabel`, `isNewSince`, `cardsOf`. `src/stores/board-store.ts`: `useBoardStore` reads columns with `read_column`, re-reads touched columns per batch, records visits in app settings (`lastVisits`). `useProjectStore` loads the board after the config and passes each batch on. `src/components/board.tsx` renders, `App.tsx` shows it below the project panel.
- Decision on visits, file times and unknown dependencies: D-20261030-231221-spj4.
- Checks: `npm run check` (40 tests), `cargo test` (80 passed), `cargo clippy --all-targets`. In `npm run tauri dev` with this repository: 14/1/9 cards, tags, ages, new markers and Blocked shown; a task file written into `inbox/` appeared at once and the parent card showed "1 sub-task".

## Result
The app now shows the board: the columns from `columns` in config order, each scrolling on its own, with a card per task file showing title, tags, age since the file last changed, sub-task count, a Blocked marker (dependencies outside the terminal column, named on hover) and a dot for files changed since the last visit. Changes on disk update the board without reload; only the touched columns are read again.

- Last visits are kept per repository in the app settings (`lastVisits`), never in the repository. Nothing is new on the first visit; a dependency on a task found in no column does not block (D-20261030-231221-spj4).
- A listed column without a folder shows "No folder for this column".
- Commit info on cards stays with `S-commit-info` in phase 4.
- `S-task-format` does not yet list the new `modified` field of a task; that node was outside this task.

### Next session
- `next/` is empty. [Drag and drop](20261030-220009-9c40-drag-and-drop-between-columns.md) and the [tag filter](20261030-220010-6a61-tag-filter-on-the-board.md) build on `useBoardStore` and `cardsOf`.
- The project panel sits above the board and takes vertical space; a compact header may be wanted once the board is in daily use.
