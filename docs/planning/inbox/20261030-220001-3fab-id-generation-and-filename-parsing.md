---
id: 20261030-220001-3fab
title: Id generation and filename parsing
tags: [files]
created: 2026-10-30
implements: [S-ids]
depends_on: [20261030-220000-0822]
---

## Description
Rust module for ids and filenames. Pure functions with tests, exposed to TypeScript through tauri-specta.

> **Proposal:** `S-ids` says "millisecond timestamp" but the format `YYYYMMDD-HHMMSS-xxxx` has second resolution. With 4 hex characters, many ids in the same second can collide. Either add milliseconds (`YYYYMMDD-HHMMSS-mmm-xxxx`) or keep the format and rely on the collision check below. Needs a decision before implementing.

Implements `S-ids` in the [spec](../spec.md).

## Acceptance criteria
- [ ] Task ids are generated as `YYYYMMDD-HHMMSS-xxxx` with 4 random lowercase hex characters (format pending the proposal above)
- [ ] `Q-` and `D-` prefixed ids are generated the same way
- [ ] Generating an id checks existing ids in the planning root, including the archive, and retries on collision (`R-unique-ids`)
- [ ] The id is parsed from a filename `<id>-<slug>.md`; the slug is built from a title (lowercase, ascii, hyphens)
- [ ] Unit tests cover generation, prefixes, parsing, slugs and collision retry

## Implementation notes

## Result
