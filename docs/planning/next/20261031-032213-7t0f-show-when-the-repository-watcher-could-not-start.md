---
id: 20261031-032213-7t0f
title: Show when the repository watcher could not start
tags: [files]
created: 2026-10-31
implements: [S-watcher]
depends_on: []
---

## Description
Found while building the repository watcher ([task](../done/20261031-022800-5qen-check-code-paths-again-when-code-files-change.md), D-20261031-031612-c6rz). When `repo_watch::watch` fails (such as the OS limit of inotify watches on Linux), `open_project` drops the error and the planning watcher runs alone. Missing code paths, outside link candidates and backlinks from outside the planning root then follow planning batches only, and nothing says so.

Options: return the error with the `watch_project` result and show it in the project panel; or fall back to reading again on window focus.

## Acceptance criteria
- [ ] A repository watcher that could not start is reported in the app with its reason
- [ ] The planning watcher keeps running

## Implementation notes

## Result
