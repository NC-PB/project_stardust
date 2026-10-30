---
id: 20260918-200000-0a1f
title: Specification
tags: [spec]
created: 2026-09-18
status: sketch
reviewed: 2026-10-30
---

# Specification

Single source of truth for the tool. Structure nodes describe current intended behaviour; tasks are changes that implement them. A ticked node means clarified, not implemented. Implementation is traced through the `implements` field of task files.

## Vision

Solo developers who build software with coding agents lose the thread between sessions: they forget what was decided, the agent never knew, and plans rot in a TODO file. This tool keeps the plan as plain markdown in the repository, helps clear the unknowns before code is written, and keeps a kanban board whose state the agent maintains itself. It works with any agent, needs no server, and every file stays readable without the tool.

## Scope

### In
- Capture, ideation, specification, task workflow, agent conventions, lifecycle, multi-project workspace, all as described in the Structure.

### Out
- Agent execution and orchestration, git worktrees, live agent output
- Remote or mobile access, cloud sync, MCP server
- Any daemon, git hook, web server or auto-commit
- Tool-only state files (the config file is the single exception)

### Later
- Combined view across projects (`S-combined-view`)

## Constraints

- Tauri 2, Rust backend, web frontend. Desktop only: Windows, macOS, Linux.
- No background process. Nothing runs when the app is closed.
- No network calls.
- The tool never calls an agent.
- The tool never writes to git: no commit, no staging, no branches. Read-only `git log` is allowed. Works in folders without git.
- Plain markdown compatibility: every file renders on GitHub, GitLab, in Obsidian and VS Code. Tool semantics only through frontmatter, standard task lists, standard links, standard blockquotes and inline code. No custom syntax.
- Frontend: React with TypeScript in strict mode, built with Vite, inside the Tauri webview (`S-frontend`).
- Libraries for the heavy parts: CodeMirror 6, remark/rehype (unified), Markmap, Mermaid. Rust: `notify`, `tauri-plugin-global-shortcut`, `tauri-plugin-store`, `tauri-plugin-shell`.
- Logic lives in Rust and in pure TypeScript modules with tests; React components only render.

## Domain

### Areas
- Planning (core): tasks, columns, task workflow, lifecycle
- Ideation (core): spec, structure, questions, decisions, gate
- Agent interface (core): planner block, prompts, adapters
- Files (supporting): ids, watching, links, images, doctor
- Workspace (supporting): config, projects, capture, theme
- Platform (supporting): Tauri shell, frontend framework
- Editor (generic): CodeMirror based markdown editing
- Search (generic): full text index from a library

### Entities
- Project: a repository with a `docs/planner.yml`.
- Column: a folder under the planning root listed in `columns`. One column is terminal.
- Task: one markdown file in a column. Identity: id in the filename.
- Spec: `spec.md` or the `spec/` folder. Holds Structure, Rules, Questions, Decisions.
- Node: an item of the Structure. Identity: slug id `S-...`.
- Rule: an invariant. Identity: slug id `R-...`.
- Question, Decision: append-only entries. Identity: `Q-` and `D-` timestamp ids.
- Proposal: a blockquote starting with `**Proposal:**`, written by an agent.
- Planner block: the generated section in `AGENTS.md`.
- Prompt: a template the user copies to an agent.

### Rules
- `R-one-task-per-file` · A task file holds exactly one task. Braindump and notes may hold many ideas but are not tasks.
- `R-one-column` · A task lives in exactly one column; its column is its folder. There is no status field.
- `R-unique-ids` · Ids are unique across the planning root, including the archive.
- `R-filename-truth` · When filename id and frontmatter id differ, the filename wins.
- `R-append-only` · Questions and Decisions only grow. Entries can be marked answered or superseded, never removed or edited.
- `R-spec-is-truth` · Node criteria describe current behaviour. Tasks are changes; finishing a task updates the criteria of the nodes it implements.
- `R-tick-means-clear` · A ticked node is clarified, not implemented.
- `R-no-destroy` · The tool never removes human text silently. Deletes go to the OS trash.
- `R-no-git-writes` · The tool never writes to git.
- `R-plain-markdown` · Every file the tool or an agent writes renders without the tool.

### Workflows
- Capture: braindump → Make task → `inbox/`
- Ideation: Structure this → Interview me → answer → Integrate answers → repeat until gate → Generate tasks
- Delivery: `inbox/` → triage → `next/` → work → verify → update spec → `done/`
- Session: orient at start → work → handoff at end
- Change after the gate: new question or node → ideation loop for that subtree → tasks

