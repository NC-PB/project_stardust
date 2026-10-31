---
id: 20261031-034053-u7dq
title: Doctor reports unknown dependency ids
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-dependencies]
depends_on: [20261031-033553-r4kd]
completed: 2026-10-31
---

## Description
A `depends_on` id that names no task file in any column or in the archive is a typo or points at a deleted task. The board does not block on it (D-20261030-231221-spj4 in the [spec](../spec.md)) and nothing reports it. The doctor reads every task file, the archive included, so it could report such an id as a `dependency_error` finding with file, line and the id, next to the dependency on the task itself added in [task 20261031-033553-r4kd](../done/20261031-033553-r4kd-doctor-reports-a-dependency-on-the-task-itself.md). Unlike a self id, removing an unknown id is not an obvious fix: the user may have meant another task. The same could apply to `parent`.

## Acceptance criteria
- [x] The doctor reports a `depends_on` id that no task file in the columns or the archive carries, with file and line
- [x] No fix is offered for it, unless a decision says otherwise
- [x] The phase 3 exit test still has no findings

## Implementation notes
- Done: `unknown_dependencies` in `src-tauri/src/domain/doctor.rs`, run over every task file after `self_dependency`, against the effective ids already collected for duplicates (`by_id`); skipped when a folder could not be read. Doc comment of `FindingKind::DependencyError` extended, bindings regenerated. Tests: `an_unknown_dependency_id_is_reported_without_a_fix`, an unknown id added to `reports_every_kind_with_file_and_line`, the missing third task added to the self-dependency test, and the phase 3 exit test now gives each task a dependency on the one before.
- Open: nothing. `parent` went to the inbox as task [20261031-034624-p3vc](../next/20261031-034624-p3vc-doctor-reports-an-unknown-parent-id.md).

## Result
The doctor reports each `depends_on` id that no task file carries as its id (the filename id, else the frontmatter id), in the columns or the archive's month folders, as a `dependency_error` finding at the line of `depends_on`, message "`depends_on` names `<id>`, which no task file carries, in the columns or the archive". One finding per id; an id repeated in the field counts once. No fix is offered. When a column or month folder could not be read, unknown ids are not checked at all, so no dependency on a task in that folder is reported wrongly. The doctor panel and the Stale view needed no change: they already label the kind. Decision D-20261031-034606-n8vb in the [spec](../spec.md). The phase 3 exit test, where each generated task now depends on the one made before (60 of them archived), still has zero findings. `npm run check` (369 tests), `cargo test` (268), `cargo clippy --all-targets` and `cargo fmt --check` pass. Not tried in the running app: the findings in the doctor panel and the Stale view were checked only through the Rust tests and the existing label tests. A mismatched frontmatter id does not count as known, so a dependency on it is reported next to the id mismatch. `parent` is not checked; it went to the inbox as task [20261031-034624-p3vc](../next/20261031-034624-p3vc-doctor-reports-an-unknown-parent-id.md).
