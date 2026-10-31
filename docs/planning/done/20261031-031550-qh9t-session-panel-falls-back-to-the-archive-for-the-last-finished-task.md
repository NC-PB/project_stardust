---
id: 20261031-031550-qh9t
title: Session panel falls back to the archive for the last finished task
tags: [planning]
created: 2026-10-31
implements: [S-session-panel, S-archive]
depends_on: [20261031-030611-fac5]
completed: 2026-10-31
---

## Description
Found while letting trace and the changelog read the archive ([task](../done/20261031-030611-fac5-trace-and-changelog-read-the-archive.md), D-20261031-031457-vjn2).
- The session panel's last finished task comes only from the files directly in the terminal column. When nothing was finished this month and earlier months are archived, it shows none. The board store now holds the archived tasks (`useBoardStore.archived`), so the panel could fall back to the newest of them.
- The `S-archive` criterion "the board, the session panel, trace and the changelog read only the files directly in the terminal column" no longer holds for trace and the changelog; it should be brought in line with the code.

## Acceptance criteria
- [x] With no finished task directly in the terminal column, the session panel shows the newest archived task and its Result
- [x] The `S-archive` criteria say which readers see archived tasks

## Implementation notes
- Done: `read_archive` returns each archived task as a full `Task` with its sections, so the Result is there. `sessionBrief` (`src/lib/session.ts`) takes the archived tasks as an optional fifth argument; `lastFinished` falls back to `lastCompletedTask` over them only when no task is directly in the terminal column, and builds the path `<terminal>/YYYY-MM/<file>`. `src/components/session-panel.tsx` passes `useBoardStore.archived`. Test in `src/lib/session.test.ts`.
- Done: `S-session-panel` and `S-archive` criteria updated; D-20261031-031857-6qqi.
- Open: none.

## Result
With no task directly in the terminal column, the session panel's "Last finished" shows the newest archived task (latest `completed`, then latest change on disk), its Result, and opens the file at its month folder path. A task still directly in the column always wins over the archive (D-20261031-031857-6qqi). The `S-archive` criteria now say the board never shows archived tasks, trace and the changelog read them, and the session panel reads them only as this fallback.

Verified with `npm run check` (tsc, biome, 335 vitest tests including the new fallback test). No Rust changed. Not tried in the running app: opening a project whose terminal column holds only month folders and clicking the archived entry.
