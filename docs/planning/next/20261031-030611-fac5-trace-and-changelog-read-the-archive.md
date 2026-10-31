---
id: 20261031-030611-fac5
title: Trace and changelog read the archive
tags: [planning]
created: 2026-10-31
implements: [S-trace, S-changelog]
depends_on: [20261031-021018-wsw3]
---

## Description
Found while archiving finished tasks ([task](../done/20261031-021018-wsw3-archive-finished-tasks-by-month.md)). Trace and the changelog read the terminal column with `read_column`, which lists only the files directly in the folder, so tasks moved into `done/YYYY-MM/` drop out of both (D-20261031-030552-k3qa):
- Trace: a ticked node implemented only by archived tasks is listed as a ticked node without any task, and its row in the spec view no longer names those tasks.
- Changelog: a draft since a date or tag before the current month misses the archived entries.

The board should keep not showing archived tasks.

## Acceptance criteria
- [ ] Trace counts tasks in the archive month folders as implementing their nodes, and lists them under the node with their column
- [ ] The changelog draft includes archived tasks finished in the range, linked at their archive path
- [ ] The board, the column count and the session panel stay as they are

## Implementation notes

## Result
