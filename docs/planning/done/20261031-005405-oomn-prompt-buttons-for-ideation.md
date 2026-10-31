---
id: 20261031-005405-oomn
title: Prompt buttons for ideation
tags: [agents, ideation]
created: 2026-10-31
implements: [S-prompts]
depends_on: [20261031-005359-t8qs]
completed: 2026-10-31
---

## Description
The prompt infrastructure exists from phase 1 (`fill_prompt`). Only the buttons are missing.

Implements `S-prompts` in the [spec](../spec.md).

## Acceptance criteria
- [x] Structure this on the braindump; Interview me, Integrate answers and Generate tasks in the spec view
- [x] Verify area on every Structure node, filling `{node_id}`
- [x] Same notice behaviour as the phase 1 buttons

## Implementation notes
- Done: `editorPromptsOf`, `nodeInputOf` and the prompt lists in `src/lib/prompts.ts` with tests; the editor's prompt row offers Structure this on the braindump; `SpecPrompts` in the spec view header; `VerifyAreaButton` on node rows.

## Result
The editor's "Copy prompt" row also shows for the braindump (`{planning_root}/braindump.md`) and offers Structure this. The spec view header has Interview me, Integrate answers and Generate tasks, shown while the spec exists, and every Structure node row with an id has a "Verify area" button that fills `{node_id}`. All buttons use `usePromptStore.copy`, so the clipboard write and the notice work as in phase 1. Every prompt in `templates/prompts.md` now has a button.
- Copying was not tried by hand in the app.
- Structure this also shows when a spec already exists.
- The mind map has no Verify area button, only the tree.
