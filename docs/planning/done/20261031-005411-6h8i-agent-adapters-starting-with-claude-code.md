---
id: 20261031-005411-6h8i
title: Agent adapters, starting with Claude Code
tags: [agents]
created: 2026-10-31
completed: 2026-10-31
implements: [S-adapters]
depends_on: [20261031-005405-oomn]
---

## Description
Command locations of other agents are checked against their documentation when they are added.

Implements `S-adapters` in the [spec](../spec.md).

## Acceptance criteria
- [x] With `adapters: [claude-code]`, the tool writes one command file per prompt to `.claude/commands/`, wrapping the same template text
- [x] Commands take the task path or node id as argument, for example `/work <task>`
- [x] Regenerated together with the planner block; files not created by the tool are never touched
- [x] Never required: without adapters nothing changes

## Implementation notes
- Done: `src-tauri/src/domain/adapters.rs` (`write_adapters`, `render_claude_command`, `is_generated`), called at the end of `agents_block::write_planner_block`; `prompts::fill_from_config` shared with `fill_prompt`. Tests in `adapters.rs`. `npm run check`, `cargo test`, `cargo clippy --all-targets` pass.
- Command format checked against the Claude Code docs (code.claude.com/docs/en/slash-commands) on 2026-10-31: `.claude/commands/<name>.md` gives `/<name>`; frontmatter `description`, `argument-hint`; `$ARGUMENTS` is everything typed after the command; unknown frontmatter fields are ignored without an error. `.claude/commands/` is called the older format but still works; skills are recommended for new work.
- Open: nothing for this task. Next step: none.

## Result
With `adapters: [claude-code]` in `docs/planner.yml`, writing the planner block also writes nine files `.claude/commands/<prompt>.md` (`work-on-task`, `verify-task`, `verify-area`, `handoff`, `triage-inbox`, `structure-this`, `interview-me`, `integrate-answers`, `generate-tasks`). Each has frontmatter `description`, `argument-hint` (`"<task path>"` or `"<node id>"`, only where the prompt needs one) and the marker line `planner: generated`, then the prompt text filled from the config, with `{task_path}` and `{node_id}` replaced by `$ARGUMENTS`; so `/work-on-task docs/planning/next/x.md` or `/verify-area S-board`. A test checks that every command body equals `fill_prompt` with `$ARGUMENTS` as input.

The files are written wherever the block is: the watcher on a config change, the `write_planner_block` command (init offer), and Split spec. A file at one of these paths without the marker line is skipped silently; a generated file is rewritten only when its content changes and keeps CRLF. Without adapters nothing under `.claude/` is read or written. Removing `claude-code` from `adapters` leaves the files in place (`R-no-destroy`).

Not tried in the running app or in Claude Code itself: the files were only checked by unit tests in temporary folders. Skipped files are not reported in `BlockReport`. If the block is already current, the init offer does not appear, so adding `adapters` only takes effect through the watcher (editing `docs/planner.yml` while the app is open) or a Split. This repository still has `adapters: []`.
