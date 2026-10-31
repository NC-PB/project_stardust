---
id: 20261031-021014-txlv
title: Repair broken links by id
tags: [files]
created: 2026-10-31
implements: [S-links]
depends_on: [20261031-021013-ihmk]
---

## Description
Phase 3. 

Implements `S-links` in the [spec](../spec.md).

## Acceptance criteria
- [ ] A broken link whose target filename contains an id is resolved by that id anywhere in the planning root
- [ ] The link is repaired and a notice names the file and the new target
- [ ] A link that cannot be resolved stays as it is and is reported to the doctor

## Implementation notes

## Result
