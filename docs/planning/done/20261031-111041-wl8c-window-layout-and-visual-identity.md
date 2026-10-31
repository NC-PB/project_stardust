---
id: 20261031-111041-wl8c
title: Window layout and visual identity
tags: [frontend, layout]
created: 2026-10-31
completed: 2026-10-31
implements: [S-window-layout, S-session-panel, S-multi-project, S-theme, S-init, S-make-task, S-trace, S-archive, S-changelog, S-spec-file, S-spec-split, S-terminal, S-watcher, S-links, S-doctor, S-gitattributes, S-palette]
---

## Description
The window stacks ten blocks above the work area: header, project tabs, project panel (path, buttons, planning root, up to seven tool buttons, tool panels opening inline, status lines), view switch, search, session panel, then board and editor, then the version. The board and the open file get well under half of the window. Asked for by the user on 2026-10-31: "The UI has grown too clunky. Too much in one view, the necessary things are only visible in a small portion of the screen."

Give the work area the whole window and a visual identity of its own, as agreed with the user (layout and visual direction both accepted as proposed):

- One top bar: project tabs, search, proposals, commands, settings (the theme switch moves into the settings menu).
- A left rail: Board, Spec, Stale, Session and a Project menu holding the former project bar actions.
- The right pane holds the open file, the project tool panels (doctor, archive, changelog, split spec, git attributes) above it, or the session brief when no file is open; it collapses when it has nothing to show. A handle resizes it; the width is kept in the app settings.
- A status bar: repository path, planning root, opening, watcher errors, the last change on disk, link reports, version.
- Fog palette (fog chrome, paper surfaces, ink text, ink blue for selection, sodium only for attention); UI in Atkinson Hyperlegible Next, ids and paths in Geist Mono, rendered documents in Literata.

Implements a new node `S-window-layout`; changes where `S-session-panel`, `S-multi-project`, `S-theme` and `S-init` place things.

> **Proposal:** Add a Structure node `S-window-layout` under Workspace for the window's regions, and rewrite "project bar" and "project panel" in the criteria of `S-make-task`, `S-archive`, `S-changelog`, `S-spec-file`, `S-spec-split`, `S-terminal`, `S-watcher`, `S-links`, `S-doctor`, `S-gitattributes`, `S-multi-project` and `S-palette` as the Project menu, the status bar or the work area. Accepted by the user on 2026-10-31 together with the layout.

## Acceptance criteria
- [x] Above the work area there is one bar of at most 40 px; below it, at most a 24 px status bar
- [x] Board, Spec and Stale switch from the rail; Session shows or hides the session brief; the Project menu holds every former project bar action and runs them through their commands
- [x] With no file open the right pane shows the session brief, or nothing (the pane collapses) when the brief is hidden; with a file open, Session shows the brief over the file until a file is opened or it is hidden
- [x] The project tool panels show at the top of the right pane, not above the board
- [x] The pane width is resizable with the pointer and the arrow keys and kept in the app settings
- [x] Init, its report and the offers show at the top of the work area; the start screen lists recent projects
- [x] Colours, fonts and both themes follow the plan; no `amber-*` or neutral shadcn colours remain in components
- [x] `npm run check` passes; the spec nodes describe the new places

## Implementation notes
Checked before starting: no node described the window as a whole; the project bar, session panel and theme switch places were as the nodes said.

Done (2026-10-31):
- Shell: `src/App.tsx` is top bar, rail, work area, right pane, status bar. `ProjectPanel` split into `ProjectNotices` (work area) and `StatusBar`; the project bar buttons of the tool components are gone, their panels render in `RightPane`. `ViewSwitch` is the rail's view group; `Rail` adds Session and the Radix `ProjectMenu` (open state `projectMenu` in `useMenuStore`, closed on tab switch).
- Session: `useSessionStore.over` shows the brief over the open file; `paneContent` in `src/lib/layout.ts` decides the pane; `session.show`/`session.hide` follow it. Command names "Show session", "Hide session".
- Pane width: `useLayoutStore` (`paneWidth` in the app settings, written 400 ms after the last change); `ResizeHandle` is a focusable separator.
- Look: tokens in `src/index.css` (fog palette, both themes, `attention` for sodium, `column`), fonts Atkinson Hyperlegible Next, Geist Mono, Literata (`@fontsource-variable/geist` removed), `code-id` helper, serif read mode. No `amber-*` left in components.
- Clutter found in the running app and fixed: spec tree rows show a task count until expanded, Verify area on hover or focus; backlinks folded to one line; long session Result folded; doctor finding paths wrap.
- Tests: `src/lib/layout.test.ts`. `npm run check` passes (447 tests). Tried in the running app (`npm run tauri dev`) in light and dark: board, spec view, session brief, read mode, Project menu, Doctor panel, dragging the pane edge (width saved).

Not tried in the running app: init and offers in the work area, the start screen, the link report, keyboard resizing, a window under about 1000 px.

## Result
The window now gives the board or spec and the open file almost all of its height: one 40 px top bar, a rail, the work area, a resizable right pane and a 24 px status bar replace the ten stacked blocks. The project bar became the Project menu in the rail, the tool panels open at the top of the right pane, and the session brief fills the right pane while no file is open. New look: fog palette in both themes, Atkinson Hyperlegible Next for the UI, Geist Mono for ids and paths, Literata for rendered markdown. New node `S-window-layout`, decision D-20261031-113012-q4fz, glossary terms Rail, Project menu, Right pane, Status bar, Session brief. Follow-ups in `inbox/`: the frontmatter form on non-task files, macOS text prediction in the palette field.
