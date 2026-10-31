---
id: 20261031-021019-gps2
title: Suggest .gitattributes for append-only files
tags: [files]
created: 2026-10-31
implements: [S-gitattributes]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 3. 

Implements `S-gitattributes` in the [spec](../spec.md).

## Acceptance criteria
- [x] On request, writes `merge=union` for the questions and decisions files only, for both spec forms
- [x] Existing `.gitattributes` content is kept; the lines are added only if missing
- [x] Task files are never included

## Implementation notes
- Plan: Rust module `src-tauri/src/domain/gitattributes.rs` (plan + write against the text read), commands `plan_gitattributes` / `add_gitattributes`, store `src/stores/gitattributes-store.ts`, "Git attributes" button and preview panel in the project bar next to Split spec (Settings holds app settings only, never repository files).
- Single file form: the only file holding questions and decisions is `spec.md`, so the line is `spec.md merge=union`, shown with a warning that Structure and every other section merge by union too; folder form: `spec/questions.md` and `spec/decisions.md`.
- Done: module with 13 tests, commands registered, bindings regenerated, store with 4 tests, panel in the project bar, spec node criteria, decision, inbox task for the split. Open: nothing.

## Result
"Git attributes" in the project bar previews and appends `merge=union` lines to `.gitattributes` at the repository root (D-20261031-022447-q8vr).

- Lines name the spec form's own files from the repository root: `spec/questions.md` and `spec/decisions.md` in the folder form, `spec.md` in the single file form, where the preview warns that the whole spec, Structure included, then merges by union and suggests a split. Task files are never named (`append_only_files`, tested against the columns).
- The preview lists lines to add, lines already there and lines with another merge setting for the same path, which are left alone and get no line. A missing file is created; an existing one keeps its text byte for byte and gets the lines appended with its own line ending, written with `save_text` against the text read. The write is refused when the lines differ from the preview, and blocked for a non-UTF-8 or unreadable file and for paths with glob characters; paths with spaces are quoted.
- No git command runs; `R-no-git-writes` holds.
- Verified with `npm run check` (261 tests), `cargo test` (188 passed) and `cargo clippy --all-targets` (clean).
- Not tried: the button and panel in the running app (`npm run tauri dev` was not started), and git's own reading of the written lines (`git check-attr`, an actual union merge, quoted paths with spaces) was not checked with git; the line format follows the gitattributes documentation. This repository's own `.gitattributes` was not written.
- Discovered: after a split, a `spec.md` line goes stale and the folder files get no line until the action runs again (inbox task [20261031-022447-8qow](../inbox/20261031-022447-8qow-split-spec-updates-the-gitattributes-lines.md)).
