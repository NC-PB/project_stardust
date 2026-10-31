---
id: 20261031-041511-8m2d
title: Answers arriving after their tab was hidden
tags: [workspace]
created: 2026-10-31
completed: 2026-10-31
implements: [S-multi-project]
depends_on: [20261031-021025-jf7q]
---

## Description
Tabs swap the state of the project stores (D-20261031-041507-l55b, task [20261031-021025-jf7q](../done/20261031-021025-jf7q-multi-project-workspace.md)). An answer of work the user started by hand (doctor check, archive, split or git attributes preview, changelog draft, a board move) that arrives after its tab was hidden is dropped by the store's repository check, so the hidden tab's snapshot keeps the state from before the answer: the doctor panel can stay at "checking", a failed move is not put back. Decide whether such answers should be written into the hidden tab's snapshot, or the panels should run their check again when the tab is shown.

Implements `S-multi-project` in the [spec](../spec.md).

## Acceptance criteria
- [x] A check or preview still running when its tab is hidden shows its answer, or runs again, when the tab is shown

## Implementation notes
- Done: decided to write late answers into the hidden tab's snapshot (D-20261031-063321-ns0a). Snapshots moved to `src/stores/tab-snapshots.ts` (by repository root, then by store); `settleInTab` writes an update into each state of the store whose `repoRoot` is the tab's. Used by the doctor (check, fix, check after fix), archive, split (also the project's `sources` after a split), git attributes and changelog stores and by a refused board move. Tests in `tab-snapshots.test.ts` and `workspace-store.test.ts`.
- Open: nothing for this task. The questions form still drops a late answer (inbox task 20261031-063322-iy5e).

## Result
Late answers of work started by hand now land in the tab they were started in. `settleInTab(store, repoRoot, update)` (`src/stores/tab-snapshots.ts`) writes into the live store while the tab is shown and into its snapshot while it is hidden (both in the moment a tab is being hidden); `useWorkspaceStore` keeps its snapshots there as maps by store instead of arrays. The doctor check, the check after a fix, the archive, split and git attributes previews and writes, the changelog tags, draft and write, and a refused board move (card back, error shown) use it. A move that happened needs nothing: its watcher batch is queued for the hidden tab. Answers of a closed tab are still dropped.

Checked with `npm run check` (tsc, biome, 419 vitest tests), including a workspace test that hides a tab while its doctor check and a refused move are pending and finds both answers after showing it again. Not tried in the running app: switching tabs while a real doctor run, preview or move is in flight. Not changed: the questions form (inbox task 20261031-063322-iy5e). No Rust changes.
