---
id: 20261031-041511-8m2d
title: Answers arriving after their tab was hidden
tags: [workspace]
created: 2026-10-31
implements: [S-multi-project]
depends_on: [20261031-021025-jf7q]
---

## Description
Tabs swap the state of the project stores (D-20261031-041507-l55b, task [20261031-021025-jf7q](../done/20261031-021025-jf7q-multi-project-workspace.md)). An answer of work the user started by hand (doctor check, archive, split or git attributes preview, changelog draft, a board move) that arrives after its tab was hidden is dropped by the store's repository check, so the hidden tab's snapshot keeps the state from before the answer: the doctor panel can stay at "checking", a failed move is not put back. Decide whether such answers should be written into the hidden tab's snapshot, or the panels should run their check again when the tab is shown.

Implements `S-multi-project` in the [spec](../spec.md).

## Acceptance criteria
- [ ] A check or preview still running when its tab is hidden shows its answer, or runs again, when the tab is shown

## Implementation notes

## Result
