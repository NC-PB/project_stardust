---
id: 20261030-220008-6c7c
title: Board columns and cards
tags: [planning, board]
created: 2026-10-30
implements: [S-board-columns, S-board-card]
depends_on: [20261030-220003-9910, 20261030-220007-e420]
---

## Description
The main view. Commit info on cards is phase 4 (`S-commit-info`) and not part of this task.

Implements `S-board-columns`, `S-board-card` in the [spec](../spec.md).

## Acceptance criteria
- [ ] The board shows the folders listed in `columns`, in config order
- [ ] Folders not listed in `columns` are not shown
- [ ] Cards show title, tags, age since last change, sub-task count, blocked marker and new-since-last-visit marker
- [ ] Last visit times are stored in app settings, never in the repository
- [ ] The board updates from watcher events without reload

## Implementation notes

## Result
