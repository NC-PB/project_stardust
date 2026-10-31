---
id: 20261031-031550-qh9t
title: Session panel falls back to the archive for the last finished task
tags: [planning]
created: 2026-10-31
implements: [S-session-panel, S-archive]
depends_on: [20261031-030611-fac5]
---

## Description
Found while letting trace and the changelog read the archive ([task](../done/20261031-030611-fac5-trace-and-changelog-read-the-archive.md), D-20261031-031457-vjn2).
- The session panel's last finished task comes only from the files directly in the terminal column. When nothing was finished this month and earlier months are archived, it shows none. The board store now holds the archived tasks (`useBoardStore.archived`), so the panel could fall back to the newest of them.
- The `S-archive` criterion "the board, the session panel, trace and the changelog read only the files directly in the terminal column" no longer holds for trace and the changelog; it should be brought in line with the code.

## Acceptance criteria
- [ ] With no finished task directly in the terminal column, the session panel shows the newest archived task and its Result
- [ ] The `S-archive` criteria say which readers see archived tasks

## Implementation notes

## Result
