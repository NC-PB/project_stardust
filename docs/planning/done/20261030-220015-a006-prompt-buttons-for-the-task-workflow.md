---
id: 20261030-220015-a006
title: Prompt buttons for the task workflow
tags: [agents]
created: 2026-10-30
completed: 2026-10-31
implements: [S-prompts]
depends_on: [20261030-220004-2a22]
---

## Description
Phase 1 subset: Work on task, Verify task, Handoff, Triage inbox. The ideation prompts follow in phase 2.

Implements `S-prompts` in the [spec](../spec.md).

## Acceptance criteria
- [x] Each button fills the template from `templates/prompts.md` with the current task and config and copies it to the clipboard
- [x] A short notice confirms the copy
- [x] Work on task, Verify task and Handoff are available on a task; Triage inbox on the inbox column

## Implementation notes
- Plan: Rust `domain/prompts.rs` reads the prompts from the built-in `templates/prompts.md` (`## Name` + fenced block) and fills `{planning_root}`, `{task_path}` (relative to the repository root), `{spec_location}`, `{node_id}`; an unfilled placeholder is an error. Command `fill_prompt(repo_root, prompt, task_path)`. Frontend copies with `navigator.clipboard` (no clipboard plugin in the Constraints) and shows a short notice. Work on task, Verify task, Handoff in the editor when the open file is a task in a column; Triage inbox on the first column's header.
- The Triage inbox prompt names `inbox/` and `next/` literally; configurable names are task 20261030-215737-w828.
- Done: `prompts.rs` (`Prompt` with all nine headings, `PromptInput`, `fill_prompt`), command `fill_prompt`; `lib/prompts.ts` (`PROMPT_LABELS`, `TASK_PROMPTS`, `taskPathOf`); `stores/prompt-store.ts` (clipboard write started within the click, notice for `NOTICE_MS`); `PromptBar` in the editor, Triage inbox on the first column, `PromptNotice` in `App`.
- Decision D-20261031-001344-gumt.
- Checks: `npm run check` (88 tests), `cargo test` (105), `cargo clippy` clean. Not tried by hand in the running app; the clipboard write in particular needs a hand check on macOS.

## Result
Prompts can be copied from the app. While a task file is open, the editor shows "Copy prompt" with Work on task, Verify task and Handoff, filled with the task's path relative to the repository. The first column has a Triage inbox button. A notice confirms each copy or says why nothing was copied; a prompt with a missing value is never copied half filled.

- Not yet checked by hand in the running app, the clipboard on macOS included.
- The other five prompts are fillable in Rust but have no button; they come with phase 2.
- Triage inbox still names `inbox/` and `next/` literally, as the template does; see [column names in the planner block](20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md), which should cover `prompts.md` too.

### Next session
- `next/` is empty. Remaining phase 1 tasks in the inbox: [column names in the planner block](20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md), [deletes to the OS trash](20261030-220017-e886-deletes-go-to-the-os-trash.md), [full text search](20261030-220014-91bd-full-text-search.md), [open a terminal](20261030-220016-3964-open-terminal-in-the-repository.md), [light and dark theme](20261030-220018-573e-light-and-dark-theme.md).
