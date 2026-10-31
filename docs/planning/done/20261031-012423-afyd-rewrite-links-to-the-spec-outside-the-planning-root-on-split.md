---
id: 20261031-012423-afyd
title: Rewrite links to the spec outside the planning root on split
tags: [files]
created: 2026-10-31
implements: [S-links]
depends_on: []
completed: 2026-10-31
---

## Description
After a [split](../done/20261031-005410-2x1b-split-the-spec-into-the-spec-folder.md), repository markdown such as `ARCHITECTURE.md` still links to `docs/planning/spec.md`. Extend the split, or `S-links` when it lands, to the whole repository.

## Acceptance criteria
- [x] Links to `spec.md` anywhere in the repository are rewritten on split

## Implementation notes
- Implemented inside the split, so the code lives in `S-spec-split` (`src-tauri/src/domain/spec_split.rs`); its criteria are updated along with this task. `S-links` (rewriting on any move, broken-link repair, autocomplete, backlinks) stays unbuilt and its criteria are untouched.
- Done: `prepare` walks the repository root instead of the planning root for `.md` files, skipping hidden names and folders named `node_modules` or `target` (`SKIPPED`, `searched`); the planning root and the folders above it are always walked, so a hidden planning root still works. `into_spec` takes the path of `spec.md` from the root it resolves against. Non-UTF-8 files are skipped unless their bytes contain `spec.md`, which blocks. Preview and report paths of rewritten files are now relative to the repository root.
- Done: tests `links_anywhere_in_the_repository_are_rewritten`, `a_planning_root_in_a_hidden_folder_is_still_searched`, and `a_failed_link_rewrite_undoes_the_split` now also checks that `ARCHITECTURE.md` is written back. `cargo test`, `cargo clippy --all-targets`, `npm run check` pass; bindings regenerated.
- Open: nothing.

## Result
The split now rewrites links to `spec.md` in every `.md` file of the repository, not only under the planning root, with the same guarantees: the preview lists each rewrite with its file (now relative to the repository root), files are written only over the text read, and a failed step writes earlier rewrites back (tested with `ARCHITECTURE.md` and a locked planning file). Hidden folders, `node_modules` and `target` are not searched; `.gitignore` is not read (D-20261031-015930-k4vn, superseding the planning-root-only part of D-20261031-012140-ol0p). `S-spec-split` criteria updated; `S-links` is still unimplemented.

Not tried in the running app: the preview and the split were checked only through Rust tests on temporary repositories, not by clicking Split spec in the app. Markdown in other ignored folders (`dist`) and root-absolute links (`/docs/planning/spec.md`) are not handled specially.
