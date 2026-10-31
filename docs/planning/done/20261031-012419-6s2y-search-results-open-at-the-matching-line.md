---
id: 20261031-012419-6s2y
title: Search results open at the matching line
tags: [search]
created: 2026-10-31
implements: [S-search-fulltext]
depends_on: []
completed: 2026-10-31
---

## Description
Search hits carry `line`, but the search box opens the file at the top. The editor can open at a line since the [spec view](../done/20261031-005359-t8qs-spec-view-with-the-structure-tree.md).

## Acceptance criteria
- [x] Choosing a search result opens the file in source mode at the hit's line

## Implementation notes
- Done: `hitLocation` in `src/lib/search.ts` with tests; the search box passes the hit's line to `useEditorStore.open`.

## Result
Choosing a search result with Enter or a click opens the file in source mode, scrolled to the line of the first match. The search box gets the path and the 1-based line from `hitLocation` in `src/lib/search.ts` and passes them to `useEditorStore.open(repoRoot, path, line)` (D-20261031-011800-v3sk).
- Not tried in the running app; covered by unit tests.
- A file open in read mode switches to source mode when a result in it is chosen.
