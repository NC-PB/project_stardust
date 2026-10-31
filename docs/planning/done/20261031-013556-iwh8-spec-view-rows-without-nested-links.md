---
id: 20261031-013556-iwh8
title: Spec view rows without nested links
tags: [ideation]
created: 2026-10-31
completed: 2026-10-31
implements: [S-nodes]
depends_on: []
---

## Description
Found while rendering [inline markup in the spec view](../done/20261031-012420-l1dm-render-inline-markup-in-spec-view-criteria.md). Node titles and criteria are `<button>` elements, and a link inside them is an `<a>` nested in a button, which is invalid HTML (D-20261031-013555-1ofs).

## Acceptance criteria
- [x] Node and criterion rows are not buttons; a separate control opens the row
- [x] Links in titles and criteria are not nested in interactive elements
- [x] Rows stay reachable and usable with the keyboard

## Implementation notes
- Done: titles and criteria in `src/components/spec-view.tsx` are `<span>`s; `OpenButton` (↗) beside each opens the editor at the line, named by `openLabel` (`src/lib/spec-view.ts`, tested). `SpecLink` comment in `src/components/inline-markdown.tsx` updated.
- Checked in the code: the expand/collapse chevron, Verify area, blocking question and task chips are sibling buttons in the row; none contains another interactive element.
- Open: nothing.

## Result
Node titles and criteria in the spec view are text, not buttons. A small ↗ button after each node title and before each criterion opens the editor at its line; its title and accessible name say what and where (`Open S-nodes at spec.md:191`). Links in titles and criteria are now siblings of that button, never nested in an interactive element. All controls in a row (expand, open, links, Verify area, blocking question, task chips) are plain buttons or links reachable with Tab.
- Web and anchor links no longer open the row on click; they are text with the address on hover (D-20261031-015912-681c).
- `npm run check` passes (tsc, biome, 247 tests). Not tried in the running app, and the rendered HTML was not checked with a DOM test.
