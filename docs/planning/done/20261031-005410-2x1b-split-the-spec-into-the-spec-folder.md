---
id: 20261031-005410-2x1b
title: Split the spec into the spec folder
tags: [ideation, files]
created: 2026-10-31
implements: [S-spec-split]
depends_on: [20261031-005358-alo6]
completed: 2026-10-31
---

## Description
General link rewriting on moves is `S-links` in phase 3; this task only rewrites links that point into `spec.md`.

Implements `S-spec-split` in the [spec](../spec.md).

## Acceptance criteria
- [x] "Split spec" shows a preview of the files it will create, then moves each section into its own file under `spec/`
- [x] Links in planning files that point into `spec.md` are rewritten to the new files
- [x] The parser gives the same model before and after the split
- [x] `spec.md` goes to the OS trash after the split (`R-no-destroy`)

## Implementation notes
- Done: `src-tauri/src/domain/spec_split.rs` (`plan_split`, `split_spec`, 7 tests); commands `plan_spec_split`, `split_spec`; `src/stores/split-store.ts` with tests; `src/components/spec-split.tsx`; "Split spec" in the project bar.
- Never run on this repository's own spec; the tests split a copy in a temp folder.

## Result
"Split spec" in the project bar appears while the spec is a single file. It previews the files under `spec/` with line counts and first lines, every link that will be rewritten (old → new) and anything that blocks the split. After the user confirms, `spec.md` is cut at its `## ` headings into the folder form, links into it in the planning files and links in the moved text are rewritten, the folder is read back and compared with the model of `spec.md`, and `spec.md` goes to the OS trash. A planner block already in the agents file is regenerated so it names `spec/`. When a step fails, the earlier steps are undone and `spec.md` stays.
- Not tried by hand; the OS trash and the button were covered only by tests with a fake trash and mocked commands.
- Links from outside the planning root, for example in `ARCHITECTURE.md`, are not rewritten (`S-links`).

### Next session
- Wave 2 of phase 2 is done. Left in the inbox that is now unblocked: [Questions form](../done/20261031-005401-myb8-questions-form.md), [Traceability](../done/20261031-005404-dtp7-traceability-between-tasks-and-nodes.md), [Prompt buttons for ideation](../done/20261031-005405-oomn-prompt-buttons-for-ideation.md); then [Agent adapters](../inbox/20261031-005411-6h8i-agent-adapters-starting-with-claude-code.md). Signed release builds stay skipped.
- None of the phase 2 views has been tried by hand in `npm run tauri dev` yet.