## Structure

Ticked = clarified. Criteria are sub-bullets. Domain areas first, then their parts.

- Planning `S-planning`
  - [x] Project init `S-init`
    - Creates `docs/planner.yml`, `braindump.md`, `spec.md`, `inbox/`, `next/`, `done/` under the planning root.
    - Offers to add the image root to `.gitignore` and the planner block to `AGENTS.md`.
    - Never overwrites an existing file (`R-no-destroy`).
    - Every generated file renders on GitHub and in any markdown editor (`R-plain-markdown`).
  - [x] Task file format `S-task-format`
    - One task per file (`R-one-task-per-file`). Filename `<id>-<slug>.md`.
    - Frontmatter: `id`, `title`, `created` required; `tags`, `priority` (1 to 5), `depends_on`, `parent`, `implements`, `completed` optional.
    - Sections: Description, Acceptance criteria, Implementation notes, Result. See `templates/task.md`.
  - [x] Board columns `S-board-columns`
    - The board shows the folders listed in `columns`, in config order.
    - Folders not listed in `columns` are not shown.
  - [x] Drag and drop `S-board-dnd`
    - Dropping a card in another column moves the file (`R-one-column`).
    - Moving into the terminal column sets `completed` to today; moving out removes it.
  - [x] Cards `S-board-card`
    - Show title, tags, age since last change, sub-task count, blocked marker, new-since-last-visit marker, commit info (`S-commit-info`).
  - [x] Tag filter `S-board-filter`
    - Filtering by one or more tags hides cards without them, in all columns.
  - [x] Sort `S-board-sort`
    - Per column: priority, created, dependency order.
  - [x] Make task `S-make-task`
    - Selecting text in any file and choosing "Make task" creates a task file in `inbox/` with the selection as Description and a link back to the source file.
  - [x] Sub-tasks `S-subtasks`
    - A task with `parent: <id>` is a child. The parent card shows the child count.
  - [x] Dependencies `S-dependencies`
    - A task whose `depends_on` contains a task outside the terminal column is shown as blocked.
  - [x] Traceability `S-trace`
    - Tasks reference nodes in `implements`.
    - The tool lists tasks without `implements` and clarified nodes without any task.
    - A node shows the tasks that implement it.
    - Finishing a task updates the criteria of the nodes it implements (`R-spec-is-truth`).
  - [x] Archive `S-archive`
    - Moves terminal tasks older than the current month into `done/YYYY-MM/`, after showing the list.
  - [x] Staleness `S-staleness`
    - Tasks in `next/` older than `stale_after_days` are flagged.
    - Spec files with `reviewed` older than `review_after_days` are flagged.
    - Code paths mentioned in tasks that do not exist are flagged.
    - A Stale view lists everything flagged, blocked or broken.
  - [x] Commit info `S-commit-info`
    - Cards show how many commits mention the task id and the date of the last one, from read-only `git log` (`R-no-git-writes`).
    - This is information only. A mention never moves a card or marks it done.
  - [x] Changelog draft `S-changelog`
    - Writes `CHANGELOG.md` entries from the terminal column since a date or tag, grouped by tag, after preview.
- Ideation `S-ideation`
  - [x] Spec file `S-spec-file`
    - Sections: Vision, Scope, Constraints, Domain, Structure, Questions, Decisions, Glossary. See `templates/spec.md`.
    - Single file `spec.md` by default; the `spec/` folder form when it exists. Both handled by the same code.
  - [x] Split spec `S-spec-split`
    - "Split spec" moves each section into its own file under `spec/`, after preview, rewriting links.
  - [x] Structure nodes `S-nodes`
    - Nested list. Each node has an id in inline code, an optional checkbox, criteria as sub-bullets, an optional link to the blocking question, an optional `#later`.
    - Domain areas are the top level.
    - A tick marks a node as clarified; implementation is shown through `S-trace` (`R-tick-means-clear`).
  - [x] Questions form `S-questions`
    - Shows open questions with an answer field. Saving appends the answer and moves the entry to Answered (`R-append-only`).
  - [x] Decisions log `S-decisions`
    - The editor allows appending entries and adding "Superseded by" lines only (`R-append-only`).
  - [x] Fog meter `S-fog-meter`
    - Shows ticked versus unticked nodes and answered versus open questions.
  - [x] Gate `S-gate`
    - Met when: no open blocking questions; every node not tagged `#later` is ticked and has at least one criterion; every rule is referenced by at least one node.
  - [x] Mind map `S-mindmap`
    - Renders the Structure with Markmap, unticked nodes greyed out. Mermaid blocks render in the preview.
  - [x] Proposals `S-proposals`
    - Blockquotes starting with `**Proposal:**` get Accept (unwrap) and Reject (delete) actions.
  - [x] Glossary `S-glossary`
    - Glossary terms show their definition on hover in the preview.
