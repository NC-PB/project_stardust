---
id: 20261030-220004-2a22
title: Built in templates with project overrides
tags: [platform]
created: 2026-10-30
implements: [S-templates]
depends_on: [20261030-220002-5dbd]
---

## Description
Embed the files from `templates/` in the app and resolve per project overrides.

Implements `S-templates` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Templates for spec, task, config, planner block and prompts ship inside the app binary
- [ ] If `templates_dir` contains `task.md` or `spec.md`, those are used instead of the built in ones
- [ ] The planner block and the prompts are never taken from `templates_dir`
- [ ] Unit tests cover built in and override resolution

## Implementation notes

## Result
