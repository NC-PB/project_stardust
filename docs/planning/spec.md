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
- Libraries for the heavy parts: CodeMirror 6, remark/rehype (unified), Markmap, Mermaid. Rust: `notify`, `tauri-plugin-global-shortcut`, `tauri-plugin-store`, `tauri-plugin-shell`, `tauri-plugin-dialog` (D-20261030-224813-t807).
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
    - An existing `docs/planner.yml` is kept and decides the planning root and the column folders; init then adds only what is missing. A `spec/` folder means no `spec.md` is created.
    - `spec.md` comes from the spec template (`S-templates`); spec and braindump get a new id and today's date.
    - Init reports each path as created or existing, and whether the `.gitignore` entry and the planner block are missing; separate commands add each one. The app shows each offer on its own with Add and Not now (D-20261030-224049-19xh).
    - Init refuses a repository folder that does not exist instead of creating it.
    - In the app: "Open repository" picks a folder with the native dialog; the folder is remembered in the app settings (`settings.json` of `tauri-plugin-store`, in the app data folder, never in the repository) and reopened on start. A folder without `docs/planner.yml` shows Initialize; after init the app lists created and existing paths and issues.
    - Implemented in `src-tauri/src/domain/init.rs`; commands `init_project(repo_root)`, `add_images_to_gitignore(repo_root)`. Frontend: `src/lib/project.ts`, `src/stores/project-store.ts`, `src/components/project-panel.tsx`.
  - [x] Task file format `S-task-format`
    - One task per file (`R-one-task-per-file`). Filename `<id>-<slug>.md`.
    - Frontmatter: `id`, `title`, `created` required; `tags`, `priority` (1 to 5), `depends_on`, `parent`, `implements`, `completed` optional.
    - Sections: Description, Acceptance criteria, Implementation notes, Result. See `templates/task.md`.
    - Reading never drops a file: every `*.md` file in a column is listed, with issues for a filename without id, missing frontmatter, invalid YAML, missing required fields and invalid values (field named). Invalid values are left out; a missing title is derived from the filename.
    - Frontmatter that is not valid YAML is reported, and `id`, `title`, `created`, `completed`, `parent` are still read from their `key: value` lines (D-20261030-215110-cgf7).
    - The filename id is the task id; a different frontmatter id is reported (`R-filename-truth`). Without an id in the filename the frontmatter id is used.
    - Dates are `YYYY-MM-DD`; `depends_on` and `parent` hold task ids. Unknown fields are kept and not reported.
    - Sections are the `## ` headings of the body outside code fences, with their text.
    - Writing a field replaces only that field's lines; a new field goes to the end of the frontmatter; removing a field deletes its lines. Comments, unknown fields, field order, list style, line endings and the body stay unchanged. Values are written plain when YAML reads them back unchanged, otherwise double quoted; lists in flow style `[a, b]`.
    - Implemented in `src-tauri/src/domain/task.rs`; commands `read_column`, `read_task`, `set_task_field`, `remove_task_field`.
  - [x] Board columns `S-board-columns`
    - The board shows the folders listed in `columns`, in config order, each with its task count; each column scrolls on its own.
    - Folders not listed in `columns` are not shown.
    - A listed column without a folder is shown empty with "No folder for this column"; a folder that cannot be read shows the error.
    - The board updates from watcher batches without reload: only the columns a batch touched are read again; a config change reloads the whole board (`S-watcher`).
    - Implemented in `src/lib/board.ts` (`columnDir`, `touchedColumns`), `src/stores/board-store.ts` (`useBoardStore`, loaded and updated by `useProjectStore`), `src/components/board.tsx`; columns are read with `read_column`.
  - [x] Drag and drop `S-board-dnd`
    - Dropping a card in another column moves the file (`R-one-column`). Cards are dragged with the mouse (after 5 px, so clicks on tags still work) or the keyboard; the target column is highlighted.
    - Moving into the terminal column sets `completed` to today; moving out removes it. A move between two other columns leaves the file text unchanged.
    - The card moves at once and lands at the end of the column. A failed move (a file with the same name in the target, a column without folder, an unreadable file) leaves the file and the card in the original column and shows the error until dismissed. An existing file is never overwritten (`R-no-destroy`) (D-20261030-232042-h9dm).
    - Implemented in `src-tauri/src/domain/board.rs` (`move_task`); command `move_task(repo_root, file_name, from, to)`. Frontend: `src/lib/board.ts` (`moveCard`), `src/stores/board-store.ts` (`moveTask`, `moveError`), `src/components/board.tsx` with `@dnd-kit/core`.
  - [x] Cards `S-board-card`
    - Show title, tags, age since last change, sub-task count, blocked marker, new-since-last-visit marker, commit info (`S-commit-info`).
    - Commit info is not built yet (phase 4).
    - Age is the time since the file's last change on disk (`modified` of a task), in the largest fitting unit: now, m, h, d, mo, y; recomputed every minute.
    - The sub-task count counts tasks in any column whose `parent` is the card's id (`S-subtasks`).
    - Blocked: a `depends_on` id whose task is in a column other than the terminal one (`S-dependencies`); the marker names the ids on hover. An id found in no column (archived or deleted) does not block (D-20261030-231221-spj4).
    - New: the file changed after the previous visit of the project. A visit is recorded when the project is opened and with every batch seen while it is open; last visits are kept per repository in the app settings, never in the repository. On the first visit nothing is new (D-20261030-231221-spj4).
    - Implemented in `src/lib/board.ts` (`cardsOf`, `ageLabel`, `isNewSince`).
  - [x] Tag filter `S-board-filter`
    - Filtering by one or more tags hides cards without them, in all columns: a card stays only when it carries every selected tag (D-20261030-231541-84sn).
    - The tag bar above the board lists every tag on the board; clicking a tag there or on a card adds it to the filter or removes it. "Clear filter" empties the filter in one action.
    - While filtering, each column shows its count as "shown of total".
    - The filter lives in the app for the session only; it is kept across watcher batches and reloads of the same project and emptied when another project is opened. Nothing is written to the repository or the settings.
    - Implemented in `src/lib/board.ts` (`boardTags`, `filterCards`), `src/stores/board-store.ts` (`tagFilter`, `toggleTag`, `clearTagFilter`), `src/components/board.tsx`.
  - [x] Sort `S-board-sort`
    - Per column: priority, created, dependency order.
  - [x] Make task `S-make-task`
    - Selecting text in any file and choosing "Make task" creates a task file in `inbox/` with the selection as Description and a link back to the source file.
    - "Make task" is a button in the editor header, enabled while text is selected: the markdown in source mode, the rendered text in read mode. The task goes to the first column of `columns`; the new file opens in the editor.
    - "Braindump" and "Spec" buttons in the project bar open those files in the editor; Spec only when the spec is a single file (D-20261031-000940-bhg8).
    - The new task is the task template (`S-templates`, override included) with its examples replaced: a new id, `title` from the first non-empty line of the selection without list, heading and quote markers (at most 80 characters, cut at a word), `created` today, `tags`, `implements`, `depends_on` as `[]`, no `priority`, `completed` or `parent`. Description is the selection followed by `Source: [<file name>](<relative link>)`; Acceptance criteria is one empty `- [ ] `; the other sections keep the template's text.
    - An empty selection, a missing first column folder or an existing file name is an error; nothing is overwritten.
    - Implemented in `src-tauri/src/domain/make_task.rs`; commands `make_task(repo_root, source, selection)` returning the new path, `source_files(repo_root)`.
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
    - Without markers the block is appended; without the file it is created. Only files whose content changes are written; line endings are kept.
    - A start or end marker alone, or the two out of order, is an error and nothing is written. Turning `claude_mirror` off does not remove an earlier mirrored block (`R-no-destroy`).
    - Placeholders filled from the config: `{planning_root}`, `{spec_location}` (`spec/` or `spec.md` under the planning root, following `spec`), and the columns: `{columns}` lists every column in config order with its role, `{new_column}`, `{ready_column}`, `{terminal_column}` name one (D-20261031-001850-0g9f).
    - Column roles, counted without the terminal column: new is the first column, ready for you the second; with one column before the terminal it is both; finished is the terminal column. Other columns are listed without a role. With the default config the block reads `inbox/`, `next/`, `done/` as before. Implemented in `src-tauri/src/domain/columns.rs`.
    - The block gives the id format as local time to the second plus 4 characters from `[a-z0-9]` (D-20261030-213854-k3cv), and tells agents to double-quote frontmatter values that YAML would misread, such as a title containing `: ` (`R-plain-markdown`).
    - Implemented in `src-tauri/src/domain/agents_block.rs`; command `write_planner_block(repo_root)` returns the files written. The watcher regenerates the block when `docs/planner.yml` changes (`S-watcher`, D-20261030-220523-8397).
  - [x] Prompt buttons `S-prompts`
    - Each copies a filled template from `templates/prompts.md` to the clipboard: Work on task, Verify task, Verify area, Handoff, Triage inbox, Structure this, Interview me, Integrate answers, Generate tasks.
    - Built so far (phase 1): Work on task, Verify task and Handoff in a "Copy prompt" row of the editor while the open file is a task directly in a column; Triage inbox on the header of the first column. The other five are readable and fillable but have no button yet.
    - Each prompt is the fenced block under its `## ` heading in the built in `templates/prompts.md`. Placeholders filled: `{planning_root}`, `{spec_location}` and the column names (`S-agents-block`) from the config, `{task_path}` (relative to the repository root) and `{node_id}` from the button. A placeholder without a value is an error and nothing is copied.
    - A notice confirms the copy for 2.5 s, or says why nothing was copied. The clipboard is written through the webview (D-20261031-001344-gumt).
    - Implemented in `src-tauri/src/domain/prompts.rs` (`Prompt`, `fill_prompt`); command `fill_prompt(repo_root, prompt, input)`; `src/stores/prompt-store.ts`, `src/lib/prompts.ts`.
  - [x] Adapters `S-adapters`
    - On request, generates agent command files that wrap the prompts, starting with Claude Code (`.claude/commands/`). Never required.
  - [x] Open terminal `S-terminal`
    - Opens the user's terminal in the repository root. Nothing else.
  - [x] Session panel `S-session-panel`
    - Computed, nothing written: tasks in `next/` in order, last five decisions, open blocking questions, Result of the most recently completed task.
