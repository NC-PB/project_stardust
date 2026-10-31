---
id: 20261031-021016-xuut
title: "Images: drop, render, missing badge"
tags: [files, editor]
created: 2026-10-31
completed: 2026-10-31
implements: [S-images]
depends_on: []
---

## Description
Phase 3. Images live in the image root, excluded from git (D-20260919-104200-9f03).

Implements `S-images` in the [spec](../spec.md).

## Acceptance criteria
- [x] Dropping an image into the editor copies it to the image root and inserts a relative link
- [x] A name clash gets a suffix; an existing image is never overwritten (`R-no-destroy`)
- [x] Images render inline in read mode
- [x] A missing image shows a badge instead of a broken layout

## Implementation notes
- Found: read mode already rendered local images as `data:` URLs (`read_image`) with a text notice for any failure; nothing handled drops.
- Done: Rust `domain/images.rs` (`import_image`, copy with create-new and `-N` suffix, relative percent-encoded link), command `import_image`; `read_image` returns `ImageRead` (`shown` / `missing`); `src/lib/images.ts` (insertion, drop point, badge text); `dropImages` in the editor store; `useImageDrop` (Tauri `onDragDropEvent`) and the badge in `editor.tsx`; `max-width` for read mode images.
- Open: trying the drop in the running app, see inbox task [20261031-022648-jcho](../inbox/20261031-022648-jcho-try-image-drop-in-the-running-app.md).

## Result
Dropping files from the OS onto the open editor pane now adds them as images. Tauri's webview drag-drop events deliver the paths (the DOM gets no files with Tauri's default drag-drop handling; the board's dnd-kit drag uses pointer events, so it is unaffected). For each file Rust `import_image` checks it is an image by extension and at most 20 MB, copies it into `images_root` (created when missing) under its name or the first free `stem-N.ext`, each name claimed with `create_new` so nothing is overwritten, and returns `![stem](relative/link)` from the open file. A file already in the image root is linked without a copy. Source mode inserts the links on their own lines at the pointer (at the cursor over the form, never inside the frontmatter); read mode appends them at the end; failures go to the editor's error line. Read mode images are capped to the pane width; a missing file shows a dashed "Missing image" badge with the path in the tooltip, a refused source an "Image not shown" badge with the reason.

Verified with `cargo test` (6 new tests in `images.rs`, updated `files.rs` tests), `cargo clippy --all-targets` (clean), `npm run check` (267 tests, incl. new `src/lib/images.test.ts` and two editor store tests). Not tried in the running app: the drag-drop events, the drop position on normal and high DPI screens, the ring and the badge were never seen on any platform; drag and drop cannot be driven headless here. Inbox task 20261031-022648-jcho covers that. The `S-editor-layout` criterion still says refused images "show a notice"; it is now the badge (noted in D-20261031-022559-5bb8, node not touched).
