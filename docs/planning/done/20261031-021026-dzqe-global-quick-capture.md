---
id: 20261031-021026-dzqe
title: Global quick capture
tags: [workspace]
created: 2026-10-31
completed: 2026-10-31
implements: [S-quick-capture]
depends_on: [20261031-021025-jf7q]
---

## Description
Phase 4. 

Implements `S-quick-capture` in the [spec](../spec.md).

## Acceptance criteria
- [x] A global hotkey opens a small window, also when the app is in the background
- [x] The text is appended as a line to the braindump of the chosen project
- [x] The hotkey is configurable; a hotkey taken by another app is reported

## Implementation notes
- Started 2026-10-31. Nodes `S-quick-capture`, `S-tauri` matched the code (nothing of quick capture existed; `S-tauri` listed two plugins).
- Done: `tauri-plugin-global-shortcut` registered from Rust (`src-tauri/src/quick_capture.rs`), capture window and its capability `src-tauri/capabilities/capture.json`, append in `src-tauri/src/domain/capture.rs`, hotkey in the Settings menu and the app settings, command "Quick capture", capture form in `src/components/quick-capture.tsx`. `npm run check`, `cargo test`, `cargo clippy --all-targets` pass.
- Criteria checked against the code; the hotkey and the window were not exercised in the running app (no display in this session), see the inbox task [20261031-085720-k3qc](../inbox/20261031-085720-k3qc-try-quick-capture-in-the-running-app.md).

## Result
A global hotkey, `CommandOrControl+Shift+Space` unless set otherwise, shows a small "Quick capture" window while the app runs, also when it is in the background or minimized. The window has a text field and a project choice (the open tabs, then the recent projects without a tab; the last choice stays). Enter appends the text as one list item to the chosen project's `{planning_root}/braindump.md` (filling the template's empty `- ` on the last line), empties the field and hides the window; Escape hides it and keeps the text. Rust writes only over the text it just read (`save_text`), retrying when the file changed in between, and never creates a missing braindump; errors show in the window and the text stays. A braindump open in the main window changes on disk like any outside change (reload, or the usual conflict with unsaved edits). The command "Quick capture" opens the same window from the palette.

The hotkey is set in the Settings menu and kept in the app settings (`quickCaptureHotkey`); empty turns it off. An invalid text or a hotkey the system refuses is shown under the field. Nothing runs when the app is closed: the hotkey lives with the app, and closing the main window now quits the app, the capture window included. `tauri-plugin-global-shortcut` is used from Rust only, so the webviews got no new permission; the capture window has its own capability (`core:default`, `core:window:allow-set-theme`, `store:default`).

Tested: the line and append rules, the missing braindump, hotkey parsing (Rust); the project choice, the hotkey setting and the capture store (Vitest); the registry test covers the new command. Not tried in the running app: the hotkey with the app in front, in the background and minimized; the window's look, focus and return to the previous app; registration errors for a hotkey another app holds (Windows and X11 report it; macOS may register it anyway, so it is not reported there; Wayland has no global hotkeys for this plugin); closing the main window while the capture window exists; the capture window in a release build. Put in the inbox (task [20261031-085720-k3qc](../inbox/20261031-085720-k3qc-try-quick-capture-in-the-running-app.md)). Known limits: the capture window takes the theme when it starts, not on a later change; `S-palette` does not list "Quick capture" among its commands yet.
