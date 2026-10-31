---
id: 20261031-012417-6wgq
title: Glossary hover for plural forms
tags: [ideation]
created: 2026-10-31
implements: [S-glossary]
depends_on: []
completed: 2026-10-31
---

## Description
Found while building [glossary hover](../done/20261031-005407-x033-glossary-definitions-on-hover.md). Plural forms ("Tasks", "Columns") are not marked.

## Acceptance criteria
- [x] Simple plurals of a term are marked as the term
- [x] The definition also shows on keyboard focus

## Implementation notes
- Done: plurals via `pluralOf` and `forms` in `src/lib/glossary.ts`; focusable terms with a CSS focus tooltip in `src/index.css`; tests.

## Result
Plural forms of glossary terms are marked in read mode as the term itself. The last word takes "s", "es" (after s, x, z, ch, sh) or "ies" (consonant plus y), so "Planning roots" shows the definition of "Planning root". Marked terms are tab stops; on keyboard focus a small tooltip under the term shows the same "Term: definition" text as the hover title.
- Not checked in the running app.
- Irregular plurals (children, criteria) and possessives are not matched; a term whose plural is another word marks that word too ("Pin" marks "pins").
- The focus tooltip can be clipped at the edge of the scrolling editor pane.