- Agent interface `S-agents`
  - [x] Planner block `S-agents-block`
    - Written into `AGENTS.md` between `<!-- planner:start -->` and `<!-- planner:end -->`; content outside is never touched.
    - Regenerated on every config change. Under 60 lines. See `templates/AGENTS-block.md`.
    - With `claude_import: true` (default), the tool adds the line `@AGENTS.md` to `CLAUDE.md`, creating the file if needed, and only if the line is not already there.
    - With `claude_mirror: true`, the block is also written into `CLAUDE.md` between the same markers, for agents without imports.
  - [x] Prompt buttons `S-prompts`
    - Each copies a filled template from `templates/prompts.md` to the clipboard: Work on task, Verify task, Verify area, Handoff, Triage inbox, Structure this, Interview me, Integrate answers, Generate tasks.
  - [x] Adapters `S-adapters`
    - On request, generates agent command files that wrap the prompts, starting with Claude Code (`.claude/commands/`). Never required.
  - [x] Open terminal `S-terminal`
    - Opens the user's terminal in the repository root. Nothing else.
  - [x] Session panel `S-session-panel`
    - Computed, nothing written: tasks in `next/` in order, last five decisions, open blocking questions, Result of the most recently completed task.
- Files `S-files`
  - [x] Ids `S-ids`
    - Tasks: millisecond timestamp plus 4 random characters, `YYYYMMDD-HHMMSS-xxxx`.
    - Questions and decisions: same with `Q-` and `D-` prefix.
    - Nodes and rules: readable slugs with `S-` and `R-` prefix.
  - [x] Watcher `S-watcher`
    - Changes on disk appear on the board and in open files without user action.
    - Moves are detected as moves by id, not as delete and create.
  - [x] Conflicts `S-conflicts`
    - An open file without unsaved edits reloads silently.
    - An open file with unsaved edits keeps the user's version and shows "changed on disk" with a reload button.
  - [x] Links `S-links`
    - Links are relative markdown links. Moving a file rewrites all links to it.
    - A broken link is resolved by the id in the filename and repaired, with a notice.
    - Link autocomplete by title or id. Backlinks panel for the open file.
  - [x] Images `S-images`
    - Dropping an image into the editor copies it to the image root and inserts a relative link.
    - Images render inline. A missing image shows a badge.
  - [x] Doctor `S-doctor`
    - Reports duplicate ids (`R-unique-ids`), missing ids, id mismatches (`R-filename-truth`), broken links, missing images, frontmatter errors, untraced tasks.
    - Never fixes without confirmation.
  - [x] Trash `S-trash`
    - Every delete goes to the OS trash (`R-no-destroy`).
  - [x] Git attributes `S-gitattributes`
    - On request, writes `merge=union` for the questions and decisions files only.
- Workspace `S-workspace`
  - [x] Config `S-config`
    - `docs/planner.yml`. See `templates/planner.yml`.
  - [x] Projects `S-multi-project`
    - A workspace list of repositories, one tab and one board per project, recent projects on the start screen.
  - [ ] Combined view `S-combined-view` #later
    - Decide after phase 4 exit (D-20261030-213200-e05b).
  - [x] Quick capture `S-quick-capture`
    - A global hotkey opens a small window that appends a line to the braindump of the chosen project.
  - [x] Command palette `S-palette`
    - Every command is reachable from the palette.
  - [x] Theme `S-theme`
    - Light and dark, following the system by default.
