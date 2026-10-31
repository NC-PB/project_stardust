---
id: 20261031-012421-ik1h
title: Mark protected entries in source mode
tags: [ideation]
created: 2026-10-31
implements: [S-decisions]
depends_on: []
completed: 2026-10-31
---

## Description
Found while building the [append-only guard](../done/20261031-005400-todm-append-only-editing-for-questions-and-decisions.md). In long specs the refused entries are hard to find; `check_append_only` already returns their line after the edit (`now`).

## Acceptance criteria
- [x] Refused entries are highlighted in source mode
- [x] The highlight goes away once the save succeeds

## Implementation notes
- Done: `src/lib/protected-lines.ts` (CodeMirror state field and effect) with tests; the editor sets the marks whenever the store's `violations` change; the store clears `violations` when the text equals the saved text again. `@codemirror/state` added as a direct dependency.

## Result
Refused entries are highlighted in source mode on the first line of each entry after the edit, from the `now` line of `check_append_only`. The highlight clears on a successful save, on a reload, and when the edits are undone back to the saved text; before, an undo by hand left the refusal notice up.
- Not seen in the running app.
- Removed entries have no line to mark; only the notice lists them. Only the first line of an entry is marked.
- If the editor text is replaced from outside (for example by accepting a proposal), marks can sit on the wrong line until the next check about 1 s later.
