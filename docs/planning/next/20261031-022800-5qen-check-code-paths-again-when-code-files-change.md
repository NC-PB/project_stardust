---
id: 20261031-022800-5qen
title: Check code paths again when code files change
tags: [planning]
created: 2026-10-31
implements: [S-staleness]
depends_on: []
---

## Description
Found while building the staleness flags ([task](../done/20261031-021021-piw1-staleness-flags.md)). Missing code paths are checked when the project opens and after watcher batches that touch a column. The watcher only watches the planning root (`S-watcher`), so creating, deleting or renaming a code file elsewhere in the repository does not update the "Missing path" markers until a task changes or the project is opened again.

Options: re-check when the app window gains focus; a "Check again" button in the Stale view; or watch the repository root for file creations and removals only.

## Acceptance criteria
- [ ] A code file created or removed outside the planning root updates the missing path flags without reopening the project
- [ ] No background process and no new watcher on ignored folders such as `node_modules` or `target`

## Implementation notes

## Result
