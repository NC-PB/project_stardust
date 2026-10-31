---
id: 20261031-022447-8qow
title: Split spec updates the .gitattributes lines
tags: [files]
created: 2026-10-31
completed: 2026-10-31
implements: [S-spec-split, S-gitattributes]
depends_on: []
---

## Description
Found while building `S-gitattributes` (task [20261031-021019-gps2](../done/20261031-021019-gps2-suggest-gitattributes-for-append-only-files.md)).

When `.gitattributes` has `docs/planning/spec.md merge=union` and the spec is split, the line names a file now in the trash, and `spec/questions.md` and `spec/decisions.md` get no union merge until the user runs "Git attributes" again. The split preview could list the change: replace the `spec.md` line with the two folder lines (a change of existing user text, so shown before it is written), or at least say that "Git attributes" should run again.

See D-20261031-022447-q8vr in the [spec](../spec.md).

## Acceptance criteria
- [x] The split preview shows what happens to a `spec.md merge=union` line in `.gitattributes`
- [x] After the split the folder files have `merge=union` when `spec.md` had it, written only over the text read
- [x] Nothing changes in `.gitattributes` when it has no line for `spec.md`

## Implementation notes
- Done: `gitattributes::plan_split_lines` (reuses `parse_line`, `pattern_for` and the "last line with the exact path that sets `merge`" rule), `SplitPlan.gitattributes`, `SplitReport.gitattributes`, the write in `split_spec_with` before the link rewrites with undo, the preview and report lines in `spec-split.tsx`, Rust tests in both modules, store test fixtures.
- Open: nothing.

## Result
The split now carries a `spec.md merge=union` line in `.gitattributes` over to the folder files (D-20261031-024600-gx7m).

- `plan_split` lists the change in `SplitPlan.gitattributes`: line number, the old line and the lines that replace it, plus existing folder file lines that are kept. The split preview shows them under ".gitattributes".
- When the last line with `spec.md`'s exact path that sets `merge` sets `merge=union`, it is replaced in place by the same line for `spec/questions.md` and `spec/decisions.md` (indentation, leading `/`, quotes, further attributes and the line ending kept). A folder file with its own merge setting gets no line; when both have one, the file is not written. The old line is removed, shown in the preview first (`R-no-destroy`).
- The write uses `save_text` against the text read, comes after the folder is read back and before the link rewrites, and is written back when a later step fails (tested with a read-only link file and a read-only `.gitattributes`). After a split, "Git attributes" finds nothing missing (tested).
- No `.gitattributes`, no line for `spec.md`, or another merge setting for it: nothing changes (tested). An unreadable `.gitattributes`, or one that is not UTF-8 and contains `spec.md`, blocks the split.
- Verified with `npm run check` (296 tests), `cargo test` (225 passed, 1 ignored) and `cargo clippy --all-targets` (clean).
- Not tried: the preview and report in the running app (`npm run tauri dev` was not started), and git's own reading of the rewritten lines was not checked with `git check-attr`. A failed trash after the `.gitattributes` write leaves the new lines, like the folder and the links (existing behaviour of a failed trash).
