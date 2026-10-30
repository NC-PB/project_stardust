---
id: 20261030-220002-5dbd
title: Read and validate planner.yml
tags: [workspace]
created: 2026-10-30
implements: [S-config]
depends_on: [20261030-220000-0822]
---

## Description
Load `docs/planner.yml` into a typed config shared by Rust and TypeScript.

Implements `S-config` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Every key is optional; missing keys take the defaults from `templates/planner.yml`
- [ ] An invalid value produces a readable error naming the key; the app keeps running with defaults
- [ ] Folders in `columns` that do not exist under the planning root are reported
- [ ] The config type is available in TypeScript through the generated bindings
- [ ] Unit tests cover defaults, a full file and invalid values

## Implementation notes

## Result
