---
id: 20261031-021025-jf7q
title: Multi-project workspace
tags: [workspace]
created: 2026-10-31
implements: [S-multi-project]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 4. Opening a single repository exists from phase 1. This adds the workspace around it.

Implements `S-multi-project` in the [spec](../spec.md).

## Acceptance criteria
- [x] A workspace list of repositories, kept in the app settings
- [x] One tab and one board per project; switching tabs keeps each board's state
- [x] Recent projects on the start screen
- [x] Watchers run only for open projects

## Implementation notes
- Done: state model chosen (snapshot of the existing singleton project stores per hidden tab, D-20261031-041507-l55b); Rust watches every loaded tab by repository root (D-20261031-041508-9yxi); tab commands in the registry (D-20261031-041509-goga).
- Rust: `WatchState` and `SearchState` are maps by repository root; `watch::ProjectGenerations` keeps one `Generations` per project; `unwatch_project(repo_root)`, `search(repo_root, query, limit)`, `link_candidates(repo_root)`; `PlanningChanged` and `RepositoryChanged` carry `repo_root`.
- Frontend: `src/lib/workspace.ts` (pure, tested), `src/stores/workspace-store.ts` (tabs, snapshots, queued changes, settings), `src/components/project-tabs.tsx` (`ProjectTabs`, `RecentProjects`). `useProjectStore` lost `restore`, `choose`, `listen` and the `repoRoot` setting; `useSearchStore` knows its repository (`reset`). Answers of `commit`, `proposal`, `staleness`, `gate` and Stale view loads are dropped when their repository is no longer in the store; the Stale view follows only its own repository's events.
- Verified: `npm run check` (412 tests), `cargo test`, `cargo clippy --all-targets` clean.
- Not tried in the running app: see Result and inbox task 20261031-041510-zbkq.

## Result
The app now holds several projects as tabs above the project panel. "Open repository" (button, "+" in the tab bar, palette) opens the picked folder in a new tab, or shows its tab when it is open already. The open tabs and the shown one are kept in the app settings (`workspace`), the recent projects (at most 10, most recent first) in `recentProjects`; the old `repoRoot` setting is read once and becomes the one tab. On start only the shown tab is loaded; the others load when first shown.

Switching tabs saves the open file, keeps the state of every project store of the hidden tab (board with tag filter and move error, spec view: main view, expanded nodes, mind map, questions form and drafts; open file with its mode, conflict and unsaved edits; search query and results; session panel hidden or not; open panels such as doctor, archive, changelog, split, git attributes) and puts the other tab's back. Changes on disk of a hidden tab are queued and applied in order through the usual path when it is shown again, so its board, open file and conflicts follow as if it had been shown. Not kept: scroll positions of the board columns, the editor's cursor, selection and undo history (CodeMirror is set up again from the stored text), and header popups (palette, settings menu, proposals list, delete question), which close on a switch.

Closing a tab stops its watchers and drops its search index (`unwatch_project(repo_root)`) and shows the tab to its right, else to its left, else the start screen. A tab whose open file has unsaved edits (a conflict or an append-only violation) is not closed; it is shown with a message instead. The start screen (no tab open) lists the recent projects without a tab; a click opens one. The palette has Next project tab, Previous project tab, Close project tab and Open the most recent closed project; no shortcuts.

Rust watches every tab loaded in this session at once, keyed by repository root, and nothing else: a tab restored from the settings but never shown is not watched until shown, a closed tab is unwatched, and nothing runs when the app is closed.

Not tried in the running app (tests only): the tab bar's look and wrapping, switching while a large repository opens (the switch waits until the open is done), the start screen list, migration from the old `repoRoot` setting on a real settings file, and two projects changing on disk at the same time. Known limit: an answer of a check started by hand (doctor, archive or split preview, changelog draft, a move) that arrives after its tab was hidden is dropped, so for example the doctor panel of that tab can stay at "checking" until checked again; put in the inbox (task 20261031-041511-8m2d).
