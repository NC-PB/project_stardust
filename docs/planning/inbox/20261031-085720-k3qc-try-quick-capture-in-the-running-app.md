---
id: 20261031-085720-k3qc
title: Try quick capture in the running app
tags: [workspace]
created: 2026-10-31
implements: [S-quick-capture]
depends_on: [20261031-021026-dzqe]
---

## Description
Quick capture (task [20261031-021026-dzqe](../done/20261031-021026-dzqe-global-quick-capture.md)) is covered by unit tests only; the global hotkey and the capture window were never exercised. Try it by hand on macOS, Windows and Linux (X11 and Wayland), in `tauri dev` and in a release build, and fix what is off.

Implements `S-quick-capture` in the [spec](../spec.md).

## Acceptance criteria
- [ ] The default hotkey shows the capture window with the focus in the text field, with the app in front, in the background and minimized
- [ ] Enter appends the line to the chosen project's braindump and hides the window; the braindump open in the main window reloads, or shows a conflict with unsaved edits
- [ ] A hotkey another app holds is reported in the Settings menu where the system refuses it; what macOS does is written down
- [ ] Closing the main window while the capture window exists quits the app
- [ ] The capture window follows the theme and returns the focus sensibly after it hides

## Implementation notes

## Result
