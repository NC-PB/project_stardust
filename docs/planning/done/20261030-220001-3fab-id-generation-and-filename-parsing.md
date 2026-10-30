---
id: 20261030-220001-3fab
title: Id generation and filename parsing
tags: [files]
created: 2026-10-30
implements: [S-ids]
depends_on: [20261030-220000-0822]
completed: 2026-10-30
---

## Description
Rust module for ids and filenames. Pure functions with tests, exposed to TypeScript through tauri-specta.

> **Proposal:** `S-ids` says "millisecond timestamp" but the format `YYYYMMDD-HHMMSS-xxxx` has second resolution. With 4 hex characters, many ids in the same second can collide. Either add milliseconds (`YYYYMMDD-HHMMSS-mmm-xxxx`) or keep the format and rely on the collision check below. Needs a decision before implementing.

> Decided by the user on 2026-10-30: keep `YYYYMMDD-HHMMSS-xxxx` (second resolution) and rely on the collision check. The suffix is 4 characters from `[a-z0-9]`, not hex, because existing ids such as `D-20261030-211738-9tc3` already use base36. The `S-ids` wording "millisecond" is corrected when this task finishes. Recorded as D-20261030-213854-k3cv.

Implements `S-ids` in the [spec](../spec.md).

## Acceptance criteria
- [x] Task ids are generated as `YYYYMMDD-HHMMSS-xxxx` with 4 random characters from `[a-z0-9]` (decided above)
- [x] `Q-` and `D-` prefixed ids are generated the same way
- [x] Generating an id checks existing ids in the planning root, including the archive, and retries on collision (`R-unique-ids`)
- [x] The id is parsed from a filename `<id>-<slug>.md`; the slug is built from a title (lowercase, ascii, hyphens)
- [x] Unit tests cover generation, prefixes, parsing, slugs and collision retry

## Implementation notes
- 2026-10-30: Proposal decided (see above). Plan: `src-tauri/src/domain/ids.rs` with pure functions; the clock, randomness and the set of existing ids are passed in so tests are deterministic. Existing ids = every id-shaped token in filenames and file contents under the planning root, recursively (covers `done/YYYY-MM/` and Q/D ids inside the spec). Direct deps `chrono` (local time), `fastrand`, `walkdir`, all already in the lock file through Tauri. Commands `new_id`, `parse_task_filename`, `task_filename`; the planning root is a command argument until planner.yml lands.

- Done: all criteria. `cargo test` (16 tests, 14 new), `cargo clippy --all-targets` clean, `npm run check` passes. `S-ids` criteria updated, D-20261030-213854-k3cv appended, Glossary gained Slug. Nothing open.

## Result
`src-tauri/src/domain/ids.rs` generates, finds and parses ids. Three commands are in `src/bindings.ts`: `newId(planningRoot, kind)` with `kind` `"Task" | "Question" | "Decision"`, `parseTaskFilename(name)` returning `{ id, slug }` or `null`, and `taskFilename(id, title)`.

- Format stays `YYYYMMDD-HHMMSS-xxxx` in local time, suffix `[a-z0-9]` (D-20261030-213854-k3cv). Collision check: every id-shaped token in filenames and markdown contents under the planning root, recursively, so archive folders and Q/D ids in the spec count. Ids that are only referenced also count as taken.
- Slugs: lowercase ascii words, common Latin diacritics transliterated, max 60 characters at a word boundary. They reproduce all existing task filenames.
- Pure core (`generate_id`, `find_ids`, `parse_task_filename`, `slugify`) takes clock and randomness as arguments; `new_id` is the only part that reads the disk and the clock.
- `new_id` takes the planning root as an argument. Once planner.yml is read, callers should pass the configured root.

### Next session
- [planner.yml](20261030-220002-5dbd-read-and-validate-planner-yml.md) is in `next/`; after it, the task file model (depends on both) is unblocked.
- `AGENTS.md` line 9 and `templates/AGENTS-block.md` line 5 still say "millisecond timestamp"; left untouched because they are human text and outside this task. Ask the user.
