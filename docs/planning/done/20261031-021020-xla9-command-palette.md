---
id: 20261031-021020-xla9
title: Command palette
tags: [workspace]
created: 2026-10-31
implements: [S-palette]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 3. 

Implements `S-palette` in the [spec](../spec.md).

## Acceptance criteria
- [x] Every command of the app is reachable from the palette, opened with one shortcut
- [x] Fuzzy matching on command names; each entry shows its own shortcut
- [x] A test fails when a command is registered without a palette entry

## Implementation notes
- Done: registry `COMMANDS` (40 commands) in `src/lib/commands.ts`; fuzzy matcher and shortcut keys in `src/lib/palette.ts`; context from the stores, run functions and the window key handler in `src/stores/command-store.ts`; header popups and the delete question in `src/stores/menu-store.ts`; the palette and a "Commands" header button in `src/components/command-palette.tsx`. Buttons of the project bar, view switch, theme switch, spec view, session panel, editor header, prompt rows, board triage and proposal undo call `runCommand`. The editor's and the proposal undo's own key handlers are gone; `isShortcut` replaced by `matchesShortcut`.
- Open: nothing for the criteria. Not tried in the running app, see the inbox task [Try the command palette in the running app](../inbox/20261031-034549-r7cw-try-the-command-palette-in-the-running-app.md).

## Result
Ctrl/⌘+K (or "Commands" in the header) opens a palette over the 40 registered commands available in the current state: the project bar actions, search, proposals list, main views, spec view toggles, session panel, editor actions, the prompts that need no node, themes and the terminal setting. Typing filters by a fuzzy match on the name (tested matcher, no new dependency), matched characters in bold, each entry with its shortcut (⌘K / Ctrl+K form); arrow keys, Enter and Escape work, a click outside closes, the focus goes back. Buttons and the shortcuts Ctrl/⌘+S, E, Z, K run through the same registry. Tests: `src/lib/palette.test.ts`, `src/lib/commands.test.ts` (every registered command is listed in at least one of six app states, and a command registered with no reachable entry is shown to fail; unique ids, names and shortcuts), `src/stores/command-store.test.ts` (run functions match the registry, context read from the stores, runs and shortcuts, and a source scan that fails when any file but the palette and the registry listens for window keys). Limits: a button that calls a store action instead of its command is not detected; item actions (Verify area of a node, opening cards, hits, findings; buttons of previews, notices, conflict bars, init offers) are not commands by definition. Behaviour change: Ctrl/⌘+Z undoes a proposal outside text fields in either mode, Ctrl/⌘+S and E act only with a file open. `npm run check` and `vite build` pass; no Rust changed. Not tried in the running app: the palette dialog, focus handling, the shortcuts inside CodeMirror and the controlled Settings `details`. `S-palette` criteria rewritten; decisions D-20261031-034547-p4lt and D-20261031-034548-k9xe; Glossary terms Command and Command palette.
