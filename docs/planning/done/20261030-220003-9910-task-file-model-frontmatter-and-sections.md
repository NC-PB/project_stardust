---
id: 20261030-220003-9910
title: "Task file model: frontmatter and sections"
tags: [planning]
created: 2026-10-30
implements: [S-task-format]
depends_on: [20261030-220001-3fab, 20261030-220002-5dbd]
completed: 2026-10-30
---

## Description
Read and write task files without damaging them. Rust module, tested against `templates/task.md`.

Implements `S-task-format` in the [spec](../spec.md).

## Acceptance criteria
- [x] One task per file, filename `<id>-<slug>.md` (`R-one-task-per-file`)
- [x] Frontmatter: `id`, `title`, `created` required; `tags`, `priority` (1 to 5), `depends_on`, `parent`, `implements`, `completed` optional
- [x] Writing a changed field keeps unknown fields, field order and the body unchanged
- [x] A file with missing or invalid frontmatter is still listed and reported, never dropped
- [x] When filename id and frontmatter id differ, the filename id is used and the mismatch reported (`R-filename-truth`)
- [x] Round trip tests: read and write `templates/task.md` without changes

## Implementation notes
- 2026-10-30: Found that this file and the scaffold task have invalid YAML frontmatter: titles contain `: ` unquoted (`mapping values are not allowed here`). Plan: the reader reports invalid YAML and falls back to reading top-level `key: value` lines for `id` and `title`; the writer edits only the lines of the changed key and quotes values that plain YAML would misread. Writing is line based, so comments, flow lists, unknown fields, field order and the body stay as they are. Module `src-tauri/src/domain/task.rs`.
- Quoted this file's own title so its frontmatter is valid YAML. The scaffold task and the agent instructions are left for [the inbox task](20261030-215109-0my7-valid-frontmatter-and-id-wording-in-agent-instructions.md).
- Done: all criteria. `cargo test` (45 tests, 17 new, one lists every task file in this repository), clippy clean, `npm run check` passes. `S-task-format` criteria updated, D-20261030-215110-cgf7 appended, Glossary gained Section and Issue. Nothing open.

## Result
`src-tauri/src/domain/task.rs` reads and writes task files. In TypeScript: `readColumn(dir)` and `readTask(path)` return `Task_Serialize` (`id`, `title`, the optional fields, `sections`, `issues`); `setTaskField(path, key, value)` with `value` `{ Text }`, `{ List }` or `{ Number }`; `removeTaskField(path, key)`.

- Reading never drops a file. Every problem is an issue with its field; invalid YAML still yields `id`, `title`, dates and `parent` from the raw lines.
- Writing touches only the lines of one field, so unknown fields, comments, order, list style, CRLF and the body are kept. Writing every field of `templates/task.md` with its own value leaves the file byte for byte unchanged.
- Values are quoted only when plain YAML would read them back differently (`: `, `true`, `42`, leading `#`).
- Issue order follows the field order of the model, not the file.
- Commands write with `std::fs::write`; once the watcher lands, consider whether its own writes need to be told apart.

### Next session
- [Built in templates](20261030-220004-2a22-built-in-templates-with-project-overrides.md) is in `next/`; `config.rs` and the tests here already load templates with `include_str!`.
- New in inbox: [valid frontmatter and id wording](20261030-215109-0my7-valid-frontmatter-and-id-wording-in-agent-instructions.md), needs the user's approval for `AGENTS.md` wording.
- Now unblocked: file watcher, markdown editor, deletes to trash.
