---
id: 20261030-220007-e420
title: File watcher with move detection
tags: [files]
created: 2026-10-30
implements: [S-watcher, S-agents-block]
depends_on: [20261030-220003-9910]
completed: 2026-10-30
---

## Description
Watch the planning root with `notify` and send typed events to the frontend.

Implements `S-watcher` in the [spec](../spec.md).

## Acceptance criteria
- [x] Changes on disk appear in the app without user action
- [x] Moves are detected as moves by id, not as delete and create
- [x] Bursts of events (an agent moving many files) are debounced into one update
- [x] Tests cover create, modify, move and delete
- [x] A change to `docs/planner.yml` (outside the planning root) regenerates the planner block through `agents_block::write_planner_block`; moved here from the [planner block task](../done/20261030-220005-24ef-write-the-planner-block-into-agents-md.md) (D-20261030-220523-8397)

## Implementation notes
- Done: `src-tauri/src/domain/watch.rs` (`diff`, `scan`, `watch`), commands `watch_project` and `unwatch_project` with `WatchState`, typed event `PlanningChanged` (tauri-specta `derive` feature), store and panel in the frontend. Dependency `notify` 8.
- "Appear in the app": there is no board yet; the project panel shows the last batch, and `useProjectStore.revision` is what the board and editor will react to.
- Checks: `cargo test` (79 passed; the real watcher test passed five runs in a row on macOS, about 4.7 s), `cargo clippy --all-targets`, `npm run check` (21 tests). `npm run tauri dev` starts; a warning about the IPC custom protocol went to the [inbox](../inbox/20261030-225823-gccd-ipc-custom-protocol-warning-in-dev.md).
- Not tested on Windows or Linux.

## Result
The app watches the open repository. `watch_project(repoRoot)` starts a `notify` watcher on the planning root and the config folder; every burst of changes becomes one `PlanningChanged` event with a `ChangeBatch` (`created`, `modified`, `removed`, `moved` with id, and `config_changed`).

- Moves are found by comparing files before and after a batch, by task id, so they do not depend on platform rename events (D-20261030-225824-5045). Moving a whole column folder reports each task as moved.
- A config change rewrites the planner block first; the event carries `block_written` and `block_error`. The frontend then reloads the config and restarts the watcher.
- The watcher writes nothing itself; the planner block is outside the planning root, so its write causes no new batch.
- Commands still write with `std::fs::write`; their writes come back as `modified` batches. The editor task has to decide whether its own saves need to be told apart.

### Next session
- `next/` is empty. The [board](../inbox/20261030-220008-6c7c-board-columns-and-cards.md) can now read `repoRoot`, `config` and `revision` from `useProjectStore`.
- Run the real watcher test on Windows and Linux when a machine is at hand.
