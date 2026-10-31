---
id: 20261031-034549-r7cw
title: Try the command palette in the running app
tags: [workspace]
created: 2026-10-31
implements: [S-palette]
depends_on: [20261031-021020-xla9]
---

## Description
The command palette (task [20261031-021020-xla9](../done/20261031-021020-xla9-command-palette.md)) is covered by unit tests only. The dialog, its focus handling and the shortcuts were never tried in the running app. Try them by hand on macOS, Windows and Linux, and fix what is off.

Implements `S-palette` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Ctrl/⌘+K opens the palette from the board, the spec view, the search box and with the focus in the source editor; the focus goes back where it was on Escape, on a click outside and after running a command that does not move it
- [ ] Running "Search planning files" puts the focus into the search box; "Settings: terminal" opens the Settings menu, which still opens and closes by its own click
- [ ] Copying a prompt from the palette reaches the clipboard on WebKit (macOS, Linux), where a write counts only during the key or click event
- [ ] Ctrl/⌘+S, Ctrl/⌘+E and Ctrl/⌘+Z behave as before in source and read mode; Ctrl/⌘+Z in the source editor still undoes typing
- [ ] A screen reader announces the chosen entry (combobox with `aria-activedescendant`)

## Implementation notes

## Result
