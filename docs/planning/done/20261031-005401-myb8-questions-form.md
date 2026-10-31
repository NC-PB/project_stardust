---
id: 20261031-005401-myb8
title: Questions form
tags: [ideation]
created: 2026-10-31
implements: [S-questions]
depends_on: [20261031-005358-alo6, 20261031-005400-todm]
completed: 2026-10-31
---

## Description
Implements `S-questions` in the [spec](../spec.md).

## Acceptance criteria
- [x] Shows open questions with the node they block and an answer field
- [x] Saving appends the answer with the date and moves the entry to Answered (`R-append-only`)
- [x] Blocking questions are listed first

## Implementation notes
- Done: Rust `domain/questions.rs` and the `answer_question` command; `src/lib/questions.ts`, `src/stores/questions-store.ts`, `src/components/questions-form.tsx`; the Questions toggle in the spec view.

## Result
The spec view has a Questions toggle that shows the Questions form: the open questions, blocking ones first, each with the nodes it blocks or concerns and an answer field. Save calls `answer_question` in Rust, which appends the answer and today's date before the `→`, ticks the entry, moves it to the top of `### Answered` and leaves `- (none)` in an emptied Open list. The edit is checked with the append-only guard and written only if the file is unchanged since it was read. It works in `spec.md` and `spec/questions.md`.
- Not tried by hand in the running app.
- If the spec file is open in the editor, its edits are saved first; the answer is refused while they have a conflict or an append-only violation.
- An answer cannot contain `→`; line breaks become spaces.

### Next session
- Wave 3 is done. Unblocked now: [Agent adapters](../inbox/20261031-005411-6h8i-agent-adapters-starting-with-claude-code.md) and [Spec view rows without nested links](../inbox/20261031-013556-iwh8-spec-view-rows-without-nested-links.md). Signed release builds stay skipped; the session panel sort waits for `S-board-sort`.
- None of the phase 2 views has been tried by hand in `npm run tauri dev` yet; that is the most useful next step.
