---
id: 20261031-021021-piw1
title: Staleness flags
tags: [planning]
created: 2026-10-31
implements: [S-staleness]
depends_on: []
---

## Description
Phase 4. 

Implements `S-staleness` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Tasks in the ready column older than `stale_after_days` are flagged
- [ ] Spec files whose `reviewed` date is older than `review_after_days` are flagged
- [ ] Code paths mentioned in tasks that do not exist in the repository are flagged
- [ ] Flags show on cards and files

## Implementation notes

## Result
