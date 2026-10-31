---
id: 20261031-005409-sqhn
title: Mind map view with Markmap
tags: [ideation]
created: 2026-10-31
implements: [S-mindmap]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
Mermaid in read mode already shipped in phase 1; this task is the Markmap view.

> **Proposal:** The original idea was a mind map for brainstorming, not only for the Structure. Before this task moves to the ready column, decide Q-20261031-005412-wtkk: (a) Structure only, as specified; (b) any outline (braindump, notes, Structure), read only; (c) b now plus an editable mind map that writes list edits back, as a separate later node.

Implements `S-mindmap` in the [spec](../spec.md).

## Acceptance criteria
- [x] Renders the Structure with Markmap; unticked nodes greyed out, `#later` nodes marked
- [x] Clicking a node opens it in the editor
- [x] Updates from watcher events

## Implementation notes
- The Proposal above was decided as option (a), Structure only: Q-20261031-005412-wtkk, D-20261031-010817-m4pq.
- Done: `src/lib/mind-map.ts` (tree, label states, scoped style, click target) with tests; `src/components/mind-map.tsx` (`MindMap`, markmap-view loaded on first use, `onOpen(at)`); dependency `markmap-view`.
- The main session added the Mind map toggle to the spec view.

## Result
The Structure renders as a Markmap mind map behind the Mind map button of the spec view. `mindMapTree` turns the spec model into a tree under a root named after the Structure section; each label is the node title and its `S-` id. Unticked nodes are greyed out, `#later` nodes are italic with a tag, colours follow the theme. Clicking a label opens the spec at the node's line; clicking a circle folds the node. It redraws whenever the spec is read again. Only `markmap-view` was added, loaded on first use, and nothing is loaded from the network.
- Not tried by hand in the running app.
- The fold state resets when the spec is read again.
- Nodes below the top level without a checkbox count as unticked.
