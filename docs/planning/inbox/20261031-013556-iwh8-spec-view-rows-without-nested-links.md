---
id: 20261031-013556-iwh8
title: Spec view rows without nested links
tags: [ideation]
created: 2026-10-31
implements: [S-nodes]
depends_on: []
---

## Description
Found while rendering [inline markup in the spec view](../done/20261031-012420-l1dm-render-inline-markup-in-spec-view-criteria.md). Node titles and criteria are `<button>` elements, and a link inside them is an `<a>` nested in a button, which is invalid HTML (D-20261031-013555-1ofs).

## Acceptance criteria
- [ ] Node and criterion rows are not buttons; a separate control opens the row
- [ ] Links in titles and criteria are not nested in interactive elements
- [ ] Rows stay reachable and usable with the keyboard

## Implementation notes

## Result
