---
id: 20261031-033553-r4kd
title: Doctor reports a dependency on the task itself
tags: [doctor, planning]
created: 2026-10-31
implements: [S-doctor, S-dependencies]
depends_on: []
completed: 2026-10-31
---

## Description
A task whose `depends_on` names its own id is a planning error: the board sort and the blocked marker ignore it (D-20261031-033553-2skc in the [spec](../spec.md)), so it is shown nowhere. The doctor (`src-tauri/src/domain/doctor.rs`) could report it as a finding with file, line and the id, so it also appears in the Stale view's Broken group. Found in [task 20261031-033320-q7vd](../done/20261031-033320-q7vd-a-dependency-on-itself-shows-as-blocked.md).

## Acceptance criteria
- [x] The doctor reports a task whose `depends_on` contains its own id, with file and line
- [x] The finding kind is shown in the doctor panel and the Stale view

## Implementation notes
- Done: new finding kind `DependencyError` (`dependency_error`) after `FrontmatterError` in `src-tauri/src/domain/doctor.rs` (`self_dependency`), at the line of `depends_on`; fix `DoctorFix::RemoveDependency` applied by `apply_fix`; labels in `src/lib/doctor.ts` (`KIND_LABELS`, `fixLabel`) and `src/lib/stale-view.ts` (`FINDING_LABELS`); bindings regenerated; tests in Rust, `doctor.test.ts`, `stale-view.test.ts`.
- Open: nothing. Unknown dependency ids are task [20261031-034053-u7dq](../next/20261031-034053-u7dq-doctor-reports-unknown-dependency-ids.md).

## Result
The doctor reports a task whose `depends_on` contains its own id (the filename id, else the frontmatter id) as a `dependency_error` finding with the file and the line of `depends_on`, message "`depends_on` names the task's own id `<id>`". The kind is listed as "Dependency errors" in the doctor panel and as "Dependency error" in the Stale view's Broken group; both read the labels from `src/lib/doctor.ts` and `src/lib/stale-view.ts`, the components needed no change. The finding offers a fix, "Remove <id>, the task's own id, from depends_on of <file>": `apply_fix` reads the file again, refuses when the entry is gone or `depends_on` no longer reads cleanly, and writes the remaining ids in their order against the text read (`save_text`). The fix is offered only when the frontmatter was read as a whole and `depends_on` has no issue; a `depends_on` with an invalid id is read as empty by the task reader, so it is a frontmatter error and not this finding. Decision D-20261031-034053-k2rd in the [spec](../spec.md). The phase 3 exit test still has zero findings. `npm run check` (369 tests), `cargo test` (267), `cargo clippy --all-targets` and `cargo fmt --check` pass. Not tried in the running app: the panel's "Fix…" / "Apply" for the new fix and the Stale view entry were checked only through unit tests of the labels and the Rust fix. `set_field` writes `depends_on` as one flow list, so a block list or comments within the field are rewritten as one line. Unknown dependency ids went to the inbox as task [20261031-034053-u7dq](../next/20261031-034053-u7dq-doctor-reports-unknown-dependency-ids.md).
