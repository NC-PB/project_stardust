# project_stardust

A file based, markdown native desktop tool that takes a software idea from the first note to the finished product, with a coding agent of the user's choice doing the implementation. Working name: none yet.

This repository plans itself with its own format.

## Where things are

- `docs/planning/spec.md`: the specification. Single source of truth: vision, scope, constraints, domain, structure with acceptance criteria, questions, decisions, glossary.
- `docs/planning/notes/phases.md`: build order, by Structure node id.
- `docs/planning/notes/prior-art.md`: comparable tools and what users complain about.
- `docs/planning/inbox/`, `next/`, `done/`: tasks, one per file.
- `docs/planning/braindump.md`: loose capture.
- `docs/planner.yml`: configuration of the tool, for this repository.
- `templates/`: the files the tool generates in a user's repository (spec, task, config, planner block, prompts).
- `AGENTS.md`: conventions for coding agents working in this repository.
- `docs/release.md`: signed release builds in CI and the secrets they need.
