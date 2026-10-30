---
id: 20261030-220011-a93f
title: Markdown editor with source and read mode
tags: [editor]
created: 2026-10-30
implements: [S-editor-core, S-editor-layout]
depends_on: [20261030-220003-9910]
---

## Description
CodeMirror 6 via `@uiw/react-codemirror`, rendering with remark/rehype.

Implements `S-editor-core`, `S-editor-layout` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Two modes per file, toggled with one shortcut: styled source and rendered read
- [ ] Styled source: sized headings, highlighted task lists, links, inline code and frontmatter; markup stays visible
- [ ] Read mode renders markdown with GFM task lists, images and Mermaid blocks
- [ ] Frontmatter is editable as a form on top of the file
- [ ] No split view

## Implementation notes

## Result
