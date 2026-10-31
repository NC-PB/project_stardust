---
id: 20261031-063322-iy5e
title: Late answer of a question in a hidden tab
tags: [workspace, spec]
created: 2026-10-31
implements: [S-multi-project]
depends_on: [20261031-041511-8m2d]
completed: 2026-10-31
---

## Description
Answers of work started by hand now land in the hidden tab's snapshot (D-20261031-063321-ns0a, task [20261031-041511-8m2d](20261031-041511-8m2d-answers-arriving-after-their-tab-was-hidden.md)). Answering a question in the questions form (`useQuestionsStore.answer`) still drops its answer when the tab is hidden before `answer_question` returns: the question stays at "saving" and keeps its draft, although the answer may be on disk. `useQuestionsStore` has no `repoRoot` of its own (it checks `useSpecStore`), so `settleInTab` cannot find its state yet.

## Acceptance criteria
- [x] An answer to a question saved while its tab is hidden shows as answered, or its error, when the tab is shown

## Implementation notes
- Done: `useQuestionsStore` has its own `repoRoot`, set from the spec store whenever that changes (with the clear of the drafts) and when a save starts. `save` writes its outcome after waiting (answered, `Not saved: …`, or the editor's unsaved edits) through `settleInTab`, so it lands in the tab the save started in, shown or hidden; the old `useSpecStore` repoRoot check is gone. Tests in `src/stores/questions-store.test.ts`: answer and refusal after hiding land in the snapshot and leave the shown tab alone; a closed tab drops the answer.
- Open: nothing.

## Result
`useQuestionsStore` carries the `repoRoot` of its project and settles a save's answer with `settleInTab` (D-20261031-063321-ns0a). A question answered while its tab is hidden is in the snapshot's `answered` list with its draft gone, so when the tab is shown it stays hidden until the queued watcher change reads the spec again and lists it as answered; a refusal shows as its error with the draft kept. `S-multi-project` criteria list the questions form among the late answers.

Checked with `npm run check` (tsc, biome, 422 vitest tests). Not tried in the running app: switching tabs while a real `answer_question` is in flight, and the case where the spec file is open in the editor and the tab is hidden during its save before answering (the editor check then reads the shown tab's editor). No Rust changes.
