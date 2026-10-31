---
id: 20261031-032504-k7mz
title: Task reader reports a missing frontmatter id
tags: [files]
created: 2026-10-31
implements: [S-task-format]
depends_on: [20261031-021017-7vyg]
---

## Description
`S-task-format` lists `id` as a required frontmatter field and says missing required fields are issues, but `src-tauri/src/domain/task.rs` reads `id` as optional: a task file whose filename carries an id and whose frontmatter has no `id` gets no issue. The doctor (task [20261031-021017-7vyg](../done/20261031-021017-7vyg-doctor-check.md)) works around it with its own check. Decide whether the reader reports it (the editor's issue list and the card would show it) or the spec relaxes the rule, and remove the doctor's own check if the reader reports it.

Implements `S-task-format` in the [spec](../spec.md).

## Acceptance criteria
- [ ] A task file without frontmatter `id` gets an issue for `id` from the reader, or `S-task-format` no longer calls `id` required
- [ ] The doctor reports a missing frontmatter `id` once, with its fix

## Implementation notes

## Result
