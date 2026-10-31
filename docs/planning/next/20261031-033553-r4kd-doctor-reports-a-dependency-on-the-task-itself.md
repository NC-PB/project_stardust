---
id: 20261031-033553-r4kd
title: Doctor reports a dependency on the task itself
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-dependencies]
depends_on: []
---

## Description
A task whose `depends_on` names its own id is a planning error: the board sort and the blocked marker ignore it (D-20261031-033553-2skc in the [spec](../spec.md)), so it is shown nowhere. The doctor (`src-tauri/src/domain/doctor.rs`) could report it as a finding with file, line and the id, so it also appears in the Stale view's Broken group. Found in [task 20261031-033320-q7vd](../done/20261031-033320-q7vd-a-dependency-on-itself-shows-as-blocked.md).

## Acceptance criteria
- [ ] The doctor reports a task whose `depends_on` contains its own id, with file and line
- [ ] The finding kind is shown in the doctor panel and the Stale view

## Implementation notes

## Result
