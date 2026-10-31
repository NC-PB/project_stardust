---
id: 20261031-012420-l1dm
title: Render inline markup in spec view criteria
tags: [ideation]
created: 2026-10-31
implements: [S-nodes]
depends_on: []
completed: 2026-10-31
---

## Description
Criteria and node titles in the [spec view](../done/20261031-005359-t8qs-spec-view-with-the-structure-tree.md) show as plain text with backticks visible.

## Acceptance criteria
- [x] Inline code and links in criteria and node titles render in the spec view

## Implementation notes
- Done: `remarkInlineOnly` with tests in `src/lib/inline-markdown.ts`; the `InlineMarkdown` component; node titles and criteria in `spec-view.tsx` switched to it.

## Result
Node titles and criteria in the spec view render inline code, emphasis and links through `InlineMarkdown` (`src/components/inline-markdown.tsx`, logic in `src/lib/inline-markdown.ts`). Block markup is turned off in the parser, so a criterion's sub-item lines stay text with their line breaks. A relative `.md` link opens that file in the editor, resolved from the spec file the text is in. Other links show as text with the address on hover and never navigate the window.
- Not tried by hand in the app.
- A link is an `<a>` nested in the row's `<button>`: invalid HTML, though it works in the webviews; a follow-up task is in the inbox.
- GFM is not enabled (no strikethrough or autolinked bare URLs).
