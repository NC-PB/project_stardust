---
id: 20261031-022800-5qen
title: Check code paths again when code files change
tags: [planning]
created: 2026-10-31
implements: [S-staleness]
depends_on: []
completed: 2026-10-31
---

## Description
Found while building the staleness flags ([task](20261031-021021-piw1-staleness-flags.md)). Missing code paths are checked when the project opens and after watcher batches that touch a column. The watcher only watches the planning root (`S-watcher`), so creating, deleting or renaming a code file elsewhere in the repository does not update the "Missing path" markers until a task changes or the project is opened again.

Options: re-check when the app window gains focus; a "Check again" button in the Stale view; or watch the repository root for file creations and removals only.

## Acceptance criteria
- [x] A code file created or removed outside the planning root updates the missing path flags without reopening the project
- [x] No background process and no new watcher on ignored folders such as `node_modules` or `target`

## Implementation notes
- Checked against the code: missing code paths were read in `useStalenessStore.load` on open and in `apply` after batches touching a column; the watcher (`watch.rs`) watched only the planning root and the config folder. Matched the description.
- Done: `src-tauri/src/domain/repo_watch.rs`, the repository watcher, shared with task 20261031-030418-9g0v: `plan` (recursive watches only on folders whose tree holds no hidden or `node_modules`/`target` folder and not the planning root, the others non-recursively; tested on a tree like this repository's), `classify` (event kind and path to an `OutsideChange`; tested), `watch` (debounce 300 ms / 2 s, watches for folders created later; tested against the real watcher: planning root, `node_modules` and `target` stay silent, a code file, a markdown file, a new top-level folder and a file in it are reported). Started and stopped with the planning watcher in `open_project` (`commands.rs`), held in `Watchers`; event `RepositoryChanged`.
- Frontend: `useProjectStore.listen` subscribes to both events, `receiveOutside` passes the change on; `useStalenessStore.applyOutside` checks the code paths again when files were added or removed (tested).
- Decision D-20261031-031612-c6rz.

## Result
A code file created, removed or renamed outside the planning root now updates the "Missing path" markers within about a second, through the new repository watcher. It watches nothing under hidden folders, `node_modules`, `target` or the planning root, not even through a recursive watch above them, and stops with the project like the planning watcher. It only says what kind of files changed; the staleness store reads the code paths again itself.

Not tried in the running app: the markers were not watched changing in the Tauri window; the Rust watcher was tested on macOS only (FSEvents), not on Linux (inotify) or Windows. Limits: a hidden or `node_modules` folder created after opening inside a recursively watched folder is covered until the next open; if the repository watcher cannot start (such as the OS watch limit), nothing says so and the markers follow planning batches only.
