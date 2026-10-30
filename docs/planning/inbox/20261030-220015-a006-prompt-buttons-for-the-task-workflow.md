---
id: 20261030-220015-a006
title: Prompt buttons for the task workflow
tags: [agents]
created: 2026-10-30
implements: [S-prompts]
depends_on: [20261030-220004-2a22]
---

## Description
Phase 1 subset: Work on task, Verify task, Handoff, Triage inbox. The ideation prompts follow in phase 2.

Implements `S-prompts` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Each button fills the template from `templates/prompts.md` with the current task and config and copies it to the clipboard
- [ ] A short notice confirms the copy
- [ ] Work on task, Verify task and Handoff are available on a task; Triage inbox on the inbox column

## Implementation notes

## Result
