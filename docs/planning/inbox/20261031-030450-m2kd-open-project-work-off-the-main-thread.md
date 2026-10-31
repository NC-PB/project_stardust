---
id: 20261031-030450-m2kd
title: Open project work off the main thread
tags: [files]
created: 2026-10-31
implements: [S-watcher]
depends_on: []
---

## Description
Found while building repair by id ([task](../done/20261031-021014-txlv-repair-broken-links-by-id.md)). `watch_project` is a synchronous Tauri command. When a project opens it now repairs links over every searched markdown file of the repository, then builds the search index, then starts the watcher, all before it returns. Synchronous commands run on the main thread, so a large repository can freeze the window while it opens.

Options: make `watch_project` an async command and run the walk with `spawn_blocking`; or return at once and send the open repair as an event of its own.

## Acceptance criteria
- [ ] Opening a repository with thousands of markdown files does not block the window
- [ ] The repair notice and the search index still arrive before or with the first batch

## Implementation notes

## Result