- Platform `S-platform`
  - [x] Shell `S-tauri`
    - Tauri 2 app, signed builds for Windows, macOS, Linux.
    - `npm run tauri dev` opens one window titled "stardust" rendering the React page. Bundle identifier `dev.stardust.planner`.
    - The webview has a Content Security Policy that allows only the app itself and Tauri IPC; no remote sources.
    - No Tauri plugins yet; capabilities grant `core:default` only.
  - [x] Frontend `S-frontend`
    - React with TypeScript (`strict: true`), Vite.
    - UI components: shadcn/ui with Tailwind; component code lives in the repository.
    - State: Zustand. Drag and drop: dnd-kit. Editor: CodeMirror 6 via `@uiw/react-codemirror`. Markdown: remark/rehype.
    - Rust commands and TypeScript calls share generated types (tauri-specta); a signature mismatch is a compile error.
    - File operations, ids, frontmatter, links and gate checks are functions in Rust or plain TypeScript modules, not in components.
    - Tests: `cargo test` for Rust, Vitest for TypeScript. Lint and format: Biome.
    - Bindings are generated into `src/bindings.ts` on every debug start and by `cargo test`; the frontend calls Rust only through them. tauri-specta and specta are pinned to exact release candidates (D-20261030-211738-9tc3).
    - `npm run check` runs `tsc`, Biome and Vitest. Folder layout (Rust `domain/` and `commands.rs`; TypeScript `lib/`, `stores/`, `components/`) is described in `ARCHITECTURE.md`.
    - Installed so far: shadcn/ui (Button), Tailwind 4, Zustand. dnd-kit, CodeMirror and remark/rehype come with their tasks.
  - [x] Templates `S-templates`
    - Templates for spec, task, config, planner block and prompts ship inside the app.
    - If `templates_dir` (default `docs/templates/`) contains `task.md` or `spec.md`, the tool uses those instead of the built in ones.
    - The planner block and the prompts are not overridable.
- Editor `S-editor`
  - [x] Editing `S-editor-core`
    - CodeMirror 6 with markdown preview. Frontmatter editable as a form on top of the file.
  - [x] Layout `S-editor-layout`
    - Two modes per file, toggled with one shortcut: styled source and rendered read.
    - Styled source: CodeMirror 6 with sized headings, highlighted task lists, links, inline code and frontmatter; markup stays visible.
    - Read mode: remark/rehype rendering with images, Mermaid and proposal actions (`S-proposals`).
    - No split view.
  - [ ] Live preview `S-editor-live-preview` #later
    - Markup hidden until the cursor enters the line, in one pane.
- Search `S-search`
  - [x] Full text `S-search-fulltext`
    - Searches all files under the planning root, results while typing.
    - Index updated incrementally from watcher events. Thousands of files without noticeable lag.

## Questions

Append-only. Ids: `Q-YYYYMMDD-HHMMSS-xxxx`.

### Open
- (none)

### Answered
- [x] Q-20260920-110500-9b2f · Editor: live preview in place, or split view? Styled source mode plus rendered read mode; live preview later. (2026-10-30) → D-20261030-213000-2c8a
- [x] Q-20260920-111500-c2e0 · `CLAUDE.md`: copy of the block, or a one-line import? Import `@AGENTS.md`; mirror as fallback. (2026-10-30) → D-20261030-213100-91f4
- [x] Q-20260920-112000-8a4b · Is a combined view across projects needed at all? Deferred; decide after phase 4 exit. (2026-10-30) → D-20261030-213200-e05b
- [x] Q-20261030-120000-5e7c · Templates: shipped inside the app only, or overridable per project? Shipped in the app; `task.md` and `spec.md` overridable in `docs/templates/`. (2026-10-30) → D-20261030-213300-5ad6
- [x] Q-20260920-110000-3d1a · React + TypeScript or Svelte 5? React + TypeScript inside the Tauri webview; egui and Svelte rejected. (2026-10-30) → D-20261030-210000-7b4e
- [x] Q-20260919-101500-77c0 · One task per file? Yes, braindump holds many. (2026-09-19) → D-20260919-101800-3e9f
- [x] Q-20260919-102000-1c4d · Who moves tasks to next? The user, or the agent when asked. (2026-09-19) → D-20260919-102400-5b21
- [x] Q-20260919-103300-6a90 · Extra folders? Config file in the docs root. (2026-09-19) → D-20260919-104800-2ad7
- [x] Q-20260919-103400-e5b8 · Where do images live? `docs/images`, excluded from git. (2026-09-19) → D-20260919-104200-9f03
- [x] Q-20260919-103500-0f37 · Conflict handling? Reload silently. (2026-09-19) → D-20260919-103600-1e6a
- [x] Q-20260919-103700-a2c6 · Id format? Timestamp based. (2026-09-19) → D-20260919-103000-c8d4
- [x] Q-20260920-085000-7d21 · Separate session brief file? No, compute it. (2026-09-20) → D-20260920-093000-6f8e

## Decisions

Append-only. Ids: `D-YYYYMMDD-HHMMSS-xxxx`.

