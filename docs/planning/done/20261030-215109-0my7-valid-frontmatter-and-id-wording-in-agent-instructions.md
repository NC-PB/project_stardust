---
id: 20261030-215109-0my7
title: Valid frontmatter and id wording in agent instructions
tags: [agents, files]
created: 2026-10-30
completed: 2026-10-31
implements: [S-agents-block, S-task-format]
depends_on: []
---

## Description
Found while building the task file model ([task](../done/20261030-220003-9910-task-file-model-frontmatter-and-sections.md)).

1. Agents write titles like `title: Project scaffold: Tauri, React, TypeScript`. A value containing `: ` is not valid YAML, so GitHub, Obsidian and strict parsers reject the frontmatter (`R-plain-markdown`). The tool reads such files with a fallback and reports them; its own writer quotes these values. The scaffold task in `done/` still has an unquoted title.
2. `AGENTS.md` and `templates/AGENTS-block.md` say "millisecond timestamp plus 4 random characters", but ids are to the second with a `[a-z0-9]` suffix (D-20261030-213854-k3cv).

Both files are human text, so the wording needs the user's approval.

## Acceptance criteria
- [x] The scaffold task's title is quoted, and every task file under the planning root has valid YAML frontmatter
- [x] `templates/AGENTS-block.md` and `AGENTS.md` describe ids as a timestamp to the second plus 4 characters from `[a-z0-9]`
- [x] `templates/AGENTS-block.md` and `AGENTS.md` tell agents to quote frontmatter values that contain `: ` or start with a YAML special character

## Implementation notes
- Wording approved by the user on 2026-10-31, "a value" later changed to "a text value": the id line now reads "local time to the second plus 4 characters from `[a-z0-9]`", and a new line asks to double-quote frontmatter values that contain `: ` or ` #` or start with a YAML special character, with an example. Applied to `templates/AGENTS-block.md` and the block in `AGENTS.md`; the block in `AGENTS.md` equals the filled template (35 lines).
- `agents_block` test: the placeholder check looked for any `{`, which the new line contains; it now looks for `{name}` only.
- The scaffold task title is quoted. Every file under the planning root with frontmatter parses as YAML (checked with PyYAML).
- Checks: `cargo test` (94), `cargo clippy` clean.

## Result
Agents are now told the real id format and to quote frontmatter values that YAML would misread; `templates/AGENTS-block.md` and `AGENTS.md` carry the same block. The scaffold task's title is quoted, and every planning file's frontmatter is valid YAML again.

- `S-task-format` needed no change: the reader and writer already handled this (D-20261030-215110-cgf7).
- The quoting line says "a text value", so agents do not quote flow lists such as `tags: [a, b]` (proposed after the first wording, accepted by the user on 2026-10-31).

### Next session
- `next/` is empty. Check the board and the editor by hand in `npm run tauri dev`; nobody has tried them yet.
