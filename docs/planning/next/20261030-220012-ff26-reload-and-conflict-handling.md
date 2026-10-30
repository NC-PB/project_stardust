---
id: 20261030-220012-ff26
title: Reload and conflict handling
tags: [files]
created: 2026-10-30
implements: [S-conflicts]
depends_on: [20261030-220007-e420, 20261030-220011-a93f]
---

## Description
Implements `S-conflicts` in the [spec](../spec.md).

## Acceptance criteria
- [ ] An open file without unsaved edits reloads silently when it changes on disk
- [ ] An open file with unsaved edits keeps the user's version and shows "changed on disk" with a reload button
- [ ] No typed text is ever lost

## Implementation notes

## Result
