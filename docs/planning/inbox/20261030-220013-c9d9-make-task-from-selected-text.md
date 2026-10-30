---
id: 20261030-220013-c9d9
title: Make task from selected text
tags: [planning]
created: 2026-10-30
implements: [S-make-task]
depends_on: [20261030-220011-a93f, 20261030-220001-3fab]
---

## Description
Implements `S-make-task` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Selecting text in any file and choosing "Make task" creates a task file in `inbox/`
- [ ] The selection becomes the Description, with a link back to the source file
- [ ] The new file uses the task template and a new id

## Implementation notes

## Result
