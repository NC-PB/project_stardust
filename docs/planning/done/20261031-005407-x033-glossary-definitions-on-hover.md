---
id: 20261031-005407-x033
title: Glossary definitions on hover
tags: [ideation]
created: 2026-10-31
implements: [S-glossary]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
Implements `S-glossary` in the [spec](../spec.md).

## Acceptance criteria
- [x] In read mode, glossary terms show their definition on hover
- [x] Matching is case insensitive on whole words; the first occurrence per paragraph is marked

## Implementation notes
- Done: remark plugin `src/lib/glossary.ts` with tests, wired into `ReadView` in `src/components/editor.tsx` next to the proposal blockquote, style in `src/index.css`. `@types/mdast` added as a direct dev dependency.

## Result
Read mode marks glossary terms through a remark plugin (`src/lib/glossary.ts`) with the terms from the spec store. Within each paragraph or table cell, the first case insensitive whole-word occurrence of each term becomes an `<abbr>` with a dotted underline whose title gives the term and its definition, so the definition shows on hover. Longer terms win over shorter ones inside them. Headings, code, inline code and links are left alone.
- Not tried by hand in the running app. The tests check the rendered HTML only.
- Plurals ("Tasks") and terms split by markup are not matched.
- The terms in the Glossary list itself are marked too.
