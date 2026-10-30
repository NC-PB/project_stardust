---
id: 20260920-120000-c41d
title: Build phases
tags: [phases]
created: 2026-09-20
---

# Build phases

Every node in the [spec](../spec.md) is in scope. This note only orders them. Each phase ends with using the tool on a real project for at least a week; what hurts goes to the top of the next phase.

## Before Phase 1
All blocking questions are answered (2026-10-30). Next step: run Generate tasks for the Phase 1 nodes.

## Phase 1: A board the agent and I both trust
`S-tauri`, `S-frontend`, `S-config`, `S-templates`, `S-init`, `S-ids`, `S-task-format`, `S-board-columns`, `S-board-dnd`, `S-board-card` (without commit info), `S-board-filter`, `S-watcher`, `S-conflicts`, `S-editor-core`, `S-editor-layout`, `S-make-task`, `S-search-fulltext`, `S-agents-block`, `S-prompts` (Work on task, Verify task, Handoff, Triage inbox), `S-terminal`, `S-trash`, `S-theme`.

Exit: two weeks of real use. The agent moved files to `done/` without being reminded, and the board matched reality at every session start.

## Phase 2: Spec and ideation
`S-spec-file`, `S-nodes`, `S-questions`, `S-decisions`, `S-fog-meter`, `S-gate`, `S-trace`, `S-prompts` (Structure this, Interview me, Integrate answers, Generate tasks, Verify area), `S-proposals`, `S-glossary`, `S-session-panel`, `S-mindmap`, `S-spec-split`, `S-adapters`.

Exit: one new project planned from braindump to tasks with the loop, tasks generated with `implements`, and node criteria updated by the agent when finishing tasks.

## Phase 3: Robustness
`S-links`, `S-images`, `S-doctor`, `S-archive`, `S-gitattributes`, `S-palette`, search scaling within `S-search-fulltext`.

Exit: doctor reports zero findings on a project with at least 200 task files, including an archive and a branch merge.

## Phase 4: Lifecycle and scale
`S-staleness`, `S-commit-info`, `S-changelog`, `S-subtasks`, `S-dependencies`, `S-board-sort`, `S-multi-project`, `S-quick-capture`.

Exit: three projects in the workspace, one at least two months old, with the Stale view showing only things that are actually stale.