### D-20260918-201500-a71c · Markdown, file based, inside the repository
- Context: plans must survive tool changes and be readable by any agent.
- Decision: all planning data is plain markdown in the repository the project belongs to.
- Rejected: own database, cloud service.
- Consequences: `R-plain-markdown`; no lock-in; git history is the audit trail.

### D-20260919-101800-3e9f · One task per file
- Context: drag and drop moves files; half a file cannot move.
- Decision: exactly one task per file; braindump and notes may hold many ideas.
- Rejected: multiple tasks per file.
- Consequences: `R-one-task-per-file`.

### D-20260919-102400-5b21 · Status is the folder
- Context: state must be visible on GitHub and to an agent running `ls`.
- Decision: the column a task lives in is its folder. No status field.
- Rejected: status in frontmatter (two sources of truth, invisible when browsing).
- Consequences: `R-one-column`; some git diff noise on moves, accepted.

### D-20260919-103000-c8d4 · Timestamp ids with random suffix
- Context: several agents or branches may create tasks in the same second.
- Decision: millisecond timestamp plus 4 random characters; filename is the source of truth.
- Rejected: sequential counters (collide on branches), pure hashes (not sortable, unreadable).
- Consequences: `S-ids`, `R-filename-truth`.

### D-20260919-103600-1e6a · Reload silently, protect unsaved edits
- Context: agents change files while the app is open.
- Decision: reload silently; keep the user's version when there are unsaved edits.
- Rejected: always warn, diff dialog.
- Consequences: `S-conflicts`.

### D-20260919-104200-9f03 · Images outside git
- Context: binaries bloat repositories.
- Decision: `docs/images`, excluded from git.
- Rejected: images in git, external storage.
- Consequences: images can be missing on other machines; `S-images` shows a badge.

### D-20260919-104800-2ad7 · Config file in the docs root
- Context: user defined folders need order and meaning.
- Decision: `docs/planner.yml`; default columns inbox, next, done.
- Consequences: `S-config`. The config is the single tool-only file.

### D-20260919-160000-7c19 · Kanban, not Gantt
- Context: the first outline said Gantt; the intent was a board.
- Decision: kanban board with folders as columns.
- Consequences: no timeline view.

### D-20260920-090000-4be2 · No server, no agent execution, agent agnostic
- Context: comparable tools either run agents (Vibe Kanban) or install daemons and hooks (Beads); both cost trust and lock-in.
- Decision: no web server, no daemon, no hooks, the tool never calls an agent; conventions are plain text any agent reads.
- Rejected: built-in agent runner, MCP server.
- Consequences: round trip through prompts, adapters and the terminal button; see Constraints.

### D-20260920-091500-d358 · Full scope, built in phases
- Decision: every feature in the Structure is planned; `notes/phases.md` orders them.
- Rejected: a reduced v1 with a separate v2 list.

### D-20260920-093000-6f8e · No tool-only state files
- Context: a session brief file would be a new artifact to keep current.
- Decision: orientation is computed (`S-session-panel`) for the human and is a reading order in the planner block for the agent.
- Consequences: Decisions are the agent's memory of intent.

### D-20260920-094500-0c4a · Lifecycle rules in the block, step checks in prompts
- Context: standing instructions fade during a session; agents act on events, not "regularly".
- Decision: the planner block holds rules hung on session start, task start, working, finishing; each prompt repeats the check that matters for its step.
- Consequences: agent obligations stay few; prompts carry the rest.

### D-20260920-100000-b2e5 · Commit mentions are not a done signal
- Context: a task id in a commit message does not mean the task is finished.
- Decision: commit info is shown as information only.
- Consequences: `S-commit-info`; done means Result filled and file moved.

### D-20261030-120500-4d6b · The spec is the truth, tasks are changes
- Context: with acceptance criteria only in tasks, the description of the system ends up scattered across the archive and drifts from the code.
- Decision: Structure nodes carry the acceptance criteria of current behaviour; tasks reference nodes in `implements`; finishing a task updates the node criteria.
- Rejected: separate `specs/` and `changes/` trees (heavier, a second road).
- Consequences: `R-spec-is-truth`, `S-trace`, Verify area prompt.

### D-20261030-121000-8e1a · Rename idea to spec
- Context: the document lives on after the gate as the architecture and behaviour description.
- Decision: `idea.md` becomes `spec.md`, `idea/` becomes `spec/`.
- Supersedes: the idea naming used up to 2026-09-20.

