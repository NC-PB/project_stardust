---
id: 20261031-032214-08rk
title: Show progress while a project opens
tags: [files]
created: 2026-10-31
implements: [S-watcher]
depends_on: []
---

## Description
Found while moving project open off the main thread ([task](../done/20261031-030450-m2kd-open-project-work-off-the-main-thread.md), D-20261031-031233-w4pe). The window no longer freezes, but the board stays empty until the repair by id and the search index are done, and nothing says that the project is still opening.

## Acceptance criteria
- [ ] While `watch_project` runs, the project panel shows that the project is opening

## Implementation notes

## Result
