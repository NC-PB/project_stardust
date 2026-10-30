---
id: 20261030-220947-k07z
title: Open a repository and run init from the app
tags: [workspace, planning]
created: 2026-10-30
implements: [S-init]
depends_on: [20261030-220006-6602]
completed: 2026-10-30
---

## Description
Found while building [project init](../done/20261030-220006-6602-project-init.md). No phase 1 task lets the user choose a repository: the app has no way to get the `repo_root` that every command takes, and the init offers need a dialog to appear in. The start screen with recent projects is `S-multi-project` in phase 4.

Picking a folder with the native dialog needs `tauri-plugin-dialog`, which is not among the libraries in the Constraints. Without it, the path has to be typed or pasted.

## Acceptance criteria
- [x] The user can choose a repository folder, and the app remembers it in app settings, never in the repository
- [x] A folder without `docs/planner.yml` offers init; after init the app shows the created and existing files
- [x] After init the app offers to add the image root to `.gitignore` (`add_images_to_gitignore`) and the planner block to `AGENTS.md` (`write_planner_block`), each on its own

## Implementation notes
- The user chose `tauri-plugin-dialog` (D-20261030-224813-t807); `tauri-plugin-store` keeps the chosen folder.
- Done: plugins registered in `lib.rs`, permissions `dialog:allow-open` and `store:default`; `src/lib/project.ts` (status, offers, labels), `src/stores/settings.ts`, `src/stores/project-store.ts`, `src/components/project-panel.tsx`, wired into `App.tsx`. `init_project` now refuses a missing folder, since a remembered folder may have been deleted.
- Checks: `cargo test` (72 passed), `cargo clippy --all-targets`, `npm run check` (16 tests). `npm run tauri dev` starts with both plugins and no errors; the native dialog was not clicked through, the store tests cover the flow with mocks.

## Result
The app now has a project panel: "Open repository" picks a folder, the folder is remembered in app settings and reopened on start, a folder without `docs/planner.yml` offers Initialize, and after init the created and existing paths, issues and the two offers (Add / Not now) are shown.

- `useProjectStore` holds `repoRoot`, the config report, the last init report and the pending offers; the board task can read `repoRoot` and `config` from it.
- An offer whose command fails stays and shows the error.
- The panel replaces the version button of the scaffold; the version is still shown.

### Next session
- `next/` is empty. The [board](20261030-220008-6c7c-board-columns-and-cards.md) can now take `repoRoot` and the config from `useProjectStore`; it also wants the [file watcher](20261030-220007-e420-file-watcher-with-move-detection.md) for live updates.
- Try the folder picker once by hand: `npm run tauri dev`, Open repository, cancel and pick.