### D-20261030-121500-f3c9 · Domain first Structure, Constraints and Domain sections
- Context: a Structure by modules and views makes agents build screens first; unstated constraints get violated.
- Decision: the Structure is grouped by domain areas; the spec gains Constraints and Domain (areas, entities, rules, workflows); the Glossary is binding for names in code.
- Rejected: full tactical DDD (aggregates, repositories), event storming UI.
- Consequences: `S-nodes`, `S-gate` checks rules; Interview me asks domain questions first.

### D-20261030-122000-27b5 · Readable slug ids for nodes and rules
- Context: humans read and type node ids in tasks.
- Decision: `S-` and `R-` slugs; uniqueness checked by the doctor.
- Rejected: timestamp ids for nodes.

### D-20261030-210000-7b4e · React and TypeScript inside Tauri
- Context: the frontend must be a good choice for coding agents; the tool is mostly rich text (editor, markdown, Mermaid, Markmap).
- Decision: React with strict TypeScript and Vite in the Tauri webview; shadcn/ui, Tailwind, Zustand, dnd-kit, CodeMirror 6, remark/rehype, tauri-specta, Vitest, Biome. Logic stays out of components.
- Rejected: egui (replaces Tauri, no CodeMirror equivalent, Mermaid and Markmap unavailable, weaker agent output); Svelte 5 (agents still mix Svelte 4 and 5 syntax).
- Consequences: `S-frontend` ticked; generated Rust to TypeScript types from the first commit.

### D-20261030-213000-2c8a · Styled source and read mode, no split view
- Context: the editor shares the window with a board; full live preview is the most expensive editor feature.
- Decision: styled source mode plus rendered read mode, toggled per file.
- Rejected: split view (costs half the width), live preview in phase 1 (cost).
- Consequences: `S-editor-layout` ticked; live preview becomes `S-editor-live-preview` #later.

### D-20261030-213100-91f4 · CLAUDE.md imports AGENTS.md
- Context: a copied block can drift from the original.
- Decision: the tool writes `@AGENTS.md` into `CLAUDE.md`; mirroring the block stays available as a fallback.
- Consequences: `S-agents-block` criteria; config keys `claude_import` and `claude_mirror`.

### D-20261030-213200-e05b · Combined project view deferred
- Decision: no combined view for now; decide after phase 4 exit, based on whether daily use with three projects asked for it.
- Consequences: `S-combined-view` stays #later.

### D-20261030-213300-5ad6 · Templates ship in the app, two are overridable
- Context: projects may want their own task and spec layout; the tool depends on the exact wording of the block and prompts.
- Decision: all templates ship in the app; `task.md` and `spec.md` can be overridden per project in `templates_dir`.
- Rejected: fully overridable templates, templates only in the project.
- Consequences: `S-templates` ticked; config key `templates_dir`.

### D-20261030-211738-9tc3 · tauri-specta release candidates, pinned exactly
- Context: D-20261030-210000-7b4e chose tauri-specta, but it has no stable release for Tauri 2; only `2.0.0-rc.x` exists, and the project uses stable releases otherwise.
- Decision: use `tauri-specta =2.0.0-rc.26`, `specta =2.0.0-rc.26`, `specta-typescript =0.0.13`, pinned with `=` as the crate documentation requires. Approved by the user on 2026-10-30.
- Rejected: replacing tauri-specta (ts-rs, taurpc), which would change the decided stack.
- Consequences: updates to these crates are deliberate and checked against the generated `src/bindings.ts`; move to the stable release once it exists.

## Glossary

- Planning root: the folder holding the planning files, `docs/planning` by default.
- Column: a folder under the planning root listed in `columns`.
- Terminal column: the column that means finished, `done` by default.
- Task: one unit of work in one file. Seen from the spec, a task is a change.
- Braindump: the single capture file for loose ideas.
- Spec: this document, single file or split folder.
- Structure: the nested list of nodes in the spec. The only name for it; not "map".
- Node: an item of the Structure with a slug id and acceptance criteria.
- Fog: everything unclear; unticked nodes and open questions.
- Gate: the condition under which the spec is clear enough to generate tasks.
- Rule: an invariant of the domain, slug id `R-...`.
- Proposal: an agent's suggested change to human text, as a marked blockquote.
- Planner block: the generated section in `AGENTS.md`.
- Prompt: a template copied to an agent for one step.
- Adapter: generated agent command files wrapping the prompts.
- Area: a top level part of the domain, core, supporting or generic.
