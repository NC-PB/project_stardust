---
id: 20261030-220005-24ef
title: Write the planner block into AGENTS.md
tags: [agents]
created: 2026-10-30
implements: [S-agents-block]
depends_on: [20261030-220002-5dbd, 20261030-220004-2a22]
completed: 2026-10-30
---

## Description
Generate the agent conventions from `templates/AGENTS-block.md` with placeholders filled from the config.

Implements `S-agents-block` in the [spec](../spec.md).

## Acceptance criteria
- [x] The block is written into `AGENTS.md` between `<!-- planner:start -->` and `<!-- planner:end -->`; content outside the markers is unchanged
- [x] Without markers, the block is appended; without `AGENTS.md`, the file is created
- [x] Placeholders are filled from the config; the block stays under 60 lines
- [x] With `claude_import: true`, `@AGENTS.md` is added to `CLAUDE.md` only if the line is missing
- [x] With `claude_mirror: true`, the block is also written into `CLAUDE.md` between the same markers
- [x] Unit tests cover existing content before and after the markers

## Implementation notes
- Done: `src-tauri/src/domain/agents_block.rs` (`render_block`, `spec_location`, `insert_block`, `add_claude_import`, `write_planner_block`) and command `write_planner_block(repo_root)`. Files are written only when their content changes; CRLF files keep CRLF; a lone or misordered marker is refused and nothing is written. A test checks that this repository's `AGENTS.md` holds the current block.
- Checks: `cargo test` (63 passed), `cargo clippy --all-targets`, `npm run check`.
- Moved: "The block is regenerated when the config changes" went to the [file watcher task](20261030-220007-e420-file-watcher-with-move-detection.md), accepted by the user (D-20261030-220523-8397).
- Not done on purpose: turning `claude_mirror` off does not remove an earlier mirrored block from `CLAUDE.md` (`R-no-destroy`).
- Found: the template names the columns literally, see [inbox task](../inbox/20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md).

## Result
`src-tauri/src/domain/agents_block.rs` renders `templates/AGENTS-block.md` with `{planning_root}` and `{spec_location}` filled from the config and writes it. In TypeScript: `writePlannerBlock(repoRoot)` returns `{ written }`, the files that changed.

- Text outside the markers is kept byte for byte; without markers the block is appended, without the file it is created. Only changed files are written.
- `claude_import` adds `@<agents_file>` to `CLAUDE.md` when the line is missing; `claude_mirror` writes the block there too. Neither removes anything from `CLAUDE.md`.
- One marker alone or markers out of order: error, nothing written.
- `this_repository_block_is_current` fails when `AGENTS.md` and the template drift apart; the [wording task](20261030-215109-0my7-valid-frontmatter-and-id-wording-in-agent-instructions.md) has to change both together.
- Regeneration on config change moved to the [file watcher task](20261030-220007-e420-file-watcher-with-move-detection.md).

### Next session
- `next/` is empty. Phase 1 candidates: [project init](20261030-220006-6602-project-init.md) (all dependencies done now) and the [file watcher](20261030-220007-e420-file-watcher-with-move-detection.md).
- Waiting for wording approval: [frontmatter and id wording](20261030-215109-0my7-valid-frontmatter-and-id-wording-in-agent-instructions.md), [column names in the block](../inbox/20261030-215737-w828-column-names-in-the-planner-block-from-the-config.md).