- Files `S-files`
  - [x] Ids `S-ids`
    - Tasks: local time to the second plus 4 random characters from `[a-z0-9]`, `YYYYMMDD-HHMMSS-xxxx` (D-20261030-213854-k3cv).
    - Questions and decisions: same with `Q-` and `D-` prefix.
    - A new id is checked against every id-shaped token in the filenames and markdown contents under the planning root, archive included, and regenerated on collision (`R-unique-ids`). Task ids and Q/D ids share one space: the part after the prefix is unique.
    - Task filenames are `<id>-<slug>.md`; `<id>.md` is accepted when a title has no usable characters. The slug is the title in lowercase ascii words joined by hyphens, common Latin diacritics transliterated (umlauts as `ae`, `oe`, `ue`), at most 60 characters cut at a word boundary.
    - Implemented in `src-tauri/src/domain/ids.rs`; commands `new_id`, `parse_task_filename`, `task_filename`. The planning root is passed by the caller until `S-config` provides it.
    - Nodes and rules: readable slugs with `S-` and `R-` prefix.
  - [x] Watcher `S-watcher`
    - Changes on disk appear on the board and in open files without user action.
    - Moves are detected as moves by id, not as delete and create.
    - Watches the planning root recursively and the folder of `docs/planner.yml`; hidden files and editor backups (`.x.swp`, `x~`) are ignored.
    - Events are collected until no event arrived for 150 ms, at most 1 s, then sent as one batch: created, modified, removed and moved files with paths relative to the repository root, and whether the config changed (D-20261030-225824-5045).
    - A move is a file that disappeared and a file that appeared with the same task id in one batch; a touched folder covers every file under it.
    - A config change regenerates the planner block before the batch is sent (`S-agents-block`); the app then reloads the config and restarts the watcher.
    - Implemented in `src-tauri/src/domain/watch.rs`; commands `watch_project(repo_root)`, `unwatch_project`; event `PlanningChanged`. Frontend: `useProjectStore` keeps the last batch and a `revision` count.
  - [x] Conflicts `S-conflicts`
    - An open file without unsaved edits reloads silently.
    - An open file with unsaved edits keeps the user's version and shows "changed on disk" with a reload button.
    - The open file is compared with the disk after every watcher batch that changes, creates or moves it there, and again by every save: a save writes only when the disk still holds the text last read or saved (D-20261030-235513-a2um). The editor's own saves are not reported as changes.
    - While "changed on disk" shows, nothing is saved. Reload takes the disk text; Keep mine saves the edits over it. Edits a reload replaced can be restored until dismissed or until another file opens.
    - A disk change equal to the unsaved edits counts as saved.
    - A removed file with unsaved edits stays open with Restore file (writes it back to its place, never over a file) and Discard edits.
    - Moving a card saves its open file first, so the `completed` change of the move reloads silently.
    - Implemented in `src/stores/editor-store.ts` (`conflict`, `replaced`, `reload`, `keepMine`, `restoreFile`, `discard`); commands `save_text`, `create_text` in `src-tauri/src/domain/files.rs`.
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
    - Every key is optional. Defaults are parsed from `templates/planner.yml` itself, so template and code agree.
    - Each key is read on its own: an invalid value is reported with its key (`gate.` prefixed for gate keys) and replaced by its default; the other keys still apply. Unknown keys are reported and ignored. Unreadable or non-YAML files are reported and give all defaults. Loading never fails (D-20261030-214550-gl67).
    - Paths must be relative to the repository root without `..`; `columns` and `notes` are plain folder names, each listed once, `columns` not empty; day counts are at least 1; `spec` is `auto`, `file` or `folder`; `adapters` accepts `claude-code`.
    - `terminal` must be one of `columns`; otherwise it is reported and the last column takes its place.
    - The report also says whether the file exists and lists columns without a folder under the planning root.
    - Implemented in `src-tauri/src/domain/config.rs`; command `load_config(repo_root)` returns the config with its issues.
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
    - A System / Light / Dark switch in the app header; the choice is kept in the app settings (`settings.json` of `tauri-plugin-store`, key `theme`), never in a repository. An unknown or missing value means System (D-20261031-003015-8wy7).
    - The page, the editor (its own colours follow the app, CodeMirror's dark flag for selection and cursor), Mermaid diagrams (`dark` or `default` theme) and the native window frame follow the theme; with System the frame follows the operating system by itself. A system change shows at once.
    - Implemented in `src/lib/theme.ts`, `src/stores/theme-store.ts`, `src/components/theme-switch.tsx`; the frame through `getCurrentWindow().setTheme`, which needs the `core:window:allow-set-theme` permission.
- Platform `S-platform`
  - [x] Shell `S-tauri`
    - Tauri 2 app, signed builds for Windows, macOS, Linux.
    - `npm run tauri dev` opens one window titled "stardust" rendering the React page. Bundle identifier `dev.stardust.planner`.
    - The webview has a Content Security Policy that allows only the app itself and Tauri IPC; no remote sources.
    - Tauri plugins: `tauri-plugin-dialog` (folder picker) and `tauri-plugin-store` (app settings). Capabilities grant `core:default`, `dialog:allow-open` and `store:default`.
  - [x] Frontend `S-frontend`
    - React with TypeScript (`strict: true`), Vite.
    - UI components: shadcn/ui with Tailwind; component code lives in the repository.
    - State: Zustand. Drag and drop: dnd-kit. Editor: CodeMirror 6 via `@uiw/react-codemirror`. Markdown: remark/rehype.
    - Rust commands and TypeScript calls share generated types (tauri-specta); a signature mismatch is a compile error.
    - File operations, ids, frontmatter, links and gate checks are functions in Rust or plain TypeScript modules, not in components.
    - Tests: `cargo test` for Rust, Vitest for TypeScript. Lint and format: Biome.
    - Bindings are generated into `src/bindings.ts` on every debug start and by `cargo test`; the frontend calls Rust only through them. tauri-specta and specta are pinned to exact release candidates (D-20261030-211738-9tc3).
    - `npm run check` runs `tsc`, Biome and Vitest. Folder layout (Rust `domain/` and `commands.rs`; TypeScript `lib/`, `stores/`, `components/`) is described in `ARCHITECTURE.md`.
    - Installed so far: shadcn/ui (Button), Tailwind 4, Zustand, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-store`. dnd-kit, CodeMirror and remark/rehype come with their tasks.
  - [x] Templates `S-templates`
    - Templates for spec, task, config, planner block and prompts ship inside the app.
    - If `templates_dir` (default `docs/templates/`) contains `task.md` or `spec.md`, the tool uses those instead of the built in ones.
    - The planner block and the prompts are not overridable.
    - The config template is not overridable either; its defaults are the config defaults (`S-config`).
    - An override that exists but cannot be read is reported and the built in template is used (D-20261030-215352-tr40).
    - Implemented in `src-tauri/src/domain/templates.rs` (`TemplateKind`, `resolve`); command `load_template(repo_root, kind)` returns the text, the override path if one was used, and an issue.
- Editor `S-editor`
  - [x] Editing `S-editor-core`
    - CodeMirror 6 with markdown preview. Frontmatter editable as a form on top of the file.
    - Clicking a card title opens its file in a pane beside the board; one file is open at a time.
    - The form shows `id` and edits `title`, `tags`, `created`, `completed`, `priority`, `implements`, `depends_on`, `parent`. A field is written into the editor text when it loses focus or on Enter, through the same line writer as `set_task_field`; input `read_task` would report (empty title, priority outside 1 to 5, a date not like 2026-10-30) is refused at the field. Empty lists stay `[]`, other empty fields are removed. Frontmatter issues of the text show under the form.
    - Edits are saved 1 s after typing stops, on Ctrl+S (⌘S on macOS), before another file opens and on close (D-20261030-233646-imm8). Saving never creates a file: a file moved or removed since it was opened is not written back to its old place.
    - A watcher batch that moves the open file makes the editor follow it and save pending edits there; a removed file closes when it had no unsaved edits, otherwise it stays open (`S-conflicts`).
    - Implemented in `src/lib/editor.ts`, `src/stores/editor-store.ts`, `src/components/editor.tsx`; Rust `src-tauri/src/domain/files.rs`; commands `read_text`, `save_text`, `create_text`, `parse_task_text`, `set_field_in_text`, `remove_field_in_text`, `read_image`.
  - [x] Layout `S-editor-layout`
    - Two modes per file, toggled with one shortcut: styled source and rendered read.
    - Styled source: CodeMirror 6 with sized headings, highlighted task lists, links, inline code and frontmatter; markup stays visible.
    - Read mode: remark/rehype rendering with images, Mermaid and proposal actions (`S-proposals`).
    - No split view.
    - The shortcut is Ctrl+E (⌘E on macOS); the mode is remembered per file for the session and follows a moved file. Source is the default.
    - Styled source: the frontmatter lines are set in a muted monospace block; task markers, links and inline code are coloured; markup stays visible.
    - Read mode renders the body without the frontmatter with `react-markdown` and `remark-gfm`: GFM task lists and tables, images, and `mermaid` fenced blocks drawn by Mermaid (`securityLevel: "strict"`, loaded on first use).
    - Images are read through Rust as `data:` URLs (D-20261030-233646-imm8): relative to the file, or to the repository root with a leading `/`, never outside the repository; remote images and other sources show a notice instead, since the app makes no network calls.
    - Links never navigate the window; a relative link to a `.md` file opens it in the editor.
    - Proposal actions come with `S-proposals` and are not built yet.
  - [ ] Live preview `S-editor-live-preview` #later
    - Markup hidden until the cursor enters the line, in one pane.
- Search `S-search`
  - [x] Full text `S-search-fulltext`
    - Searches all files under the planning root, results while typing.
    - Index updated incrementally from watcher events. Thousands of files without noticeable lag.
    - Every `*.md` file under the planning root is searched, archive and notes folders included; hidden files and editor backups are not. The text is held in memory, read when the watcher starts and updated from each batch before the app receives it; nothing is written to disk (D-20261031-002734-fwvh).
    - A file matches when it contains every word of the query, ignoring case, as a substring of its text, title or path, so ids and node slugs match as typed. Matches in title or path rank first, then the number of matches, then the path. At most 30 results, each with title, path, line and a snippet of the first matching line with the words marked.
    - The search box above the board sends the query 120 ms after typing stops and drops answers to older queries; results refresh after every batch. A result opens in the editor; arrow keys choose, Enter opens, Escape clears.
    - Measured on 5,000 generated task files (14 MB): building the index 113 ms, the slowest query 11 ms, one update under 1 ms in a release build; 197 ms, 77 ms and under 1 ms in a debug build.
    - Implemented in `src-tauri/src/domain/search.rs` (`SearchIndex`); command `search(query, limit)`, index built by `watch_project` and dropped by `unwatch_project`; `src/stores/search-store.ts`, `src/components/search-box.tsx`.

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

### D-20261030-213854-k3cv · Ids keep second resolution, suffix is base36
- Context: `S-ids` and D-20260919-103000-c8d4 said "millisecond timestamp", but the format `YYYYMMDD-HHMMSS-xxxx` only holds seconds; the ids task asked for a hex suffix, but existing ids such as `D-20261030-211738-9tc3` already use other letters.
- Decision: keep `YYYYMMDD-HHMMSS-xxxx` in local time to the second; the suffix is 4 characters from `[a-z0-9]` (about 1.7 million per second); a new id is checked against all ids under the planning root and regenerated on collision. Decided by the user on 2026-10-30.
- Rejected: adding milliseconds (`YYYYMMDD-HHMMSS-mmm-xxxx`; two formats to parse forever), hex suffix (makes an existing id invalid).
- Consequences: `S-ids` criteria corrected. `AGENTS.md` and `templates/AGENTS-block.md` still say "millisecond". Direct Rust dependencies `chrono`, `fastrand`, `walkdir`, all already in the lock file through Tauri.

### D-20261030-214550-gl67 · Config is read key by key and never fails
- Context: `S-config` requires that an invalid value names its key and the app keeps running with defaults; Rust has no YAML parser in the tree, and `serde_yaml` is deprecated.
- Decision: YAML is parsed with `serde_norway` (maintained fork of `serde_yaml`, stable, MIT or Apache-2.0). Each key is deserialized and checked on its own and falls back to its default on failure; unknown keys are reported. A `terminal` outside `columns` falls back to the last column. `spec` accepts `auto`, `file`, `folder`.
- Rejected: all-or-nothing parsing (one typo resets the whole file), `serde_yml` (deprecated), `serde-saphyr` (newer, less used).
- Consequences: `S-config` criteria. Defaults are parsed from `templates/planner.yml` with `include_str!`, which the templates task can build on.

### D-20261030-215110-cgf7 · Task files are written line by line and read leniently
- Context: task files are edited by humans and agents; a YAML round trip would drop comments and reformat lists, and two existing task files have titles with an unquoted `: `, which is not valid YAML.
- Decision: writing replaces only the lines of the changed field and quotes values that plain YAML would misread. Reading reports invalid YAML as an issue and still takes `id`, `title`, `created`, `completed`, `parent` from their `key: value` lines, so such tasks keep their title on the board.
- Rejected: full YAML round trip (loses comments and formatting), dropping files with invalid frontmatter (breaks `S-task-format`).
- Consequences: `S-task-format` criteria; fixing the existing files and the agent instructions is task 20261030-215109-0my7 in the inbox.

### D-20261030-215352-tr40 · Unreadable template overrides fall back to the built in template
- Context: `S-templates` says which templates are overridable but not what happens when an override file exists and cannot be read.
- Decision: the built in template is used and the problem is returned as an issue with the override path, like config issues (D-20261030-214550-gl67). The config template is embedded once and `config.rs` reads its defaults through `TemplateKind::Config`.
- Rejected: failing the command (a broken file would block creating tasks).
- Consequences: `S-templates` criteria.

### D-20261030-220523-8397 · Planner block regeneration comes with the watcher
- Context: `S-agents-block` says the block is regenerated on every config change, but the app has no watcher and no config editing yet, so nothing can notice a change.
- Decision: the planner block task ships the writer and the command `write_planner_block`; regenerating on config change is a criterion of the file watcher task, which also has to watch `docs/planner.yml` outside the planning root. Accepted by the user on 2026-10-30.
- Rejected: keeping the planner block task open until the watcher exists.
- Consequences: `S-agents-block` criteria; task 20261030-220007-e420 implements `S-agents-block` too.

### D-20261030-224049-19xh · Project init offers come with the open repository screen
- Context: `S-init` says init offers the `.gitignore` entry and the planner block, but the app has no screen to open a repository or show a dialog, and no phase 1 task added one.
- Decision: the init task ships the backend (report of what is missing, a command for each); showing the offers moves to the new task for opening a repository and running init from the app. Accepted by the user on 2026-10-30.
- Rejected: keeping the init task open until a UI exists.
- Consequences: `S-init` criteria; task 20261030-220947-k07z also has to settle `tauri-plugin-dialog`, which the Constraints do not list.

### D-20261030-224813-t807 · Native folder picker with tauri-plugin-dialog
- Context: the app needs a repository folder before it can show anything, and the Constraints listed no plugin for a native folder dialog.
- Decision: add `tauri-plugin-dialog` to the Constraints, with only `dialog:allow-open` granted. The chosen folder is kept with `tauri-plugin-store`, already in the Constraints. Decided by the user on 2026-10-30.
- Rejected: typing or pasting the path.
- Consequences: Constraints, `S-tauri`, `S-frontend` and `S-init` criteria.

### D-20261030-225824-5045 · Moves are found by comparing files, not from rename events
- Context: `S-watcher` requires moves by id. `notify` reports renames differently on each platform (rename pairs, single events, create and remove), and an agent moving many files causes bursts.
- Decision: own debounce in the watcher thread (150 ms quiet, at most 1 s); per batch the touched paths are compared with the files known before; a removed and a created file with the same task id are a move. Only `notify` itself is used.
- Rejected: `notify-debouncer-full` (another crate outside the Constraints, still platform specific for renames), trusting rename events.
- Consequences: `S-watcher` criteria; a move whose two halves land in different batches (a slow copy over more than 1 s) shows as removed and created.

### D-20261030-231221-spj4 · Last visit, file times and unknown dependencies on cards
- Context: `S-board-card` names an age, a blocked marker and a new-since-last-visit marker but not what a visit is, where the age comes from, or what a dependency on a task that is not on the board means.
- Decision: a task carries `modified`, the file time from disk (RFC 3339, UTC), read by `read_task`. A visit of a project is recorded when it is opened and with every watcher batch seen while it is open; a card is new when its file changed after the visit before the current one. Last visits live in `settings.json` of `tauri-plugin-store` under `lastVisits`, keyed by repository root. Nothing is new on the first visit. A dependency on an id found in no column does not block, since archived tasks in `done/YYYY-MM/` are not read.
- Rejected: recording the visit when the app closes (no reliable hook, and a crash would mark everything new); the `created` date as age (says nothing about activity); treating unknown ids as blocking (every archived dependency would block forever).
- Consequences: `S-board-card` criteria; `Task` has a new field `modified` that `S-task-format` does not list yet.

### D-20261030-231541-84sn · Tag filter keeps cards with all selected tags, for the session only
- Context: `S-board-filter` says filtering by one or more tags hides cards "without them" but not whether a card needs all selected tags or any of them, nor whether the filter is remembered.
- Decision: a card stays when it carries every selected tag (narrowing). The filter is held in memory for the session and emptied when another project is opened; selected tags no longer on any card stay in the tag bar so they can be removed.
- Rejected: any-of matching (adding a tag would widen the board, against "hides cards without them"); keeping the filter in the app settings (not asked for, easy to add later).
- Consequences: `S-board-filter` criteria.

### D-20261030-232042-h9dm · Moving a task renames first, then writes `completed`
- Context: `S-board-dnd` says a drop moves the file and sets or removes `completed`, but not in which order, what happens when the target already has a file with that name, or when the card moves on screen.
- Decision: the file is renamed into the target folder, then `completed` is written; if that write fails the file is renamed back. A file with the same name in the target is never overwritten; the move fails. The card moves on screen at once and goes back with the error when the command fails. A moved card goes to the end of the column until `S-board-sort` exists.
- Rejected: writing `completed` before the rename (a failed rename would leave a task outside the terminal column marked completed); waiting for the watcher batch before moving the card (the card jumps back for at least 150 ms).
- Consequences: `S-board-dnd` criteria; dependency `@dnd-kit/core` 6.3.1.

### D-20261030-233646-imm8 · Autosave, editor pane beside the board, images as data URLs
- Context: `S-editor-core` and `S-editor-layout` do not say when edits reach the disk, where the editor sits next to the board, or how read mode shows local images when the CSP allows only the app itself. The conflict handling task builds on what counts as unsaved.
- Decision: edits are saved 1 s after typing stops, on Ctrl/⌘+S, before another file opens and on close; saving only overwrites an existing file. The editor is a pane beside the board, opened by clicking a card title. Read mode asks Rust for each image as a `data:` URL, limited to files inside the repository; the CSP already allows `img-src data:`. Decided by the user on 2026-10-30.
- Rejected: saving only on Ctrl/⌘+S (unsaved text is lost more easily); the editor replacing the board; the Tauri asset protocol (a Cargo feature, a runtime scope and a CSP entry for one feature).
- Consequences: `S-editor-core` and `S-editor-layout` criteria; new dependencies `@uiw/react-codemirror`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/view`, `@lezer/highlight`, `react-markdown`, `remark-gfm`, `mermaid`.

### D-20261030-235513-a2um · Saves compare with the disk, reloaded edits stay restorable
- Context: `S-conflicts` names a reload button but no way to keep one's own edits, and "no typed text is ever lost" conflicts with a reload that replaces edits. A watcher batch arrives at least 150 ms after a change, so an autosave in between would overwrite a change it has not heard of; moving a card writes `completed` while the editor may hold unsaved edits; a removed file cannot be saved.
- Decision: every save sends the text last read or saved and Rust writes only when the disk still holds it; otherwise the editor shows the conflict and stops saving. Besides Reload there is Keep mine. Edits replaced by a reload are kept for Restore my edits until dismissed or another file opens. A removed file with edits offers Restore file and Discard edits. Moving a card saves its open file first.
- Rejected: last write wins (overwrites agent changes silently); a three-way merge (out of proportion for phase 1); relying on the CodeMirror undo history to bring back replaced edits (invisible, lost when the editor remounts).
- Consequences: `S-conflicts` and `S-editor-core` criteria; command `write_text` replaced by `save_text` and `create_text`.

### D-20261031-000940-bhg8 · Braindump and spec open from the project bar, new tasks replace the template's examples
- Context: `S-make-task` selects text "in any file", but only task cards opened in the editor; the task template is a filled-in example (title, tags, priority, two board criteria), so "uses the task template" does not say which parts a new task keeps.
- Decision: "Braindump" and "Spec" buttons in the project bar open those files (spec only as a single file). A new task keeps the template's layout and headings; id, title, created are set, lists emptied, priority removed, Description and Acceptance criteria replaced, the other sections kept. Decided by the user on 2026-10-31.
- Rejected: a braindump button only (spec waits for `S-spec-file`); replacing only the Description (every task would carry the template's example tags and criteria).
- Consequences: `S-make-task` criteria. The tag and criteria examples in a project's own `task.md` override are replaced too.

### D-20261031-001344-gumt · Prompts copied through the webview clipboard, buttons where the task is
- Context: `S-prompts` copies to the clipboard, but no clipboard plugin is in the Constraints. WebKit (macOS, Linux) only allows a clipboard write during the click, and the prompt is filled in Rust first. The node does not say where the buttons are.
- Decision: the webview's `navigator.clipboard`; the write starts in the click with a `ClipboardItem` holding the pending prompt, with `writeText` as the fallback. Task prompts sit in a row of the editor while a task is open; Triage inbox on the first column's header.
- Rejected: `tauri-plugin-clipboard-manager` (a plugin outside the Constraints for one call); buttons on every card (crowds the board).
- Consequences: `S-prompts` criteria. Whether the copy works in each webview has to be checked by hand; a refused write shows as a notice.

### D-20261031-001850-0g9f · Column roles by position
- Context: the planner block and the prompts name three roles (new, ready for you, finished) by the folders `inbox/`, `next/`, `done/`, but `columns` and `terminal` are configurable and the config says nothing about which column is "ready".
- Decision: counted without the terminal column, the first column is new and the second is ready for you; with one such column it is both. `templates/AGENTS-block.md` and `templates/prompts.md` use placeholders for the names; the default output is unchanged. Decided by the user on 2026-10-31.
- Rejected: the column before the terminal as ready (with `backlog, todo, doing, review, done` that is `review`); a new config key `ready` (one more key for a case the position already covers).
- Consequences: `S-agents-block` and `S-prompts` criteria. The Triage inbox button already sits on the first column.

### D-20261031-002734-fwvh · Search scans the planning files in memory, no library
- Context: the Domain calls search "a full text index from a library" and the task suggested tantivy. Planning files are few and small, users search for ids and node slugs, and the Constraints list no search library.
- Decision: Rust keeps the lowercased text of every markdown file under the planning root in memory and matches every query word as a substring. Built when the watcher starts, updated from its batches. Measured fast enough on 5,000 files. Decided by the user on 2026-10-31.
- Rejected: tantivy with an in-memory index (a large dependency; its tokenizer splits ids at `-`, so id searches become phrase queries).
- Consequences: `S-search-fulltext` criteria. The Domain wording for Search still says "from a library"; a proposal to change it is in task 20261030-220014-91bd. Phase 3's "search scaling" starts from this scan.

### D-20261031-003015-8wy7 · Theme switch in the header, window frame themed too
- Context: `S-theme` asks for an override "in app settings", but the app has no settings screen; a page in dark with a light native title bar looks broken, and setting the frame's theme needs a Tauri permission `S-tauri` does not list.
- Decision: a System / Light / Dark switch in the app header writes the choice to the app settings. The frame follows the choice through `getCurrentWindow().setTheme`, with `core:window:allow-set-theme` as the only new permission. The editor gets a theme from the app's colour tokens instead of One Dark.
- Rejected: a settings screen for one switch; leaving the frame on the system theme; `@uiw/react-codemirror`'s One Dark (its own background and colours clash with the app).
- Consequences: `S-theme` criteria. `S-tauri` still lists the capabilities without `core:window:allow-set-theme`; it was outside this task.

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
- Slug: the readable part of a task filename after the id, built from the title.
- Section: a `## ` part of a task body: Description, Acceptance criteria, Implementation notes, Result.
- Issue: a problem found while reading a file or the config, reported with the field or key it concerns; the file is still used.
- Batch: the changes from one burst of events on disk, sent to the app together.
- Offer: a change init proposes outside the planning root (the `.gitignore` entry, the planner block), applied only when the user accepts it.
- Card: a task as shown on the board, with its markers.
- Visit: opening a project in the app; the last visit per project decides which cards are new.
- Source mode: the editor showing the file text with styled markup.
- Read mode: the editor showing the rendered body of the file.
- Conflict: unsaved edits of the open file meeting a different text on disk, or a removed file.
- Source file: the file text was selected in for Make task; the new task links back to it.
