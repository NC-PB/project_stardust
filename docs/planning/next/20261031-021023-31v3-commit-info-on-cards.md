---
id: 20261031-021023-31v3
title: Commit info on cards
tags: [planning]
created: 2026-10-31
implements: [S-commit-info, S-board-card]
depends_on: []
---

## Description
Phase 4. 

Implements `S-commit-info`, `S-board-card` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Cards show how many commits mention the task id and the date of the last one, from read-only `git log` (`R-no-git-writes`)
- [ ] Information only: a mention never moves a card or marks it done
- [ ] Without git, or outside a repository, nothing is shown and nothing fails

## Implementation notes

## Result
