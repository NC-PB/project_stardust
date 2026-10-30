---
id: 20261030-220007-e420
title: File watcher with move detection
tags: [files]
created: 2026-10-30
implements: [S-watcher, S-agents-block]
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
- [ ] A change to `docs/planner.yml` (outside the planning root) regenerates the planner block through `agents_block::write_planner_block`; moved here from the [planner block task](../done/20261030-220005-24ef-write-the-planner-block-into-agents-md.md) (D-20261030-220523-8397)

## Implementation notes

## Result
