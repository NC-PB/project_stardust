---
id: 20260919-180000-e2a9
title: Prior art
tags: [research]
created: 2026-09-19
---

# Prior art

Summary of the field survey from September 2026. Figures from vendor and blog posts are indicative only.

## Tools
- Backlog.md: markdown native task manager and kanban for agents, CLI plus web UI, MCP connector. Praised for one task per file, git history, no lock-in. Complaints: id reuse and collisions on branches and after archiving, auto-commit sweeping unrelated changes, weak image handling, single project, slow with many branches.
- Beads: git backed graph tracker for agents with dependency graph. Concept admired; rejected by many for its daemon, git hooks, config overwriting and instability. Users replaced it with tiny markdown alternatives.
- Vibe Kanban: kanban that runs agents in git worktrees with diff review. Most popular tool of the category; the company shut down in April 2026, now community maintained. Bugs cluster around worktree cleanup.
- Spec Kit, Kiro specs, OpenSpec, BMAD: spec driven development. Valued artifacts; criticised as heavy, waterfall like, specs going stale because nothing writes back. OpenSpec is the light reaction (current specs plus change deltas). BMAD is the heavy extreme.
- Obsidian Kanban: markdown backed board, much loved, went unmaintained.
- Task Master AI: PRD to tasks generator; agents ignore it as projects grow.

## Recurring complaints, most frequent first
1. Plans go stale; agents drift from conventions during long sessions.
2. Too much ceremony (spec frameworks) or too invasive (daemons, hooks).
3. Git collisions: duplicate ids on branches, auto-commit side effects.
4. Missing or weak visual UI.
5. Lock-in and maintenance risk.
6. Specs not written back after implementation.
7. Requests: images, sub-tasks, multi-project, remote access.

## Consequences for this tool
See Decisions in the spec, especially D-20260919-103000-c8d4 (ids), D-20260920-090000-4be2 (no server, no execution), D-20260920-094500-0c4a (block versus prompts) and D-20261030-120500-4d6b (spec is truth).
