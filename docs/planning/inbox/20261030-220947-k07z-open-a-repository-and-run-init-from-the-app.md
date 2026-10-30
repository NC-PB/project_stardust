---
id: 20261030-220947-k07z
title: Open a repository and run init from the app
tags: [workspace, planning]
created: 2026-10-30
implements: [S-init]
depends_on: [20261030-220006-6602]
---

## Description
Found while building [project init](../done/20261030-220006-6602-project-init.md). No phase 1 task lets the user choose a repository: the app has no way to get the `repo_root` that every command takes, and the init offers need a dialog to appear in. The start screen with recent projects is `S-multi-project` in phase 4.

Picking a folder with the native dialog needs `tauri-plugin-dialog`, which is not among the libraries in the Constraints. Without it, the path has to be typed or pasted.

## Acceptance criteria
- [ ] The user can choose a repository folder, and the app remembers it in app settings, never in the repository
- [ ] A folder without `docs/planner.yml` offers init; after init the app shows the created and existing files
- [ ] After init the app offers to add the image root to `.gitignore` (`add_images_to_gitignore`) and the planner block to `AGENTS.md` (`write_planner_block`), each on its own

## Implementation notes

## Result
