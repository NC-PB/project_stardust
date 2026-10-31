---
id: 20261031-041510-zbkq
title: Try project tabs in the running app
tags: [workspace]
created: 2026-10-31
implements: [S-multi-project]
depends_on: [20261031-021025-jf7q]
---

## Description
The multi-project workspace (task [20261031-021025-jf7q](../done/20261031-021025-jf7q-multi-project-workspace.md)) is covered by unit tests only. Try it by hand on macOS, Windows and Linux, and fix what is off.

Implements `S-multi-project` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Opening a second and third repository adds tabs; the tab bar wraps and stays readable with long or equal folder names
- [ ] Switching tabs keeps the board's tag filter, the main view, the open file with unsaved edits or a conflict, and the search query of each tab
- [ ] An agent moving a task in a hidden tab's repository shows on its board, and in its open file, when the tab is shown again; its links are rewritten while it is hidden
- [ ] Closing tabs, the start screen's recent projects, and restarting the app with several tabs open behave as `S-multi-project` says; an existing settings file with the old `repoRoot` key opens that repository as the one tab
- [ ] Switching while a large repository opens waits without freezing the window

## Implementation notes

## Result
