---
id: 20261030-220007-e420
title: File watcher with move detection
tags: [files]
created: 2026-10-30
implements: [S-watcher]
depends_on: [20261030-220003-9910]
---

## Description
Watch the planning root with `notify` and send typed events to the frontend.

Implements `S-watcher` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Changes on disk appear in the app without user action
- [ ] Moves are detected as moves by id, not as delete and create
- [ ] Bursts of events (an agent moving many files) are debounced into one update
- [ ] Tests cover create, modify, move and delete

## Implementation notes

## Result
