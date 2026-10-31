---
id: 20261031-021013-ihmk
title: Rewrite links when a file moves
tags: [files]
created: 2026-10-31
implements: [S-links]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 3. Every move in the app (drag and drop, archive) goes through this. Moves by agents are seen by the watcher and handled the same way. Split spec already rewrites links into the spec; reuse or replace that code rather than keeping two mechanisms.

Implements `S-links` in the [spec](../spec.md).

## Acceptance criteria
- [x] Links are relative markdown links
- [x] Moving a file, in the app or on disk, rewrites every link to it in the planning root
- [x] Links inside the moved file are rewritten so they still resolve from the new location
- [x] Only the link targets change; nothing else in any file
- [x] Tests cover moves between columns, into the archive and into subfolders

## Implementation notes
- Done: link scanning (line classes, link targets, `rewrite_links`) and the repository walk (`markdown_files`, `SKIPPED`) moved from `spec_split.rs` into `src-tauri/src/domain/links.rs`; the split uses them from there and its tests pass unchanged.
- Done: `rewrite_after_moves(repo_root, planning_root, moves)` rewrites a link only when it is broken from its file's place now and resolves from the old place to an existing file, following moved files. Idempotent, and leaves links an agent already fixed.
- Done: `ChangeBatch::moves` (moved tasks, plus files without an id removed and created under the same name once each); `watch_project` rewrites before sending the batch and reports `links` in `PlanningChanged`; the project panel shows rewritten files and problems until dismissed.
- Decision: D-20261031-023039-a9u7 (watcher path for every move, repository-wide scope like the split, only broken links).

## Result
Moving a task, by drag and drop or on disk by an agent, now rewrites the links to it in every markdown file the split searches (the whole repository except hidden folders, `node_modules` and `target`) and the relative links inside the moved file. Both go through one path: the watcher batch that reports the move, handled in `watch_project` before the batch is sent, so each move is handled once and the board's move command is unchanged. The split and the moves share `src-tauri/src/domain/links.rs`.

A link is only changed when it is broken now and resolves from the file's old place, so a second pass, or a move whose links an agent already fixed, changes nothing; only the target text of a link changes, written with `save_text` against the text read. Tests in `links.rs` cover moves between columns (with links from other columns, the braindump, `README.md`, code spans, fences, frontmatter, reference definitions and anchors), two tasks moved together into `done/2026-10/`, a move into nested subfolders and back out, already fixed links, skipped folders and non-UTF-8 files; `watch.rs` tests cover `ChangeBatch::moves`; `src/lib/project.test.ts` and `src/stores/project-store.test.ts` the notice. `npm run check`, `cargo test` and `cargo clippy --all-targets` pass.

Not tried in the running app: no drag and drop or agent move was made with the app open, so the timing against the editor (an open file whose links are rewritten should reload silently, or show "changed on disk" with unsaved edits) and the panel notice are verified by tests only. Limits: a move made while the app is closed, or whose two halves land in different batches, is not followed (repair by id, task 20261031-021014-txlv); a file without an id that is renamed, not just moved, is not followed; the scope is the repository, wider than the criterion's "planning root" (D-20261031-023039-a9u7).
