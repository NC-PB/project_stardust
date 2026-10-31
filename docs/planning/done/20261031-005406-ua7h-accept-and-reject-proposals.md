---
id: 20261031-005406-ua7h
title: Accept and reject proposals
tags: [ideation]
created: 2026-10-31
implements: [S-proposals]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
Proposals can appear in any planning file: spec, tasks, notes.

Implements `S-proposals` in the [spec](../spec.md).

## Acceptance criteria
- [x] Blockquotes starting with `**Proposal:**` get Accept and Reject actions in read mode
- [x] Accept unwraps the quote into plain text; Reject removes the block
- [x] Both are single undoable edits; nothing else in the file changes
- [x] A list of all open proposals across the planning root

## Implementation notes
- Done: `src/lib/proposals.ts` (find, accept, reject); `src-tauri/src/domain/proposals.rs` with command `list_proposals`; editor-store actions `resolveProposal` and `undoProposal`; `ProposalQuote` and `ProposalUndo` in `src/components/proposal-quote.tsx`; `ProposalList` in the header; `proposal-store`.

## Result
In read mode, a blockquote whose first line starts with `**Proposal:**` shows Accept and Reject. Accept unwraps the quote into plain text; Reject removes it with one blank line next to it. Each is one edit of the editor text, saved like typing, and can be undone from a bar under the header or with Ctrl/⌘+Z in read mode. A Proposals button in the header lists every proposal under the planning root (first line, `path:line`); an entry opens its file in read mode. Rust and TypeScript find proposals by the same line rules.
- Not tried by hand in the running app.
- Undo after Accept or Reject is the store's own one-step undo; CodeMirror's history does not include the change.
- The list is read when it opens and does not follow watcher batches while it is open.
