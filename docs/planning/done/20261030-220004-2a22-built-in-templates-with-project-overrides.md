---
id: 20261030-220004-2a22
title: Built in templates with project overrides
tags: [platform]
created: 2026-10-30
implements: [S-templates]
depends_on: [20261030-220002-5dbd]
completed: 2026-10-30
---

## Description
Embed the files from `templates/` in the app and resolve per project overrides.

Implements `S-templates` in the [spec](../spec.md).

## Acceptance criteria
- [x] Templates for spec, task, config, planner block and prompts ship inside the app binary
- [x] If `templates_dir` contains `task.md` or `spec.md`, those are used instead of the built in ones
- [x] The planner block and the prompts are never taken from `templates_dir`
- [x] Unit tests cover built in and override resolution

## Implementation notes
- Done: `domain/templates.rs`, command `load_template`, `config.rs` reads its defaults through `TemplateKind::Config`.
- Checks: `cargo test` (51 passed), `cargo clippy --all-targets`, `npm run check`.

## Result
`src-tauri/src/domain/templates.rs` embeds all five files of `templates/` with `include_str!`. In TypeScript: `loadTemplate(repoRoot, kind)` with `kind` `"spec" | "task" | "config" | "agents-block" | "prompts"` returns `{ kind, text, override_path, issue }`.

- Only `task` and `spec` are looked up in `templates_dir` (from `docs/planner.yml`); a file there wins over the built in one.
- An override that exists but cannot be read gives the built in text plus an `issue` (D-20261030-215352-tr40).
- `load_template` loads the config on every call; callers that need many templates can keep using `templates::resolve` with one loaded config once a project store exists.

### Next session
- `next/` is empty. Candidates from the inbox: [planner block into AGENTS.md](20261030-220005-24ef-write-the-planner-block-into-agents-md.md) and [project init](20261030-220006-6602-project-init.md) can now use `templates::resolve`.
