---
id: 20261031-114211-k8pw
title: No text prediction in the palette field
tags: [workspace]
created: 2026-10-31
implements: [S-palette]
---

## Description
On macOS, typing in the command palette shows the system's inline text prediction bubble (for example "Session ×" under the field), which covers the first entry. The palette, search and capture fields are command inputs, not prose. Found while trying the new window layout ([20261031-111041-wl8c](../done/20261031-111041-wl8c-window-layout-and-visual-identity.md)).

## Acceptance criteria
- [ ] The palette, search and quick capture fields set `autoComplete="off"`, `autoCorrect="off"` and `spellCheck={false}`, and macOS shows no prediction bubble in them
- [ ] Tried in the running app on macOS

## Implementation notes

## Result
