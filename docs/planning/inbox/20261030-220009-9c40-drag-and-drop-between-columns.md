---
id: 20261030-220009-9c40
title: Drag and drop between columns
tags: [planning, board]
created: 2026-10-30
implements: [S-board-dnd]
depends_on: [20261030-220008-6c7c]
---

## Description
Moving a card moves the file. Uses dnd-kit.

Implements `S-board-dnd` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Dropping a card in another column moves the file (`R-one-column`)
- [ ] Moving into the terminal column sets `completed` to today; moving out removes it
- [ ] A failed move leaves the card in its original column and shows the error

## Implementation notes

## Result
