---
id: 20261031-034053-u7dq
title: Doctor reports unknown dependency ids
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-dependencies]
depends_on: [20261031-033553-r4kd]
---

## Description
A `depends_on` id that names no task file in any column or in the archive is a typo or points at a deleted task. The board does not block on it (D-20261030-231221-spj4 in the [spec](../spec.md)) and nothing reports it. The doctor reads every task file, the archive included, so it could report such an id as a `dependency_error` finding with file, line and the id, next to the dependency on the task itself added in [task 20261031-033553-r4kd](../done/20261031-033553-r4kd-doctor-reports-a-dependency-on-the-task-itself.md). Unlike a self id, removing an unknown id is not an obvious fix: the user may have meant another task. The same could apply to `parent`.

## Acceptance criteria
- [ ] The doctor reports a `depends_on` id that no task file in the columns or the archive carries, with file and line
- [ ] No fix is offered for it, unless a decision says otherwise
- [ ] The phase 3 exit test still has no findings

## Implementation notes

## Result
