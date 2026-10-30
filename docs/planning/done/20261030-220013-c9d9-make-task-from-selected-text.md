---
id: 20261030-220013-c9d9
title: Make task from selected text
tags: [planning]
created: 2026-10-30
completed: 2026-10-31
implements: [S-make-task]
depends_on: [20261030-220011-a93f, 20261030-220001-3fab]
---

## Description
Implements `S-make-task` in the [spec](../spec.md).

## Acceptance criteria
- [x] Selecting text in any file and choosing "Make task" creates a task file in `inbox/`
- [x] The selection becomes the Description, with a link back to the source file
- [x] The new file uses the task template and a new id

## Implementation notes
- Decided with the user (2026-10-31): "Braindump" and "Spec" buttons in the project bar open those files in the editor (spec only as a single file), so text can be selected in more than task files. A new task keeps the template's layout and headings; id, title (first line of the selection), created are set; tags, implements, depends_on become `[]`; priority is removed; Description becomes the selection plus `Source: [name](link)`; Acceptance criteria become one empty `- [ ] `; Implementation notes and Result keep the template text.
- Plan: Rust `domain/make_task.rs` builds the text and creates the file in the first column (never overwrites); command `make_task(repo_root, source, selection)` returns the new path, which the editor opens. Selection from CodeMirror in source mode and from the rendered text in read mode.
- Done: `make_task.rs` (`make_task`, `fill_template`, `title_of`, `relative_link`, `source_files`), commands `make_task` and `source_files`; editor store `selection`, `setSelection`, `makeTask`; "Make task" button in the editor header; CodeMirror reports its selection, read mode reads the rendered selection on mouse and key release; project bar buttons from `useProjectStore.sources`.
- Decision D-20261031-000940-bhg8.
- Checks: `npm run check` (82 tests), `cargo test` (101), `cargo clippy` clean. Not tried by hand in the running app.

## Result
Text selected in any open file, in source or read mode, becomes a task with "Make task" in the editor header. The task goes to `inbox/` (the first column), named from the first line of the selection, with the selection as Description and a `Source:` link back to the file, and opens in the editor so its title and fields can be adjusted. It is built from the task template, the project override included, with the template's example values replaced. The braindump and the spec now open from the project bar, so captures can be turned into tasks inside the app.

- Not yet checked by hand in the running app.
- The source link points to the file only, not to the selected lines; plain markdown has no line anchors.
- In read mode the selection is the rendered text, so markdown markup in it (links, emphasis) is lost; source mode keeps it.

### Next session
- `next/` is empty. Phase 1 candidates in the inbox: [column names in the planner block](20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md), [prompt buttons](20261030-220015-a006-prompt-buttons-for-the-task-workflow.md), [deletes to the OS trash](../inbox/20261030-220017-e886-deletes-go-to-the-os-trash.md), [full text search](20261030-220014-91bd-full-text-search.md).
