---
id: 20261031-021013-ihmk
title: Rewrite links when a file moves
tags: [files]
created: 2026-10-31
implements: [S-links]
depends_on: []
---

## Description
Phase 3. Every move in the app (drag and drop, archive) goes through this. Moves by agents are seen by the watcher and handled the same way. Split spec already rewrites links into the spec; reuse or replace that code rather than keeping two mechanisms.

Implements `S-links` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Links are relative markdown links
- [ ] Moving a file, in the app or on disk, rewrites every link to it in the planning root
- [ ] Links inside the moved file are rewritten so they still resolve from the new location
- [ ] Only the link targets change; nothing else in any file
- [ ] Tests cover moves between columns, into the archive and into subfolders

## Implementation notes

## Result
