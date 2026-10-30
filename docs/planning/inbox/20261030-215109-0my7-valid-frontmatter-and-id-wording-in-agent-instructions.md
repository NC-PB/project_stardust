---
id: 20261030-215109-0my7
title: Valid frontmatter and id wording in agent instructions
tags: [agents, files]
created: 2026-10-30
implements: [S-agents-block, S-task-format]
depends_on: []
---

## Description
Found while building the task file model ([task](../done/20261030-220003-9910-task-file-model-frontmatter-and-sections.md)).

1. Agents write titles like `title: Project scaffold: Tauri, React, TypeScript`. A value containing `: ` is not valid YAML, so GitHub, Obsidian and strict parsers reject the frontmatter (`R-plain-markdown`). The tool reads such files with a fallback and reports them; its own writer quotes these values. The scaffold task in `done/` still has an unquoted title.
2. `AGENTS.md` and `templates/AGENTS-block.md` say "millisecond timestamp plus 4 random characters", but ids are to the second with a `[a-z0-9]` suffix (D-20261030-213854-k3cv).

Both files are human text, so the wording needs the user's approval.

## Acceptance criteria
- [ ] The scaffold task's title is quoted, and every task file under the planning root has valid YAML frontmatter
- [ ] `templates/AGENTS-block.md` and `AGENTS.md` describe ids as a timestamp to the second plus 4 characters from `[a-z0-9]`
- [ ] `templates/AGENTS-block.md` and `AGENTS.md` tell agents to quote frontmatter values that contain `: ` or start with a YAML special character

## Implementation notes

## Result
