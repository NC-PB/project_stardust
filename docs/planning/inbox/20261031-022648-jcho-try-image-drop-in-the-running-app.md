---
id: 20261031-022648-jcho
title: Try image drop in the running app
tags: [files, editor]
created: 2026-10-31
implements: [S-images]
depends_on: [20261031-021016-xuut]
---

## Description
Image drop (task [20261031-021016-xuut](../done/20261031-021016-xuut-images-drop-render-missing-badge.md)) is covered by unit tests only. The Tauri drag-drop events, the drop position (physical pixels divided by `devicePixelRatio`) and the pane ring were never tried in the running app. Try them by hand on macOS, Windows and Linux, on a normal and a high DPI screen, and fix what is off.

Implements `S-images` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Dropping a PNG from the file manager onto the editor in source mode inserts the link at the line under the pointer, on each platform
- [ ] Dropping onto the frontmatter form inserts at the cursor; dropping in read mode appends at the end
- [ ] Dropping onto the board or the spec view does nothing; the ring shows only while files are over the editor pane
- [ ] Dropping a text file shows "Not added" in the editor's error line
- [ ] Card drag on the board still works with Tauri's drag-drop handling on, on Windows too

## Implementation notes

## Result
