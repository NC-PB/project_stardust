---
id: 20261031-032213-7t0f
title: Show when the repository watcher could not start
tags: [files]
created: 2026-10-31
completed: 2026-10-31
implements: [S-watcher]
depends_on: []
---

## Description
Found while building the repository watcher ([task](../done/20261031-022800-5qen-check-code-paths-again-when-code-files-change.md), D-20261031-031612-c6rz). When `repo_watch::watch` fails (such as the OS limit of inotify watches on Linux), `open_project` drops the error and the planning watcher runs alone. Missing code paths, outside link candidates and backlinks from outside the planning root then follow planning batches only, and nothing says so.

Options: return the error with the `watch_project` result and show it in the project panel; or fall back to reading again on window focus.

## Acceptance criteria
- [x] A repository watcher that could not start is reported in the app with its reason
- [x] The planning watcher keeps running

## Implementation notes
- Done: `watch_project` returns `ProjectOpened { repair, repository_watch_error }` (`src-tauri/src/commands.rs`); `open_project` keeps the error of `repo_watch::watch` instead of dropping it and starts the planning watcher either way. `repo_watch::watch` now names the folder whose watch failed. Test `a_repository_that_cannot_be_watched_fails_with_the_reason` in `repo_watch.rs`.
- Done: `useProjectStore.repositoryWatchError`, cleared when a repository opens or has no config; `describeRepositoryWatchError` in `src/lib/project.ts`; one line in `src/components/project-panel.tsx`. Tests in `src/lib/project.test.ts` and `src/stores/project-store.test.ts`.
- Done: `S-watcher` criteria, D-20261031-032647-r2wq.
- Open: none.

## Result
When the repository watcher cannot start, `watch_project` now returns the reason with the repair (`ProjectOpened`), naming the repository root or the folder that could not be watched. The planning watcher starts either way, as before. The project panel shows a line saying that missing paths, link candidates and backlinks from outside the planning root now follow planning changes only until the project is opened again, with the reason; it stays until the project is opened again (D-20261031-032647-r2wq). No fallback on window focus.

Verified with `npm run check` (tsc, biome, vitest), `cargo test` and `cargo clippy --all-targets`. The Rust test covers only a missing repository root; a failing watch of a single folder (the OS limit) was not reproduced. Not tried in the running app: the panel line was not seen, since the watcher could not be made to fail there.
