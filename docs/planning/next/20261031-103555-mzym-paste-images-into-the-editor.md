---
id: 20261031-103555-mzym
title: Paste images into the editor
tags: [files, editor]
created: 2026-10-31
implements: [S-images]
---

## Description
A screenshot on the clipboard cannot be pasted into a task: `S-images` covers only files dropped from the OS, and the editor has no paste handler for images. Found while trying the app by hand (task [20261031-022648-jcho](../inbox/20261031-022648-jcho-try-image-drop-in-the-running-app.md)).

Pasting (Ctrl/⌘+V) an image from the clipboard should save it to the image root and insert a link, like a drop. Unlike a drop, the clipboard holds bytes without a path or name, so `import_image` (which copies from a source path) needs a sibling that takes the bytes and a generated name.

Implements `S-images` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Pasting an image (a screenshot, or an image copied in a browser or image viewer) into the source editor or the frontmatter form saves it into `images_root` and inserts `![name](link)` at the cursor, as an edit like typing; in read mode the link is appended at the end, as for a drop
- [ ] The file gets a generated name (e.g. `pasted-YYYYMMDD-HHMMSS.png`, extension from the MIME type) and the same no-overwrite suffix rule as dropped files
- [ ] Clipboard content that is not one of the image types of `S-images`, or larger than 20 MB, is not added and is named in the editor's error line; pasting text still pastes text
- [ ] A paste with both text and an image (e.g. from a web page) pastes the text
- [ ] `S-images` criteria describe paste

## Implementation notes
Checked before starting: `S-images` matches the code (drops only, no paste handler).

Done (2026-10-31):
- Rust: `images::paste_image(repo_root, images_root, file, mime, bytes, stamp)` writes `pasted-<YYYYMMDD-HHMMSS>.<ext>` (extension from the MIME type, the image types of `image_mime`; 20 MB limit) through `write_new`, the former `copy_new` now taking a writer, so drops and pastes share the create-new suffix rule. `import_image` and `paste_image` share `image_folders` and `imported`. Command `paste_image(repo_root, file, mime, data)` takes the bytes as base64 (`files::base64_decode`, beside the existing encoder), not as a JSON number array. Tests for names, suffixes, refusals and the decoder.
- Frontend: `pastedFiles` (no files while the clipboard holds plain text) and `fileBase64` in `src/lib/images.ts`; `pasteImages(files, at)` in the editor store inserts like `dropImages` and names failures in the error line; one `onPaste` on the editor pane: source mode at the cursor (also when pasting into a form field), read mode at the end. The read view is focusable (`tabIndex={-1}`) so a paste there reaches the pane. Vitest covers the helpers and the store.
- `npm run check`, `cargo test`, `cargo clippy` pass.

Open: the paste was not tried in the running app yet (a screenshot via ⌘⇧⌃4, an image copied in a browser, read mode). Then: `S-images` criteria, the decision, Result, move to `done/`.

## Result
