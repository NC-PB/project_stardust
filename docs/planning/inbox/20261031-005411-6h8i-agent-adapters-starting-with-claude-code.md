---
id: 20261031-005411-6h8i
title: Agent adapters, starting with Claude Code
tags: [agents]
created: 2026-10-31
implements: [S-adapters]
depends_on: [20261031-005405-oomn]
---

## Description
Command locations of other agents are checked against their documentation when they are added.

Implements `S-adapters` in the [spec](../spec.md).

## Acceptance criteria
- [ ] With `adapters: [claude-code]`, the tool writes one command file per prompt to `.claude/commands/`, wrapping the same template text
- [ ] Commands take the task path or node id as argument, for example `/work <task>`
- [ ] Regenerated together with the planner block; files not created by the tool are never touched
- [ ] Never required: without adapters nothing changes

## Implementation notes

## Result
