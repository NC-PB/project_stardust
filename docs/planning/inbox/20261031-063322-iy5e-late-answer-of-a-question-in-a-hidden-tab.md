---
id: 20261031-063322-iy5e
title: Late answer of a question in a hidden tab
tags: [workspace, spec]
created: 2026-10-31
implements: [S-multi-project]
depends_on: [20261031-041511-8m2d]
---

## Description
Answers of work started by hand now land in the hidden tab's snapshot (D-20261031-063321-ns0a, task [20261031-041511-8m2d](../done/20261031-041511-8m2d-answers-arriving-after-their-tab-was-hidden.md)). Answering a question in the questions form (`useQuestionsStore.answer`) still drops its answer when the tab is hidden before `answer_question` returns: the question stays at "saving" and keeps its draft, although the answer may be on disk. `useQuestionsStore` has no `repoRoot` of its own (it checks `useSpecStore`), so `settleInTab` cannot find its state yet.

## Acceptance criteria
- [ ] An answer to a question saved while its tab is hidden shows as answered, or its error, when the tab is shown

## Implementation notes

## Result
