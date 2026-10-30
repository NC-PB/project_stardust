---
id: 20261030-220002-5dbd
title: Read and validate planner.yml
tags: [workspace]
created: 2026-10-30
implements: [S-config]
depends_on: [20261030-220000-0822]
completed: 2026-10-30
---

## Description
Load `docs/planner.yml` into a typed config shared by Rust and TypeScript.

Implements `S-config` in the [spec](../spec.md).

## Acceptance criteria
- [x] Every key is optional; missing keys take the defaults from `templates/planner.yml`
- [x] An invalid value produces a readable error naming the key; the app keeps running with defaults
- [x] Folders in `columns` that do not exist under the planning root are reported
- [x] The config type is available in TypeScript through the generated bindings
- [x] Unit tests cover defaults, a full file and invalid values

## Implementation notes
- 2026-10-30: `src-tauri/src/domain/config.rs`, YAML via `serde_norway` (D-20261030-214550-gl67). Values are read from an order-preserving YAML mapping so issues come out in file order (`serde_json::Map` sorted them).
- Done: all criteria. `cargo test` (28 tests, 12 new, one loads this repository's own `docs/planner.yml`), clippy clean, `npm run check` passes. `S-config` criteria updated. Nothing open.

## Result
`load_config(repo_root)` reads `docs/planner.yml` and never fails. It returns `{ config, found, issues, missing_columns }`; each issue is `{ key, message }`, e.g. `stale_after_days: invalid type: string "soon", expected a whole number`. In TypeScript: `commands.loadConfig(repoRoot)` returning `ConfigReport_Serialize`.

- Defaults are parsed from `templates/planner.yml` (`include_str!`); a test keeps the template complete and valid.
- Invalid keys fall back one by one; unknown keys are reported; a `terminal` outside `columns` becomes the last column; columns without a folder are listed.
- `spec` accepts `auto`, `file`, `folder`. The template comment only mentions `auto`.
- specta emits `_Serialize` and `_Deserialize` variants for `ConfigReport` and `ConfigIssue` because of the `Option` key; use the `_Serialize` type, which is what the command returns.
- `new_id` in `ids.rs` still takes the planning root from its caller; callers now get it from `config.planning_root`.

### Next session
- `next/` is empty. Now unblocked: [task file model](20261030-220003-9910-task-file-model-frontmatter-and-sections.md) and [built in templates](../next/20261030-220004-2a22-built-in-templates-with-project-overrides.md); the templates task can reuse the `include_str!` pattern from `config.rs`.
