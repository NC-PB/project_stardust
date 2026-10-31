---
id: 20261031-021016-xuut
title: "Images: drop, render, missing badge"
tags: [files, editor]
created: 2026-10-31
implements: [S-images]
depends_on: []
---

## Description
Phase 3. Images live in the image root, excluded from git (D-20260919-104200-9f03).

Implements `S-images` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Dropping an image into the editor copies it to the image root and inserts a relative link
- [ ] A name clash gets a suffix; an existing image is never overwritten (`R-no-destroy`)
- [ ] Images render inline in read mode
- [ ] A missing image shows a badge instead of a broken layout

## Implementation notes

## Result
