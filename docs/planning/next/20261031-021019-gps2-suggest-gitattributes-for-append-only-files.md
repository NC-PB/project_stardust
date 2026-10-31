---
id: 20261031-021019-gps2
title: Suggest .gitattributes for append-only files
tags: [files]
created: 2026-10-31
implements: [S-gitattributes]
depends_on: []
---

## Description
Phase 3. 

Implements `S-gitattributes` in the [spec](../spec.md).

## Acceptance criteria
- [ ] On request, writes `merge=union` for the questions and decisions files only, for both spec forms
- [ ] Existing `.gitattributes` content is kept; the lines are added only if missing
- [ ] Task files are never included

## Implementation notes

## Result
