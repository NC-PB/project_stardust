---
id: 20261030-220011-a93f
title: Markdown editor with source and read mode
tags: [editor]
created: 2026-10-30
completed: 2026-10-30
implements: [S-editor-core, S-editor-layout]
depends_on: [20261030-220003-9910]
---

## Description
CodeMirror 6 via `@uiw/react-codemirror`, rendering with remark/rehype.

Implements `S-editor-core`, `S-editor-layout` in the [spec](../spec.md).

## Acceptance criteria
- [x] Two modes per file, toggled with one shortcut: styled source and rendered read
- [x] Styled source: sized headings, highlighted task lists, links, inline code and frontmatter; markup stays visible
- [x] Read mode renders markdown with GFM task lists, images and Mermaid blocks
- [x] Frontmatter is editable as a form on top of the file
- [x] No split view

## Implementation notes
- Decided with the user (2026-10-30): autosave 1 s after typing stops, on Cmd/Ctrl+S and when switching or closing the file; the editor is a pane beside the board, opened by clicking a card title; read mode loads local images through a Rust command returning a data URL (the CSP already allows `img-src data:`). Recorded as D-20261030-233646-imm8.
- Rust `domain/files.rs`: `read_text`, `write_existing` (never creates a file, so a pending save cannot recreate a moved task at its old place), `image_data_url` (inside the repository only, no remote sources, own base64). Commands `read_text`, `write_text`, `parse_task_text`, `set_field_in_text`, `remove_field_in_text`, `read_image`; the form reuses `task::parse_task` and `task::set_field` on the unsaved text.
- TypeScript `lib/editor.ts` (frontmatter split, form values and checks, following moves, shortcuts, link resolution), `stores/editor-store.ts` (open file, autosave, saves run one after another), `components/editor.tsx` (CodeMirror source mode, read mode with `react-markdown`, `remark-gfm`, Mermaid loaded on first use). The project store passes watcher batches to the editor and closes it when another repository opens.
- Checks: `npm run check` (70 tests), `cargo test` (92), `cargo clippy` clean, `npm run build` (main chunk 1.1 MB, a warning only). `npm run tauri dev` starts and shows the board; the editor itself was not tried by hand, since this session cannot click in the window.

## Result
Clicking a card title opens the task file in a pane beside the board. Source mode is CodeMirror with sized headings, coloured task markers, links and inline code, and the frontmatter as a muted block; markup stays visible. Ctrl+E (⌘E on macOS) switches to read mode, which renders the body with GFM task lists, tables, local images and Mermaid diagrams. A form above the text edits the frontmatter fields. There is no split view. Edits save 1 s after typing stops, on Ctrl/⌘+S, and when another file opens or the pane closes.

- Not yet checked by hand in the running app.
- Proposal actions in read mode (`S-editor-layout`) are left to `S-proposals`.
- A removed file with unsaved edits stays open and cannot be closed; moving a card while its file has unsaved edits lets the next save overwrite the `completed` change. Both belong to [reload and conflict handling](20261030-220012-ff26-reload-and-conflict-handling.md), which so far only gets `editor-store.apply` for moves and removals; changed files are not yet reloaded.
- `S-frontend` still lists CodeMirror and remark/rehype as "come with their tasks"; that node was outside this task.

### Next session
- [Reload and conflict handling](20261030-220012-ff26-reload-and-conflict-handling.md) is the remaining task in `next/`. The store already keeps `saved` (the text on disk) beside `text`; a `modified` change for the open path is where reloading starts.
