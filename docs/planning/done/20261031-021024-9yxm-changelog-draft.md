---
id: 20261031-021024-9yxm
title: Changelog draft
tags: [planning]
created: 2026-10-31
implements: [S-changelog]
depends_on: []
completed: 2026-10-31
---

## Description
Phase 4. 

Implements `S-changelog` in the [spec](../spec.md).

## Acceptance criteria
- [x] Writes `CHANGELOG.md` entries from the terminal column since a date or git tag, grouped by tag
- [x] Shows the draft first; writes only after confirmation
- [x] Existing changelog content is kept; new entries are added at the top

## Implementation notes
- Rust `src-tauri/src/domain/changelog.rs`: tags and tag dates from read-only `git log` through `std::process::Command` (as the terminal starts its process), the draft grouped by first tag, the insertion into `CHANGELOG.md`, the checked write. Commands `changelog_tags`, `draft_changelog`, `write_changelog`.
- Frontend: `src/stores/changelog-store.ts`, `src/lib/changelog.ts`, `src/components/changelog.tsx`; a Changelog button in the project bar opens the form below it, like Split spec.
- Grouping, entry content, tag date and placement: D-20261031-022601-txnp.
- Done. Nothing open.

## Result
A Changelog button in the project bar opens a form: since a date or since a git tag (the newest tag preselected; disabled with the reason without git or outside a repository). Preview shows the `## <today>` section with entries grouped by each task's first tag (`Other` last), each `- Title ([id](path))`, and lists the terminal tasks left out for lack of a `completed` date. "Write CHANGELOG.md" adds the section after the title and intro, before the first `## ` heading, keeping the rest byte for byte; the write is refused when the file changed since the preview. Only `git log` is run.
- `npm run check` passes (tsc, biome, 266 tests); `cargo test` (186 passed, 1 ignored) and `cargo clippy --all-targets` are clean. The tag path is tested against a scratch git repository the test creates.
- Not tried in the running app: the form layout, the native date input and tag select in the webview, and the git lookup from a bundled app (a GUI app's PATH on macOS may not reach a git outside `/usr/bin`) were not checked by hand. Windows (`CREATE_NO_WINDOW`) is untested.
