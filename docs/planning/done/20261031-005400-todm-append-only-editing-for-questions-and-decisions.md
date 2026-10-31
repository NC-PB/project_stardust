---
id: 20261031-005400-todm
title: Append-only editing for Questions and Decisions
tags: [ideation]
created: 2026-10-31
implements: [S-decisions]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
Guard in the editor. Agents follow the same rule by convention in the planner block.

Implements `S-decisions` in the [spec](../spec.md).

## Acceptance criteria
- [x] In the Questions and Decisions sections (or files), the editor allows appending entries only
- [x] Existing entries can only get a mark: answered, or a "Superseded by" line on decisions
- [x] Attempted edits to existing entries are blocked with a short explanation (`R-append-only`)
- [x] The guard works for both spec forms

## Implementation notes
- Done: guard in `src-tauri/src/domain/append_only.rs`, command `check_append_only`, check before every save in `editor-store.ts`, `AppendOnlyBar` in `editor.tsx`, explanation text in `src/lib/append-only.ts`.
- The Questions form (task 20261031-005401-myb8) should call `append_only_violations` in Rust, or `commands.checkAppendOnly`, before it writes.

## Result
Saving `spec.md` or a file of `spec/` first compares the questions and decisions of the saved text with those of the edited text, read with the spec parser and matched by id. Existing entries can only be answered (ticked, moved to Answered, answer and date appended, links after `→` added) or get a `Superseded by` line; anything else is not saved. The editor keeps the text and shows why, entry by entry, with "Undo my edits", which keeps the edits restorable like a reload. The check is one Rust function, which the Questions form can call too.
- Not tried by hand in the running app.
- The guard stops the editor only. Agents and other programs writing to disk follow the rule by convention.
- "Restore file" for a removed spec file writes without the check.
