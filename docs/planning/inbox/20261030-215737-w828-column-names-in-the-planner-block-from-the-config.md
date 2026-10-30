---
id: 20261030-215737-w828
title: Column names in the planner block from the config
tags: [agents]
created: 2026-10-30
implements: [S-agents-block]
depends_on: [20261030-220005-24ef]
---

## Description
Found while writing the planner block ([task](../done/20261030-220005-24ef-write-the-planner-block-into-agents-md.md)).

`templates/AGENTS-block.md` names the columns `inbox/`, `next/` and `done/` literally, but `columns` and `terminal` are configurable (`S-config`). A project with other columns gets instructions that point to folders it does not have. The template has placeholders only for `{planning_root}` and `{spec_location}`.

The template is human text, so the wording needs the user's approval.

## Acceptance criteria
- [ ] The block names the configured columns and the terminal column instead of fixed folder names
- [ ] With the default config the block is unchanged
- [ ] Unit tests cover a config with other columns

## Implementation notes

## Result
