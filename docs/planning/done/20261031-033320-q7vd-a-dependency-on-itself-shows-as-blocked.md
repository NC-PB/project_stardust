---
id: 20261031-033320-q7vd
title: A dependency on itself shows as blocked
tags: [planning]
created: 2026-10-31
completed: 2026-10-31
implements: [S-dependencies]
depends_on: []
---

## Description
`cardsOf` in `src/lib/board.ts` counts a task's own id in `depends_on` as blocking while the task is outside the terminal column, so the card and the Stale view show it as blocked by itself. The board sort already ignores a dependency on the task itself (`S-board-sort`). Found while building the Stale view ([task](../done/20261031-021022-nd3n-stale-view.md)).

## Acceptance criteria
- [x] A task whose `depends_on` names its own id is not blocked by it (or the doctor reports it, decide)

## Implementation notes
- Done: `cardsOf` leaves the task's own id out of `blockedBy`; test "does not block a task on itself" in `src/lib/board.test.ts`; the Stale view exit test's oracle (`actuallyBlocked` in `src/lib/stale-view.test.ts`) skips it too.
- Decided: not blocked; the doctor check is a separate task in the inbox.

## Result
A dependency on the task itself no longer blocks: `cardsOf` (`src/lib/board.ts`) filters the task's own id out of `blockedBy`, so neither the board's blocked marker nor the Stale view's Blocked group shows a task as blocked by itself; its other dependencies still block. This matches the board sort. The doctor does not report self-dependencies yet; that is task [20261031-033553-r4kd](../inbox/20261031-033553-r4kd-doctor-reports-a-dependency-on-the-task-itself.md). Decision D-20261031-033553-2skc in the [spec](../spec.md). `npm run check` passes (368 tests).
