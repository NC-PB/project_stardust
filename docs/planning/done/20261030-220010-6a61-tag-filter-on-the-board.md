---
id: 20261030-220010-6a61
title: Tag filter on the board
tags: [planning, board]
created: 2026-10-30
completed: 2026-10-30
implements: [S-board-filter]
depends_on: [20261030-220008-6c7c]
---

## Description
Implements `S-board-filter` in the [spec](../spec.md).

## Acceptance criteria
- [x] Filtering by one or more tags hides cards without them, in all columns
- [x] The filter is cleared with one action

## Implementation notes
- `src/lib/board.ts`: `boardTags` (all tags, sorted, once), `filterCards` (keeps cards carrying every selected tag). `useBoardStore`: `tagFilter`, `toggleTag`, `clearTagFilter`; the filter survives `load` of the same project and is emptied for another. `board.tsx`: tag bar above the columns with a "Clear filter" button, tags on cards toggle the filter, column counts read "shown of total" while filtering.
- All-of matching and a session-only filter: D-20261030-231541-84sn.
- Checks: `npm run check` (46 tests). Not tried in `npm run tauri dev`.

## Result
The board has a tag filter. A tag bar above the columns lists every tag on the board; clicking a tag there or on a card adds it to the filter or removes it, and "Clear filter" empties it in one action. A card stays visible only when it carries every selected tag, in all columns; column counts then read "shown of total".

- The filter lasts for the session and is emptied when another project is opened; nothing is written to the repository or the settings (D-20261030-231541-84sn).
- Not yet checked by hand in the running app.

### Next session
- `next/` is empty. [Drag and drop](20261030-220009-9c40-drag-and-drop-between-columns.md) is the remaining board task in the inbox.
