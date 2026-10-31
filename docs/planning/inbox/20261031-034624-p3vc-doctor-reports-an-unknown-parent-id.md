---
id: 20261031-034624-p3vc
title: Doctor reports an unknown parent id
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-subtasks]
depends_on: [20261031-034053-u7dq]
---

## Description
The doctor reports `depends_on` ids that no task file carries (task [20261031-034053-u7dq](../done/20261031-034053-u7dq-doctor-reports-unknown-dependency-ids.md), D-20261031-034606-n8vb in the [spec](../spec.md)). A `parent` that names no task file, or the task itself, is the same kind of planning error: the child counts for no parent card. The doctor could report it at the line of `parent`, without a fix, with the same known ids (columns and archive, not checked when a folder could not be read). Which kind it is (`DependencyError` or a new one) needs a decision.

## Acceptance criteria
- [ ] The doctor reports a `parent` id that no task file in the columns or the archive carries, with file and line
- [ ] The doctor reports a `parent` that is the task's own id
- [ ] The phase 3 exit test still has no findings

## Implementation notes

## Result
