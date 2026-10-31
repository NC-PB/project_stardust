---
id: 20261031-032214-08rk
title: Show progress while a project opens
tags: [files]
created: 2026-10-31
completed: 2026-10-31
implements: [S-watcher]
depends_on: []
---

## Description
Found while moving project open off the main thread ([task](../done/20261031-030450-m2kd-open-project-work-off-the-main-thread.md), D-20261031-031233-w4pe). The window no longer freezes, but the board stays empty until the repair by id and the search index are done, and nothing says that the project is still opening.

## Acceptance criteria
- [x] While `watch_project` runs, the project panel shows that the project is opening

## Implementation notes
- Done: `useProjectStore.opening` (`src/stores/project-store.ts`), set before `commands.watchProject` and cleared in its `finally` when the call is still the latest (a counter of watch calls); a repository without config clears it. One status line in `src/components/project-panel.tsx`. Tests in `src/stores/project-store.test.ts`: shown while the watch runs and cleared after an error, kept until the latest of two opens is done, cleared when a repository without config opens meanwhile.
- Done: `S-watcher` criteria, D-20261031-032756-op3n.
- Open: none.

## Result
While `watch_project` runs, the project panel shows "Opening the project: repairing links, building the search index and starting the watchers…". It goes away when the latest open is watched (or fails), or when a repository without config is opened meanwhile; an earlier open finishing late does not end it. The reload after a config change shows it too, as it calls `watch_project` again (D-20261031-032756-op3n). There is no step by step progress.

Verified with `npm run check` (tsc, biome, vitest, three new store tests), `cargo test` and `cargo clippy --all-targets`; no Rust changed. Not tried in the running app: the line was not seen on a large repository.
