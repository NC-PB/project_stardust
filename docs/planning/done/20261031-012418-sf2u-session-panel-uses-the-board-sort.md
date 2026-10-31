---
id: 20261031-012418-sf2u
title: Session panel uses the board sort
tags: [planning]
created: 2026-10-31
implements: [S-session-panel, S-board-sort]
depends_on: []
completed: 2026-10-31
---

## Description
The [session panel](../done/20261031-005408-gv2i-session-panel.md) orders ready tasks by priority, then id, until `S-board-sort` exists (D-20261031-011606-s3pn).

## Acceptance criteria
- [x] Ready tasks in the session panel follow the board sort
- [x] `readyOrder` is removed

## Implementation notes
- Done: `sessionBrief` in `src/lib/session.ts` orders the ready column with `sortTasks` from `src/lib/board.ts` ([board sort](20261031-020804-weln-board-sort.md)). `readyOrder` and its test are removed, and a test checks that the brief's order equals `sortTasks`. `S-session-panel` and `S-board-sort` criteria are updated, and D-20261031-021155-7d0n is recorded.
- Open: none.

## Result
The session panel lists the ready tasks in the same order as the ready column on the board: priority, `created`, id, then dependencies within the column (D-20261031-021102-jyia, D-20261031-021155-7d0n). `readyOrder` is gone; `sessionBrief` uses `sortTasks`.
- `npm run check` passes (tsc, biome, 257 tests). Not tried in the running app.
