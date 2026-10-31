---
id: 20261031-035143-3197
title: A parent on itself is no sub-task
tags: [board, planning]
created: 2026-10-31
completed: 2026-10-31
implements: [S-subtasks, S-board-card]
depends_on: [20261031-034624-p3vc]
---

## Description
`cardsOf` in `src/lib/board.ts` counts every task whose `parent` is a card's id as that card's sub-task. A task whose `parent` is its own id is therefore counted as its own sub-task, and its card shows "1 sub-task". The doctor now reports such a `parent` as a parent error (task [20261031-034624-p3vc](../done/20261031-034624-p3vc-doctor-reports-an-unknown-parent-id.md), D-20261031-035143-pr9u in the [spec](../spec.md)); the board could leave it out of the count, as `blockedBy` leaves out a dependency on the task itself (D-20261031-033553-2skc).

## Acceptance criteria
- [x] A task whose `parent` is its own id does not count as a sub-task of its own card
- [x] Other children are counted as before

## Implementation notes
- Done: `cardsOf` in `src/lib/board.ts` skips a `parent` equal to the task's own id when counting sub-tasks; new test "does not count a task as its own sub-task" in `src/lib/board.test.ts` (a self parent plus one real child gives 1).
- `S-subtasks` and `S-board-card` criteria updated.

## Result
A task whose `parent` is its own id no longer counts as a sub-task of its own card; other children are counted as before. Follows the rule for a dependency on the task itself (D-20261031-033553-2skc), so no new decision. The doctor still reports the self parent (D-20261031-035143-pr9u). Checked by unit tests only, not in the running app.
