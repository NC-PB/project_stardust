---
id: 20261031-005404-dtp7
title: Traceability between tasks and nodes
tags: [ideation, planning]
created: 2026-10-31
implements: [S-trace]
depends_on: [20261031-005358-alo6, 20261031-005359-t8qs]
---

## Description
The `implements` field is already read by the task model; this task builds the index and the views.

Implements `S-trace` in the [spec](../spec.md).

## Acceptance criteria
- [ ] A node in the spec view shows the tasks that implement it and their columns
- [ ] Lists tasks without `implements`, and ticked nodes without any task
- [ ] `implements` entries that name no existing node are reported
- [ ] The planner block keeps the rule that finishing a task updates the criteria of its nodes (`R-spec-is-truth`); a test checks the generated block contains it

## Implementation notes

## Result
