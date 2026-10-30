---
id: 20261030-215737-w828
title: Column names in the planner block from the config
tags: [agents]
created: 2026-10-30
completed: 2026-10-31
implements: [S-agents-block]
depends_on: [20261030-220005-24ef]
---

## Description
Found while writing the planner block ([task](../done/20261030-220005-24ef-write-the-planner-block-into-agents-md.md)).

`templates/AGENTS-block.md` names the columns `inbox/`, `next/` and `done/` literally, but `columns` and `terminal` are configurable (`S-config`). A project with other columns gets instructions that point to folders it does not have. The template has placeholders only for `{planning_root}` and `{spec_location}`.

The template is human text, so the wording needs the user's approval.

## Acceptance criteria
- [x] The block names the configured columns and the terminal column instead of fixed folder names
- [x] With the default config the block is unchanged
- [x] Unit tests cover a config with other columns

## Implementation notes
- Decided with the user (2026-10-31): new = the first column, ready for you = the second, finished = the terminal column, counted without the terminal; with one column before the terminal it is both new and ready. `templates/AGENTS-block.md` and `templates/prompts.md` get placeholders `{columns}`, `{new_column}`, `{ready_column}`, `{terminal_column}`; the default output stays the same byte for byte.
- Done: `domain/columns.rs` (`column_roles`, `columns_line`, `fill_columns`), used by `agents_block::render_block` and `prompts::fill_prompt`. Placeholders in `templates/AGENTS-block.md` (five places) and `templates/prompts.md` (Triage inbox, Generate tasks, the placeholder list).
- Tests: other columns in the block and in the prompts, roles by position, a terminal column that is not last, one open column. The default block is checked against this repository's `AGENTS.md` by `init::tests::this_repository_needs_no_init`.
- Decision D-20261031-001850-0g9f.
- Checks: `cargo test` (112), `cargo clippy` clean, `npm run check` (88).

## Result
The planner block and the prompts now name the configured columns. The first column is where new tasks go, the second is ready for you, and the terminal column is finished; other columns are listed without a role. With the default config the block is unchanged byte for byte, so `AGENTS.md` here did not change. Triage inbox and Generate tasks use the same names.

- The prompt headings ("Triage inbox") and button labels keep the word inbox.

### Next session
- `next/` is empty. Remaining phase 1 tasks in the inbox: [deletes to the OS trash](20261030-220017-e886-deletes-go-to-the-os-trash.md), [full text search](20261030-220014-91bd-full-text-search.md), [open a terminal](20261030-220016-3964-open-terminal-in-the-repository.md), [light and dark theme](20261030-220018-573e-light-and-dark-theme.md).
