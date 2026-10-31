---
id: 20261031-022447-8qow
title: Split spec updates the .gitattributes lines
tags: [files]
created: 2026-10-31
implements: [S-spec-split, S-gitattributes]
depends_on: []
---

## Description
Found while building `S-gitattributes` (task [20261031-021019-gps2](../done/20261031-021019-gps2-suggest-gitattributes-for-append-only-files.md)).

When `.gitattributes` has `docs/planning/spec.md merge=union` and the spec is split, the line names a file now in the trash, and `spec/questions.md` and `spec/decisions.md` get no union merge until the user runs "Git attributes" again. The split preview could list the change: replace the `spec.md` line with the two folder lines (a change of existing user text, so shown before it is written), or at least say that "Git attributes" should run again.

See D-20261031-022447-q8vr in the [spec](../spec.md).

## Acceptance criteria
- [ ] The split preview shows what happens to a `spec.md merge=union` line in `.gitattributes`
- [ ] After the split the folder files have `merge=union` when `spec.md` had it, written only over the text read
- [ ] Nothing changes in `.gitattributes` when it has no line for `spec.md`

## Implementation notes

## Result
