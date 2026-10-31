---
id: 20261031-005404-dtp7
title: Traceability between tasks and nodes
tags: [ideation, planning]
created: 2026-10-31
implements: [S-trace]
depends_on: [20261031-005358-alo6, 20261031-005359-t8qs]
completed: 2026-10-31
---

## Description
The `implements` field is already read by the task model; this task builds the index and the views.

Implements `S-trace` in the [spec](../spec.md).

## Acceptance criteria
- [x] A node in the spec view shows the tasks that implement it and their columns
- [x] Lists tasks without `implements`, and ticked nodes without any task
- [x] `implements` entries that name no existing node are reported
- [x] The planner block keeps the rule that finishing a task updates the criteria of its nodes (`R-spec-is-truth`); a test checks the generated block contains it

## Implementation notes
- Done: `src/lib/trace.ts` with tests, `src/components/trace.tsx`, mounted in `spec-view.tsx` (task chips on node rows, Trace section below the Structure), the planner block test in `agents_block.rs`. `templates/AGENTS-block.md` already had the rule.

## Result
The spec view traces tasks to nodes. Each node row shows the tasks that implement it, with their column, and each opens the task file in the editor. A collapsible Trace section below the Structure lists three gaps: tasks outside the terminal column without `implements`, ticked nodes that neither they nor any node below them have a task for, and `implements` entries naming no node. The index is a pure module over the board and the Structure and follows both stores. A Rust test checks that the planner block keeps the rule that finishing a task updates the criteria of its nodes.
- Not tried by hand in the running app, and not run against this repository's own board, so how many gaps it shows is not known yet.
- Task chips are not shown in the mind map, only in the tree.
