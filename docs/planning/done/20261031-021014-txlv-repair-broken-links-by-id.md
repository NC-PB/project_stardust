---
id: 20261031-021014-txlv
title: Repair broken links by id
tags: [files]
created: 2026-10-31
completed: 2026-10-31
implements: [S-links]
depends_on: [20261031-021013-ihmk]
---

## Description
Phase 3. 

Implements `S-links` in the [spec](../spec.md).

## Acceptance criteria
- [x] A broken link whose target filename contains an id is resolved by that id anywhere in the planning root
- [x] The link is repaired and a notice names the file and the new target
- [x] A link that cannot be resolved stays as it is and is reported to the doctor

## Implementation notes
- Done: `src-tauri/src/domain/link_repair.rs` on the scanner of `links.rs` (`classify`, `rewrite_links` per text line, `local_path`, `resolve`, `relative_link`, `markdown_files`); `links.rs` itself is unchanged. Task files are indexed by the id at the start of their filename under the planning root, archive subfolders included. `watch_project` repairs the whole repository first and returns the `LinkRepair`; each batch repairs within `RepairScope::of_batch` after the move rewrite and sends it as `repair` of `PlanningChanged`. Read-only command `broken_links` for the doctor. Frontend: `describeRepair`, `hasRepairNotice` in `src/lib/project.ts`, `repair` in `useProjectStore`, shown in the link notice of the project panel.
- Checked with a throwaway test against this repository (removed): it would repair five links in `done/` that still point to `inbox/` after triage moves made outside the app, and lists `templates/task.md`'s `../braindump.md` (a template placeholder) as unresolved. Those planning files were not touched here; the app repairs them on the next open.
- Open: nothing for this task. Next: the doctor (20261031-021017-7vyg) can list `broken_links`.

## Result
Broken links are repaired by the id in their target's filename. When the project is watched, every searched markdown file of the repository (the walk of the split and the move rewrite) is checked; after each watcher batch, the files that hold the id of a task file created, removed or moved in it, and the files created or moved to, are checked after the move rewrite. A link that does not resolve and whose filename holds an id carried by exactly one task file under the planning root (any subfolder, so `done/2026-10/` too) gets the relative link to that file, anchor kept, written with `save_text` against the text read. This closes the gaps D-20261031-023039-a9u7 left for links to tasks: moves while the app was closed, halves of a move in different batches, and tasks whose slug changed. Each repaired link is listed in the project panel's existing link notice with file, line, old and new target, with problems, until dismissed.

A link that cannot be repaired (no id in its filename, unknown id, or an id held by several files) stays as it is and comes back as `BrokenLink` data: `repair.unresolved` in `PlanningChanged` and in the `watch_project` result, and the read-only `broken_links` command. The doctor does not exist yet (task 20261031-021017-7vyg); "reported to the doctor" means this data is ready for it. Unresolved links are not shown in the app today.

Tests: `link_repair.rs` covers repair across the repository (README, archive subfolder, renamed slug, anchors, `<...>` targets, code spans, fences, frontmatter, web links), a second run changing nothing, duplicate ids, the batch scope, a file changed meanwhile and non-UTF-8 files; `project.test.ts` and `project-store.test.ts` the notice. `npm run check`, `cargo test` and `cargo clippy --all-targets` pass.

Not tried in the running app: no project was opened in the app and no move was made with it open, so the notice and the timing against the editor and the board are verified by tests only. Limits: a renamed file without an id, and a link to a non-task file inside a task whose move halves came apart (such as `../spec.md` from an archive subfolder), are not repaired; opening a project now does one more repository walk on the command's thread (inbox task [20261031-030450-m2kd](../inbox/20261031-030450-m2kd-open-project-work-off-the-main-thread.md)); template placeholders such as `templates/task.md`'s `../braindump.md` are listed as broken, which the doctor may want to filter.
