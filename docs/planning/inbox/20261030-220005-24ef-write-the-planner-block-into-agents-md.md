---
id: 20261030-220005-24ef
title: Write the planner block into AGENTS.md
tags: [agents]
created: 2026-10-30
implements: [S-agents-block]
depends_on: [20261030-220002-5dbd, 20261030-220004-2a22]
---

## Description
Generate the agent conventions from `templates/AGENTS-block.md` with placeholders filled from the config.

Implements `S-agents-block` in the [spec](../spec.md).

## Acceptance criteria
- [ ] The block is written into `AGENTS.md` between `<!-- planner:start -->` and `<!-- planner:end -->`; content outside the markers is unchanged
- [ ] Without markers, the block is appended; without `AGENTS.md`, the file is created
- [ ] Placeholders are filled from the config; the block stays under 60 lines
- [ ] With `claude_import: true`, `@AGENTS.md` is added to `CLAUDE.md` only if the line is missing
- [ ] With `claude_mirror: true`, the block is also written into `CLAUDE.md` between the same markers
- [ ] The block is regenerated when the config changes
- [ ] Unit tests cover existing content before and after the markers

## Implementation notes

## Result
