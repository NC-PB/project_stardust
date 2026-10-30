---
id: 20261030-220003-9910
title: Task file model: frontmatter and sections
tags: [planning]
created: 2026-10-30
implements: [S-task-format]
depends_on: [20261030-220001-3fab, 20261030-220002-5dbd]
---

## Description
Read and write task files without damaging them. Rust module, tested against `templates/task.md`.

Implements `S-task-format` in the [spec](../spec.md).

## Acceptance criteria
- [ ] One task per file, filename `<id>-<slug>.md` (`R-one-task-per-file`)
- [ ] Frontmatter: `id`, `title`, `created` required; `tags`, `priority` (1 to 5), `depends_on`, `parent`, `implements`, `completed` optional
- [ ] Writing a changed field keeps unknown fields, field order and the body unchanged
- [ ] A file with missing or invalid frontmatter is still listed and reported, never dropped
- [ ] When filename id and frontmatter id differ, the filename id is used and the mismatch reported (`R-filename-truth`)
- [ ] Round trip tests: read and write `templates/task.md` without changes

## Implementation notes

## Result
