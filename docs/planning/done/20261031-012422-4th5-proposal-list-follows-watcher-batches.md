---
id: 20261031-012422-4th5
title: Proposal list follows watcher batches
tags: [ideation]
created: 2026-10-31
implements: [S-proposals]
depends_on: []
completed: 2026-10-31
---

## Description
The [proposal list](../done/20261031-005406-ua7h-accept-and-reject-proposals.md) is read when it opens and does not follow changes on disk.

## Acceptance criteria
- [x] The open proposal list refreshes after watcher batches
- [x] The Proposals button shows the count

## Implementation notes
- Done: `proposalsTouched` in `src/lib/proposals.ts`; the proposal store got `load(repoRoot, config)`, `apply` and `clear`, wired into the project store like the spec store; the count is on the button; tests added.

## Result
The proposal list is loaded when a project opens and read again after each watcher batch that touches a markdown file or a folder under the planning root, so it follows changes on disk whether or not it is open. The Proposals button shows the number of open proposals.
- Each matching batch walks the planning root again; not measured on a large tree.
- A folder whose name contains a dot is not recognised as a folder, so its removal does not trigger a reload.
- Not tried in the running app.
