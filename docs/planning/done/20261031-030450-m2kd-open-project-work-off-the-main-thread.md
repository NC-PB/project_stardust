---
id: 20261031-030450-m2kd
title: Open project work off the main thread
tags: [files]
created: 2026-10-31
implements: [S-watcher]
depends_on: []
completed: 2026-10-31
---

## Description
Found while building repair by id ([task](20261031-021014-txlv-repair-broken-links-by-id.md)). `watch_project` is a synchronous Tauri command. When a project opens it now repairs links over every searched markdown file of the repository, then builds the search index, then starts the watcher, all before it returns. Synchronous commands run on the main thread, so a large repository can freeze the window while it opens.

Options: make `watch_project` an async command and run the walk with `spawn_blocking`; or return at once and send the open repair as an event of its own.

## Acceptance criteria
- [x] Opening a repository with thousands of markdown files does not block the window
- [x] The repair notice and the search index still arrive before or with the first batch

## Implementation notes
- Checked against the code: `watch_project` in `src-tauri/src/commands.rs` was a sync command (main thread) that repaired, built the index and started the watcher before returning; matched the description.
- Done: `watch_project` is `async` and runs `open_project` in `spawn_blocking`. `WatchState` holds the watcher behind an `Arc<Mutex<_>>` locked only to stop the old watcher and to install the new one, and `watch::Generations` (tested) so an overtaken open installs nothing; `unwatch_project` starts a generation too. `useProjectStore.load` returns when another repository was opened while it waited (tested).
- Decision D-20261031-031233-w4pe.

## Result
`watch_project` no longer runs on the main thread: the repair by id, the search index and the watcher start run on a blocking thread, and the command still returns the repair only after the watcher runs, so the repair and the index come before the first batch. Overlapping opens are safe: only the newest installs its index and watcher, and the project store ignores an overtaken answer.

Not tried in the running app: no large repository was opened in the Tauri window, so "the window does not block" rests on how Tauri runs async commands, not on an observation. The board still appears only after the repair and the index; nothing shows progress meanwhile.
