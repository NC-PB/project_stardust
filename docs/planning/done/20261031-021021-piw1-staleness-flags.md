---
id: 20261031-021021-piw1
title: Staleness flags
tags: [planning]
created: 2026-10-31
implements: [S-staleness]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 4. 

Implements `S-staleness` in the [spec](../spec.md).

## Acceptance criteria
- [x] Tasks in the ready column older than `stale_after_days` are flagged
- [x] Spec files whose `reviewed` date is older than `review_after_days` are flagged
- [x] Code paths mentioned in tasks that do not exist in the repository are flagged
- [x] Flags show on cards and files

## Implementation notes
Checked before starting: `S-staleness` matches the code (nothing built yet; `stale_after_days` and `review_after_days` are read by `config.rs`, `reviewed` is read per spec file into `SpecFile`).

Plan: Rust module `code_paths.rs` finds code paths in task bodies and checks them; pure TS `src/lib/staleness.ts` builds every flag; a store loads the missing paths; cards, editor header and spec view render the flags.

Done (2026-10-31):
- `src-tauri/src/domain/code_paths.rs`: `code_paths(text)` finds code paths in a task body (inline code outside frontmatter and fences that looks like a relative file path); `missing_code_paths(repo_root, config)` reads the task files of every column except the terminal one and returns the paths that exist neither under the repository root nor under the planning root. Command `missing_code_paths(repo_root)`. `frontmatter_lines` and `fence_marker` of `proposals.rs` are now `pub(crate)` and shared.
- `src/lib/staleness.ts`: `stalenessFlags(input)` is the one pure list of flags (`StaleFlag`: kind, absolute path, line, task id, reason) over the board columns, the spec, the missing paths and `now`; `flagsByPath` and `badgesOf` group them for display; date helpers `dateDay`, `daysSince`, `taskAge`.
- `src/stores/staleness-store.ts`: holds the missing paths; loaded with the project, checked again after batches that touch a column, cleared with the project (`project-store.ts`).
- `src/components/stale-flags.tsx`: `useStaleFlags` (recomputed every minute), `StaleBadges`. Cards show a "Stale", "Review due" or "Missing path" marker with the reasons on hover; the editor header shows the same markers for the open file; the spec view lists spec files due for review with an Open button.
- Tests: four Rust tests in `code_paths.rs`, `src/lib/staleness.test.ts`, `src/stores/staleness-store.test.ts`. `npm run check`, `cargo test`, `cargo clippy --all-targets` pass.
- Decisions D-20261031-022756-w1ou, D-20261031-022757-x0wq, D-20261031-022758-5qen, D-20261031-022759-xsxl in the spec.

Open: nothing for this task. The Stale view (task 20261031-021022-nd3n) is to list `stalenessFlags` together with blocked and broken items.

## Result
Tasks in the ready column, spec files due for review and code paths in tasks that name nothing in the repository are flagged. All flags come from one pure function, `stalenessFlags` in `src/lib/staleness.ts`, which the Stale view can reuse. Cards and the editor header show a marker per kind of flag with the reasons on hover; the spec view lists spec files due for review.

- Age of a ready task: the later of `created` and the file's last change, in local days; flagged above `stale_after_days`. A task cannot record when it entered the column, so a task moved into the ready column long after it was created and last edited is flagged at once.
- Spec: the first file (`spec.md` or `spec/README.md`) is flagged when its `reviewed` is older than `review_after_days`, missing or not a date; other files of the folder form only when they carry their own `reviewed`.
- Code paths: inline code such as `src/lib/board.ts` (with a folder and an extension, no spaces, placeholders or globs), checked by Rust against the repository root and the planning root, for tasks outside the terminal column. On this repository it flags one path today: `src-tauri/tauri.sign-windows.conf.json` in the signed release builds task, a file the CI job writes on the runner.
- Verified with `npm run check` (270 tests), `cargo test` (179 passed) and `cargo clippy --all-targets` (no warnings), all run on the final code and spec.
- Not tried in the running app: the markers on cards, in the editor header and in the spec view were not looked at, and the refresh after watcher batches was only tested in the store test.
- Limits: the watcher only sees the planning root, so a code file created or deleted elsewhere is noticed at the next batch that touches a column or when the project is opened again (inbox task 20261031-022800-5qen). Ages count local calendar days.
