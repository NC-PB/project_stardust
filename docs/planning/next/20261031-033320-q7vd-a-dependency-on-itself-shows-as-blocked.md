---
id: 20261031-033320-q7vd
title: A dependency on itself shows as blocked
tags: [planning]
created: 2026-10-31
implements: [S-dependencies]
depends_on: []
---

## Description
`cardsOf` in `src/lib/board.ts` counts a task's own id in `depends_on` as blocking while the task is outside the terminal column, so the card and the Stale view show it as blocked by itself. The board sort already ignores a dependency on the task itself (`S-board-sort`). Found while building the Stale view ([task](../done/20261031-021022-nd3n-stale-view.md)).

## Acceptance criteria
- [ ] A task whose `depends_on` names its own id is not blocked by it (or the doctor reports it, decide)

## Implementation notes

## Result
