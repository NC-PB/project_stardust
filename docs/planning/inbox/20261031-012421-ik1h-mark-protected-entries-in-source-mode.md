---
id: 20261031-012421-ik1h
title: Mark protected entries in source mode
tags: [ideation]
created: 2026-10-31
implements: [S-decisions]
depends_on: []
---

## Description
Found while building the [append-only guard](../done/20261031-005400-todm-append-only-editing-for-questions-and-decisions.md). In long specs the refused entries are hard to find; `check_append_only` already returns their line after the edit (`now`).

## Acceptance criteria
- [ ] Refused entries are highlighted in source mode
- [ ] The highlight goes away once the save succeeds

## Implementation notes

## Result
