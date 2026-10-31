---
id: 20261031-021023-31v3
title: Commit info on cards
tags: [planning]
created: 2026-10-31
implements: [S-commit-info, S-board-card]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 4. 

Implements `S-commit-info`, `S-board-card` in the [spec](../spec.md).

## Acceptance criteria
- [x] Cards show how many commits mention the task id and the date of the last one, from read-only `git log` (`R-no-git-writes`)
- [x] Information only: a mention never moves a card or marks it done
- [x] Without git, or outside a repository, nothing is shown and nothing fails

## Implementation notes
Checked before starting: `S-commit-info` matched the code (nothing built; `S-board-card` said "Commit info is not built yet"). The only git code was the private `git` helper in `changelog.rs`.

Done (2026-10-31):
- `src-tauri/src/domain/git.rs`: `log(repo_root, args)` runs `git -C <root> log <args>`, adding `log` itself; moved out of `changelog.rs`, which now calls it.
- `src-tauri/src/domain/commit_info.rs`: `commit_info(repo_root)` runs one `git log --extended-regexp --grep=<id pattern> --no-show-signature --format=%x1e%ct%x1f%ci%x1f%B` and counts each task id once per commit, keeping the committer date of the newest commit; `task_ids_in` skips ids inside longer words and after `-` (`D-`, `Q-` ids). Command `commit_info(repo_root)`; unavailable with a reason without git or outside a repository.
- `src/lib/commit-info.ts` (`commitsById`, `commitLabel`), `src/stores/commit-store.ts` (`useCommitStore`: `load`, `refresh`, `refreshOnFocus`, `clear`), loaded and cleared with the project in `project-store.ts`; `App.tsx` registers the focus refresh; `board.tsx` shows `n commits · YYYY-MM-DD` in the card's meta row (now wrapping), hover text says it is information only.
- Nothing moves cards from commit info: the store only feeds the card label.
- Tests: four Rust tests in `commit_info.rs` (one against a scratch git repository), `src/lib/commit-info.test.ts`, `src/stores/commit-store.test.ts`.
- Decision D-20261031-023623-qztq; Glossary term "Commit info".

Open: nothing for this task.

## Result
Cards show `n commits · YYYY-MM-DD` when commits of `HEAD` mention the task id, with a hover text saying it is information only; nothing else reads the info, so a mention never moves a card. One `git log` run covers all tasks (`--grep` for the id shape, ids counted in Rust), read when the project opens and whenever the window gets focus. Without git, outside a repository or in a repository without commits the command returns "unavailable" with a reason and the cards show nothing.

- The git runner moved from `changelog.rs` to `src-tauri/src/domain/git.rs` and only ever runs `git log`. The `S-changelog` node still names `changelog.rs` for the tag lookups, which is still true; it does not mention `git.rs`.
- On this repository few commits carry task ids in their messages (about ten ids, mostly in bodies), so most cards show nothing today.
- Verified with `npm run check` (301 tests), `cargo test` (213 passed, 1 ignored) and `cargo clippy --all-targets` (no warnings).
- Not tried in the running app: the label on cards, the meta row wrapping, and whether the webview's DOM `focus` event fires when the Tauri window is focused were not checked by hand. The git lookup from a bundled app (PATH on macOS) and Windows are untested, as for the changelog.
- Limits: commits made while the app keeps focus show after the next focus; the run repeats on every focus with no cache; ids in upper case or right after `-` are not counted.
