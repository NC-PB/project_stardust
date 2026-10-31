---
id: 20261031-005359-t8qs
title: Spec view with the Structure tree
tags: [ideation]
created: 2026-10-31
implements: [S-spec-file, S-nodes]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
The Idea view from the spec: a dedicated view next to the board.

Implements `S-spec-file`, `S-nodes` in the [spec](../spec.md).

## Acceptance criteria
- [x] Navigation by section; each section opens in the editor at the right place
- [x] The Structure shows as a collapsible tree with tick state, criteria, `#later` and the linked question
- [x] A tick marks a node as clarified; implementation is shown separately through `S-trace` (`R-tick-means-clear`)
- [x] Updates from watcher events without reload

## Implementation notes
- Done: `SpecView` (`src/components/spec-view.tsx`) with section navigation, Structure tree and issue list; `ViewSwitch` (Board | Spec) with `useViewStore`; `open(repoRoot, path, line?)` in the editor store, revealed by the editor in source mode; pure logic in `src/lib/spec-view.ts` with tests. `useSpecStore` (`src/stores/spec-store.ts`) was written beforehand by the main session for all wave 2 tasks.
- The main session mounted the fog meter and gate status under the header and added the Mind map toggle.

## Result
The Board | Spec switch under the project bar swaps the board for the spec view. The view lists the spec's sections as buttons, each opening its file (`spec.md` or the right file under `spec/`) in the editor scrolled to the heading in source mode. The Structure is a tree: areas start expanded, nodes collapsed; each node shows a read-only tick ("Clarified", never "done"), its id, `#later` and its blocking question, and expanding it shows its criteria and child nodes. Clicking any part opens the editor at its line. Read issues are listed below the tree. The view follows the spec store, so changes on disk show without a reload. The fog meter and the gate status sit under the header, and a Mind map button swaps the tree for the mind map.
- Not tried by hand in the running app. The CodeMirror scroll to the line is untested.
- Criteria are shown as plain text; inline code is not rendered.
