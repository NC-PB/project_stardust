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
- Libraries for the heavy parts: CodeMirror 6, remark/rehype (unified), Markmap, Mermaid. Rust: `notify`, `tauri-plugin-global-shortcut`, `tauri-plugin-store`, `tauri-plugin-shell`, `tauri-plugin-dialog` (D-20261030-224813-t807), `trash` (D-20261031-005236-kuwe).
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
    - Per column: priority (1 first, none last), then `created` (none last), then id (none last), then file name.
    - Dependency order on top: a task comes after every task of the same column it depends on. Each place goes to the first task in that order whose dependencies in the column are all placed. Dependencies on tasks in other columns, on unknown ids or on the task itself are ignored. A cycle is broken at a task on it: following first unplaced dependencies from the first remaining task until one repeats; every task is still shown (D-20261031-021102-jyia).
    - A moved card takes its sorted place in the target column at once, before the watcher batch, and again when a failed move puts it back.
    - The session panel lists the ready column in this order (`S-session-panel`).
    - Implemented in `src/lib/board.ts` (`sortTasks`, applied per column by `cardsOf` and to the ready column by `sessionBrief`).
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
    - Tasks reference nodes in `implements`. An entry repeated in one task counts once.
    - Each node of the spec view tree shows the tasks that implement it with their column, from every column including the terminal one; each opens the task file in the editor.
    - A Trace section in the spec view lists tasks outside the terminal column without `implements`, ticked nodes without any task, and `implements` entries (in any column) that name no node. Tasks open in the editor, nodes at their line.
    - A ticked node counts as having a task when a task implements it or a node below it. Areas (no checkbox) are not listed, and `#later` nodes are skipped with their subtree (D-20261031-013706-d7rx).
    - Finishing a task updates the criteria of the nodes it implements (`R-spec-is-truth`); a test checks the generated planner block contains this rule.
    - Implemented in `src/lib/trace.ts`, `src/components/trace.tsx` (shown by `src/components/spec-view.tsx`), test in `src-tauri/src/domain/agents_block.rs`.
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
    - Sections: Vision, Scope (`### In`, `### Out`, `### Later`), Constraints, Domain (`### Areas`, `### Entities`, `### Rules`, `### Workflows`), Structure, Questions (`### Open`, `### Answered`), Decisions, Glossary. See `templates/spec.md`.
    - Single file `spec.md` by default; the `spec/` folder form when it exists. Both handled by the same code. `spec` in the config: `auto` takes `spec/` when the folder exists, `file` always `spec.md`, `folder` always `spec/`.
    - Folder form: the text of `spec.md` cut at its `## ` headings. `spec/README.md` holds the frontmatter, the `# ` title and the intro; each section is its own file starting with its `## ` heading: `vision.md`, `scope.md`, `constraints.md`, `domain.md`, `structure.md`, `questions.md`, `decisions.md`, `glossary.md`. Files are read in this order, other `*.md` files in the folder after them by name. Every file may have its own frontmatter (`id`, `title`, `status`, `reviewed`). Both forms give the same model; only file and line differ (D-20261031-010617-ryfp).
    - Entries: areas `- Name (core|supporting|generic): description`; entities `- Name: description`; rules ``- `R-id` · text``; workflows `- Name: step → step`, the name optional; questions `- [ ] Q-id · Question? Answer. (date) → targets`, where the checkbox means answered, `S-` ids after `→` are the linked nodes, a `D-` id the decision and `(blocking)` the blocking flag; decisions `### D-id · Title` with `- Label: text` fields, the `D-` ids of `Superseded by` fields collected; glossary `- Term: meaning`. Continuation lines and sub-items belong to their entry. Empty items (`- ` in the template) and `- (none)` (an empty list) are skipped; prose outside lists is not read, except Vision.
    - Every section, node, criterion, rule, question, decision, decision field and glossary term carries its file (relative to the planning root) and line; sections, nodes, questions and decisions also their last line.
    - Reading never fails and never drops a part: missing, unknown and repeated sections, list items outside the expected `### ` parts, entries without id or in the wrong shape, a ticked question under Open or an unticked one under Answered, a section in the wrong folder file, top-level nodes that are no domain area and ids used twice are issues with file and line; whatever could be read stays in the model. Headings inside code fences are ignored.
    - Read only. Implemented in `src-tauri/src/domain/spec.rs` (`Spec`, `read_spec`, `parse_spec_text`, `spec_form`, `FOLDER_FILES`); commands `read_spec(repo_root)` and `parse_spec_text(file, text)` for unsaved editor text.
    - The spec view, switched with Board | Spec under the project bar, shows the title, the location and the form. It has one button per `## ` section, opening that section's file in the editor in source mode, scrolled to the heading. It lists the read issues, each opening at its line. It follows changes on disk without a reload. The fog meter and the gate status sit under its header; a Mind map button swaps the Structure tree for the mind map (D-20261031-011800-v3sk).
    - Implemented in `src/components/spec-view.tsx` (`SpecView`), `src/components/view-switch.tsx`, `src/stores/view-store.ts` (`useViewStore`), `src/stores/spec-store.ts` (`useSpecStore`, read on project open and after batches that touch the spec), `src/lib/spec-view.ts`, `src/lib/spec.ts` (`specTouched`). The editor opens a file at a line with `open(repoRoot, path, line)` (`src/stores/editor-store.ts`).
  - [x] Split spec `S-spec-split`
    - "Split spec" in the project bar, shown while the spec is a single file, previews the split: the files it creates under `spec/` with line count and first line, every link it rewrites (file relative to the repository root, line, old → new target), and what blocks it. "Split" confirms in an inline bar; Cancel drops it.
    - The text of `spec.md` is cut at its `## ` headings (outside code fences) into the folder form of `S-spec-file`: the part before the first section to `spec/README.md`, each section to its file. Text is kept byte for byte apart from rewritten links.
    - Blocked, changing nothing: `spec: file` in the config, an existing `spec/`, an unreadable `spec.md` or searched markdown file (one that is not UTF-8 only when it contains `spec.md`), a section with no file of its own, a second section of a kind, sections out of the reading order, or a folder form that would not give the same model (positions and link targets aside).
    - Links rewritten: inline links, images and reference definitions outside code spans, code fences and frontmatter. In every searched `.md` file of the repository, a relative link that resolves to the spec's `spec.md` points to the file that now holds the heading of its anchor (GitHub anchors, renumbered per file), `spec/README.md` without an anchor or with an unknown one. In the moved text, anchor links follow their heading and other relative links get `../`.
    - Searched: the whole repository root except hidden names and folders named `node_modules` or `target`; the planning root and the folders above it are always searched. Root-absolute and web links are left alone (D-20261031-015930-k4vn).
    - Order: the folder is created and its files written (never over a file), read back and compared with the model of `spec.md`, then the links are rewritten (only over the text read); `spec.md` goes to the OS trash last and only if unchanged (`R-no-destroy`). A failed step undoes the earlier ones (links written back, new files to the trash) and `spec.md` stays. A failed trash leaves both forms and says so (D-20261031-012140-ol0p).
    - A planner block already in the agents file is regenerated afterwards, so it names `spec/`.
    - The open file is saved first; the split is refused while it has a conflict. The project bar's sources are read again afterwards.
    - Implemented in `src-tauri/src/domain/spec_split.rs` (`plan_split`, `split_spec`); commands `plan_spec_split(repo_root)`, `split_spec(repo_root)`; `src/stores/split-store.ts`; `src/components/spec-split.tsx`.
  - [x] Structure nodes `S-nodes`
    - Nested list. Each node has an id in inline code, an optional checkbox, criteria as sub-bullets, an optional link to the blocking question, an optional `#later`.
    - Domain areas are the top level. Top-level items are always nodes, usually without checkbox; one whose title is not an area of the Domain is reported.
    - A tick marks a node as clarified; implementation is shown through `S-trace` (`R-tick-means-clear`).
    - A sub-item is a node when it has a checkbox, or when its first line ends with the `S-` id in inline code, followed only by a `Q-` link (plain or as a markdown link) and `#` tags. Every other sub-item is a criterion; its own sub-items become lines of its text.
    - The title is the text before the id. After the id, `#later` sets the later flag and the first `Q-` id is the blocking question. A node without id is kept and reported.
    - Each node lists the `R-` ids in inline code in its criteria, each once (`S-gate`).
    - The spec view shows the Structure as a collapsible tree: areas expanded, nodes collapsed by default, with expand all and collapse all. Each node shows a read-only tick labelled clarified or not clarified (`R-tick-means-clear`), its id (or a "no id" marker), `#later`, the blocking question (open, answered, or not found), and for areas how many nodes below them are clarified. Expanded, a node shows its criteria and child nodes. Node titles and criteria render inline markup only (inline code, emphasis, links); block markup stays text and a criterion's lines keep their breaks. Titles and criteria are text, not buttons; a small ↗ button beside each title and before each criterion opens the editor at its line, named for screen readers like `Open S-nodes at spec.md:191`, so links are never nested in a button. A relative `.md` link opens that file in the editor; other links show as text with the address on hover and a click does nothing (D-20261031-013555-1ofs, D-20261031-015912-681c). Every node, criterion and question opens in the editor at its line, and every control is reachable with Tab. Expand state is kept per node id for the session. Implemented in `src/components/spec-view.tsx`, `src/components/inline-markdown.tsx`, `src/lib/spec-view.ts` and `src/lib/inline-markdown.ts`.
  - [x] Questions form `S-questions`
    - The spec view's Questions toggle shows the open questions, blocking ones first (marked `(blocking)` or linked by a node, as in `S-gate`), each group in file order. Each shows its question and id, opening the spec at its line, the nodes it blocks or concerns (the `S-` ids after its `→`, then the nodes linking it), each opening at its line, and an answer field. A question without a `Q-` id cannot be answered here.
    - Save appends the answer on one line and today's date before the `→`, ticks the entry, moves it to the top of `### Answered` (replacing `- (none)`, or adding the heading at the end of Questions) and leaves `- (none)` in an emptied Open list. The rest of the file is kept line by line. Works in `spec.md` and `spec/questions.md` (`R-append-only`).
    - The result is checked with the append-only guard and read back before writing; it is written only when the file still holds the text read. An empty answer or one containing `→` is refused. A refusal leaves the answer in the field with the reason.
    - When the spec file is open in the editor, its unsaved edits are saved first; the answer is refused while they have a conflict or cannot be saved. The spec view and the editor follow from the watcher batch (D-20261031-013850-qf4m).
    - Implemented in `src-tauri/src/domain/questions.rs` (`answer_question`, `answer_in_text`); command `answer_question(repo_root, id, answer)`; `src/lib/questions.ts` (`openQuestions`, `answerProblem`), `src/stores/questions-store.ts` (`useQuestionsStore`), `src/components/questions-form.tsx` (`QuestionsForm`, toggled by `questions` in `useViewStore`).
  - [x] Decisions log `S-decisions`
    - The editor allows appending entries and adding "Superseded by" lines only (`R-append-only`).
    - Applies to Questions and Decisions in `spec.md` and in every file of `spec/`, whichever form the config chooses. Entries of the saved and the edited text are read with the spec parser and matched by id; an entry without an id by its text or title.
    - Allowed on an existing question: ticking it, moving it between Open and Answered, appending text after its question (the answer and date) while open, adding links after the `→`. An answered question cannot be reopened and its text cannot change. Allowed on an existing decision: added `- Superseded by:` lines. Rewrapping lines is not a change. New entries and text outside entries are free.
    - A save that would change or remove an existing entry is refused; the text stays in the editor and a notice explains the rule and lists each entry with its message and line. "Undo my edits" goes back to the saved text and keeps the edits for Restore my edits (D-20261031-011923-a7q2).
    - In source mode the first line of each refused entry is highlighted. The marks follow typing and are replaced by every check. They go away when a save succeeds, the file is reloaded, or the edits are undone back to the saved text. Removed entries are only listed in the notice.
    - Implemented in `src-tauri/src/domain/append_only.rs` (`append_only_violations`, `spec_file_of`); command `check_append_only(repo_root, path, saved, text)`; checked in `src/stores/editor-store.ts` before every save, shown by `AppendOnlyBar` in `src/components/editor.tsx`, text in `src/lib/append-only.ts`, highlight in `src/lib/protected-lines.ts`.
  - [x] Fog meter `S-fog-meter`
    - Shows ticked versus unticked nodes and answered versus open questions. Domain areas (nodes without a checkbox) are not counted.
    - Nodes tagged `#later` are counted separately, ticked or not (D-20261031-011542-f7mq).
    - Clicking a count lists the nodes or questions behind it in file order; clicking an entry opens the spec in the editor at its line.
    - Shown in the spec view under its header. Implemented in `src/lib/fog.ts` and `src/components/fog-meter.tsx`.
  - [x] Gate `S-gate`
    - Met when: no open blocking questions; every node not tagged `#later` is ticked and has at least one criterion; every rule is referenced by at least one node.
    - Each check applies only while its `gate` key in the config is on (`no_open_blocking_questions`, `nodes_ticked_and_specified`, `rules_referenced`). With every key off the gate is met. A missing spec never meets the gate.
    - A question is blocking when it says `(blocking)` or a node links it as its blocking question; an answered question never blocks.
    - A top-level node without checkbox is a domain area and is not checked itself, its children are. A node tagged `#later` is skipped with its whole subtree. A rule without id is not checked (the spec reports it) (D-20261031-011731-g8te).
    - The status shows met or not met and the enabled checks. When not met, it lists each failing item (open blocking question, node not ticked, node without criteria, rule not referenced) with its message; clicking one opens the spec at its file and line. The status follows every reload of the spec, including after a config change.
    - Implemented in `src-tauri/src/domain/gate.rs` (`gate_status`, `GateStatus`, `GateFailure`); command `gate_status(repo_root)`. Frontend: `src/lib/gate.ts` (`gateChecks`), `src/stores/gate-store.ts` (`useGateStore`, following `useSpecStore`), `src/components/gate-status.tsx` (`GateStatus`, shown in the spec view).
  - [x] Mind map `S-mindmap`
    - Renders the Structure with Markmap: one root named after the Structure section, the domain areas below it, each label the node title and its `S-` id. Only the Structure (D-20261031-010817-m4pq).
    - Unticked nodes are greyed out, label and branch; below the top level a node without a checkbox counts as unticked. `#later` nodes are italic with a `#later` tag. Colours and font follow the theme.
    - The Mind map button in the spec view header swaps the Structure tree for the mind map, for the session. Clicking a label opens the spec at the node's line; clicking a circle folds or unfolds the node.
    - Redrawn whenever the spec is read again, so watcher batches touching the spec update it. Folds reset on a redraw.
    - Markmap (`markmap-view` only) is loaded on first use and loads nothing from the network (D-20261031-011815-mk7v).
    - Mermaid blocks render in the preview.
    - Implemented in `src/lib/mind-map.ts` (`mindMapTree`, `nodeState`, `mindMapStyle`, `sourceLineOf`) and `src/components/mind-map.tsx` (`MindMap`).
  - [x] Proposals `S-proposals`
    - Blockquotes starting with `**Proposal:**` get Accept (unwrap) and Reject (delete) actions in read mode.
    - A proposal is the run of consecutive lines starting with `>` (after any indentation) whose first line starts with `**Proposal:**` after the marker. The frontmatter and code fences are skipped, and lazy continuation lines without `>` are not part of it. A quote that only contains a proposal later, or a nested `> >` one, is not a proposal.
    - Accept removes one `>` marker and the space after it from each line, keeping the indentation. It drops the label and the spaces after it. A label alone on its line is removed, along with blank lines that would then open the text.
    - Reject removes the block and the blank line after it, or the one before it when there is none after it.
    - Both are one edit of the editor text, saved like typing (`S-editor-core`), and nothing outside these lines changes. An Undo bar and Ctrl/⌘+Z in read mode restore the text before, as long as it has not been edited since (D-20261031-012029-p7rq).
    - A Proposals button in the header shows the number of proposals and lists every proposal in the markdown files under the planning root (hidden files skipped), by path and line, with its first line of text. An entry opens its file in read mode.
    - The list is read when the project opens and again after each watcher batch that touches a markdown file under the planning root, a folder in it, or a folder that holds it (D-20261031-013531-2k1u).
    - Implemented in `src/lib/proposals.ts` (`proposalsTouched`), `src/stores/editor-store.ts` (`resolveProposal`, `undoProposal`), `src/stores/proposal-store.ts`, `src/components/proposal-quote.tsx`, `src/components/proposal-list.tsx`; Rust `src-tauri/src/domain/proposals.rs`; command `list_proposals(repo_root)`.
  - [x] Glossary `S-glossary`
    - In read mode, glossary terms show their definition on hover: the term is rendered as an `<abbr>` with a dotted underline whose title gives the term and its definition.
    - Each marked term is a tab stop; on keyboard focus (`:focus-visible`) a tooltip under the term shows the same text, taken from its `data-definition` attribute (D-20261031-013458-xysm).
    - Matching is case insensitive on whole words; multi-word terms match across any whitespace. Simple English plurals made on the last word match as the term ("ies" after a consonant and y, "es" after s, x, z, ch, sh, else "s"; "Planning roots" for "Planning root"); a plural that is itself a term stays that term. Within each paragraph or table cell, the first occurrence of each term, singular or plural, is marked.
    - Longer terms win over shorter ones they contain ("Terminal column" over "Column"). Headings, code blocks, inline code and link text are not marked. Irregular plurals and terms split by markup are not matched (D-20261031-011535-qgmp).
    - The terms come from the spec's Glossary and follow it when the spec changes on disk. Implemented in `src/lib/glossary.ts` (`remarkGlossary`, `pluralOf`), used by the read view in `src/components/editor.tsx`; focus style in `src/index.css`.
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
    - Where the buttons are (D-20261031-001344-gumt, D-20261031-013434-mqvf): a "Copy prompt" row of the editor offers Work on task, Verify task and Handoff while the open file is a task directly in a column, and Structure this while it is `{planning_root}/braindump.md`. Triage inbox is on the header of the first column. Interview me, Integrate answers and Generate tasks are in the spec view header while the spec exists. Verify area is on every Structure node row that has an id, areas included, filled with that node.
    - Each prompt is the fenced block under its `## ` heading in the built in `templates/prompts.md`. Placeholders filled: `{planning_root}`, `{spec_location}` and the column names (`S-agents-block`) from the config, `{task_path}` (relative to the repository root) and `{node_id}` from the button. A placeholder without a value is an error and nothing is copied.
    - A notice confirms the copy for 2.5 s, or says why nothing was copied. The clipboard is written through the webview (D-20261031-001344-gumt).
    - Implemented in `src-tauri/src/domain/prompts.rs` (`Prompt`, `fill_prompt`); command `fill_prompt(repo_root, prompt, input)`; `src/stores/prompt-store.ts`; `src/lib/prompts.ts` (`editorPromptsOf`, `TASK_PROMPTS`, `BRAINDUMP_PROMPTS`, `SPEC_PROMPTS`); `src/components/spec-prompts.tsx`, `src/components/verify-area-button.tsx`.
  - [x] Adapters `S-adapters`
    - On request, generates agent command files that wrap the prompts, starting with Claude Code (`.claude/commands/`). Never required.
    - With `adapters: [claude-code]` in the config, every write of the planner block also writes one Claude Code command file per prompt of `S-prompts` to `.claude/commands/<name>.md`, the name being the prompt heading in kebab case (`work-on-task`, `verify-area`, ...). The watcher, the init offer and Split spec all write it this way (`S-agents-block`).
    - A command file has frontmatter `description`, `argument-hint` (`"<task path>"` or `"<node id>"`, only when the prompt needs one) and `planner: generated`, then the prompt text filled from the config like the prompt buttons, with `{task_path}` and `{node_id}` replaced by `$ARGUMENTS`: `/work-on-task docs/planning/next/<task>.md`, `/verify-area S-board`.
    - The tool recognises its own files by the frontmatter line `planner: generated`, which Claude Code ignores. A file at the same path without it is never touched; deleting the line keeps the user's edits. Generated files are written only when their content changes and keep their line endings. Removing an adapter leaves its files (`R-no-destroy`) (D-20261031-020200-i22i).
    - Without adapters (`adapters: []`, the default) nothing under `.claude/` is read or written.
    - Implemented in `src-tauri/src/domain/adapters.rs` (`write_adapters`, `render_claude_command`, `is_generated`), called by `agents_block::write_planner_block`.
  - [x] Open terminal `S-terminal`
    - Opens the user's terminal in the repository root. Nothing else.
    - An "Open terminal" button in the project bar. Only the terminal program starts, with the repository root as its folder; no command is passed to it, and the app does not wait for it.
    - macOS: `open -a <app> <repository>`, Terminal unless another application is set. Windows: the set program, then Windows Terminal (`wt -d`), then a new `cmd` console. Linux: the set program, then `x-terminal-emulator`, gnome-terminal, konsole, xfce4-terminal, kitty, alacritty, wezterm, foot, xterm, each with its working directory flag where it needs one. The first that exists starts; if none does, the error lists what was tried.
    - The terminal is set in the Settings menu of the header and kept in the app settings (`settings.json`, key `terminal`); empty means the default (D-20261031-003519-cfn5).
    - Implemented in `src-tauri/src/domain/terminal.rs` (`launches`, `open_terminal`); command `open_terminal(repo_root, terminal)`; `src/stores/terminal-store.ts`, `src/components/settings-menu.tsx`.
  - [x] Session panel `S-session-panel`
    - Computed, nothing written: tasks in the ready column in order, last five decisions, open blocking questions, Result of the most recently completed task.
    - The ready column is the "ready for you" column of the column roles (D-20261031-001850-0g9f), `next/` by default. Its tasks are listed in board order (`S-board-sort`), the same order as the column on the board (D-20261031-021155-7d0n).
    - The most recently completed task is the task in the terminal column with the latest `completed` date, then the latest change on disk; its Result section is shown as text, or "No Result written".
    - The last five decisions are the last five entries of the Decisions section, newest first; superseded ones are struck through. Blocking questions are unanswered questions with `(blocking)`.
    - Shown under the search box when a project opens; updates with every watcher batch. "Hide" hides it for that project for the session; "Show session" brings it back; another project shows it again. Nothing is kept in the settings or the repository.
    - Every entry opens its file in the editor: the task file, or the spec file holding the decision or question, at its line.
    - Implemented in `src/lib/session.ts` (`sessionBrief`, `readyColumnOf`, `lastCompletedTask`, `resultOf`; the order from `sortTasks`), `src/stores/session-store.ts` (`useSessionStore`), `src/components/session-panel.tsx`.
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
    - Files dragged from the OS onto the open editor pane arrive as Tauri webview drag-drop events with their paths; the pane shows a ring while files are over it. Drops elsewhere are ignored (D-20261031-022559-5bb8).
    - Each dropped file is copied into `images_root` of the config (created when missing) under its own name; a taken name gets the first free `-1`, `-2`, ... suffix, each name claimed with create-new, so no file is ever overwritten (`R-no-destroy`). A file already inside the image root is linked as is. Files that are not images (by extension: png, jpg, jpeg, gif, webp, svg, avif, bmp), larger than 20 MB, or missing are not added and are named in the editor's error line.
    - The inserted text is `![name](link)` with the file stem as alt text and a link relative to the open file: `/` separators; spaces, `%`, `#`, `?`, `<`, `>` and parentheses percent encoded. Several files go one per line in drop order.
    - Source mode inserts the links on lines of their own where the pointer is, or at the cursor when dropped over the form; never inside the frontmatter. Read mode appends them as a paragraph at the end. The insertion is an edit like typing and is autosaved.
    - Read mode renders images at most as wide as the pane. A link to a file that does not exist shows a dashed "Missing image: alt" badge in the line, with the path and a hint that images are not in git in its tooltip; a refused source (remote, outside the repository, not an image, over 20 MB, unreadable) shows an "Image not shown" badge with the reason.
    - Implemented in `src-tauri/src/domain/images.rs` (`import_image`), `src-tauri/src/domain/files.rs` (`image_data_url`, `ImageRead`); commands `import_image(repo_root, file, source)`, `read_image`; `src/lib/images.ts`, `dropImages` in `src/stores/editor-store.ts`, `useImageDrop` and `LocalImage` in `src/components/editor.tsx`.
  - [x] Doctor `S-doctor`
    - Reports duplicate ids (`R-unique-ids`), missing ids, id mismatches (`R-filename-truth`), broken links, missing images, frontmatter errors, untraced tasks.
    - Never fixes without confirmation.
  - [x] Trash `S-trash`
    - Every delete goes to the OS trash (`R-no-destroy`).
    - The only delete so far: "Delete" in the editor header while a task file is open, confirmed in a bar that names the file. Unsaved edits are saved first, so the trash holds the latest text; while the file changed on disk, deleting is refused. The file is closed after it moved.
    - Only existing files inside the repository are moved; nothing is removed for good. macOS uses `NSFileManager` (no automation permission; Finder offers no "Put Back"), Windows the Recycle Bin, Linux the freedesktop trash, all through the `trash` crate.
    - Implemented in `src-tauri/src/domain/files.rs` (`trash_file`); command `trash_file(repo_root, path)`; `trash` in `src/stores/editor-store.ts`.
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
    - The CSP applies to the built assets served through `tauri://`; in `tauri dev` the webview loads the dev server URL without one. A clean dev start sends every IPC call over the custom protocol (`ipc://localhost` on macOS) without a warning. "IPC custom protocol failed … Load failed" appears only when the page reloads while calls are in flight, and is harmless: the postMessage fallback lasts for that one page (D-20261031-010818-k2vn).
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
    - Installed so far: shadcn/ui (Button), Tailwind 4, Zustand, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-store`, `@dnd-kit/core`, CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/view`, `@lezer/highlight`), `react-markdown` with `remark-gfm`, `mermaid`, `markmap-view`; dev dependency `@types/mdast` for the remark plugin types.
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
    - A proposal blockquote in read mode shows Accept and Reject; an Undo bar follows an Accept or Reject (`S-proposals`). Glossary terms show their definition on hover (`S-glossary`).
  - [ ] Live preview `S-editor-live-preview` #later
    - Markup hidden until the cursor enters the line, in one pane.
- Search `S-search`
  - [x] Full text `S-search-fulltext`
    - Searches all files under the planning root, results while typing.
    - Index updated incrementally from watcher events. Thousands of files without noticeable lag.
    - Every `*.md` file under the planning root is searched, archive and notes folders included; hidden files and editor backups are not. The text is held in memory, read when the watcher starts and updated from each batch before the app receives it; nothing is written to disk (D-20261031-002734-fwvh).
    - A file matches when it contains every word of the query, ignoring case, as a substring of its text, title or path, so ids and node slugs match as typed. Matches in title or path rank first, then the number of matches, then the path. At most 30 results, each with title, path, line and a snippet of the first matching line with the words marked.
    - The search box above the board sends the query 120 ms after typing stops and drops answers to older queries; results refresh after every batch. A result opens in the editor in source mode at the line of its first match (D-20261031-011800-v3sk); arrow keys choose, Enter opens, Escape clears.
    - Measured on 5,000 generated task files (14 MB): building the index 113 ms, the slowest query 11 ms, one update under 1 ms in a release build; 197 ms, 77 ms and under 1 ms in a debug build.
    - Implemented in `src-tauri/src/domain/search.rs` (`SearchIndex`); command `search(query, limit)`, index built by `watch_project` and dropped by `unwatch_project`; `src/lib/search.ts` (`highlight`, `hitLocation`), `src/stores/search-store.ts`, `src/components/search-box.tsx`.

## Questions

Append-only. Ids: `Q-YYYYMMDD-HHMMSS-xxxx`.

### Open
- (none)

### Answered
- [x] Q-20261031-005412-wtkk · Mind map: (a) Structure only, (b) any outline read only, or (c) b plus an editable mind map as a later node? (a) Structure only. (2026-10-31) → D-20261031-010817-m4pq
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

### D-20261031-003519-cfn5 · Terminal started from Rust, set in a Settings menu
- Context: `S-terminal` opens the user's terminal and nothing else, configurable in app settings. The Constraints allow `tauri-plugin-shell`, but its permissions are scoped commands run from the frontend; the app has no settings screen.
- Decision: one Rust command starts the terminal with `std::process::Command`, from a fixed list per platform led by the configured terminal; no plugin and no frontend permission. A Settings menu in the header holds the terminal field and the theme switch.
- Rejected: `tauri-plugin-shell` (a frontend-reachable shell scope for one fixed launch); a separate settings window.
- Consequences: `S-terminal` criteria. `tauri-plugin-shell` stays unused so far.

### D-20261031-005236-kuwe · The trash crate, deleting from the editor
- Context: `S-trash` sends every delete to the OS trash, but the app deleted nothing yet and the Constraints list no trash library. On macOS the crate's default asks Finder through AppleScript, which prompts for automation permission and needs an extra entitlement in signed builds.
- Decision: add `trash` 5 to the Constraints; on macOS use its `NSFileManager` method. The first delete is "Delete" in the editor header for task files, with an inline confirmation (no dialog permission needed). Decided by the user on 2026-10-31, except the macOS method.
- Rejected: own code per platform (AppleScript, Windows shell FFI, freedesktop by hand); a delete control on every card (easy to hit while dragging); Finder as the macOS method (permission prompt, entitlement).
- Consequences: Constraints, `S-trash` criteria. Files trashed on macOS have no "Put Back" in Finder; they can be dragged back.

### D-20261031-010617-ryfp · Spec folder holds one file per section, the spec is read line by line
- Context: `S-spec-file` allows `spec.md` or a `spec/` folder but does not say how the folder is laid out; `S-nodes` makes the checkbox optional, so it does not say how a sub-bullet that is a node differs from a criterion. The phase 2 tasks need file and line for every part of the spec.
- Decision: the folder form is `spec.md` cut at its `## ` headings: `spec/README.md` (frontmatter, title, intro), then `vision.md`, `scope.md`, `constraints.md`, `domain.md`, `structure.md`, `questions.md`, `decisions.md`, `glossary.md`, each starting with its own `## ` heading, read in that order; other `*.md` files follow by name. A sub-item is a node when it has a checkbox or its first line ends with the `S-` id, with only a `Q-` link and tags after it; otherwise it is a criterion. A question's answered state is its checkbox; Open or Answered is checked against it. The spec is read by a line reader in Rust without a markdown library; reading never fails and reports what does not fit with file and line.
- Rejected: a markdown library such as `pulldown-cmark` (a dependency outside the Constraints that still needs the same conventions on top); `index.md` for the intro (GitHub shows `README.md` for a folder); sub-items as nodes only with a checkbox (against the optional checkbox of `S-nodes`).
- Consequences: `S-spec-file` and `S-nodes` criteria; `S-spec-split` writes exactly this layout. A criterion whose first line ends with a node id in inline code reads as a child node; such a criterion needs text after the id, such as a period.

### D-20261031-010817-m4pq · The mind map shows the Structure only
- Context: the original idea was a mind map for brainstorming, while `S-mindmap` renders only the Structure (Q-20261031-005412-wtkk).
- Decision: (a) Structure only, as specified. Decided by the user on 2026-10-31.
- Rejected: (b) any outline (braindump, notes, Structure) read only; (c) b plus an editable mind map that writes list edits back.
- Consequences: task 20261031-005409-sqhn builds `S-mindmap` as written.

### D-20261031-010818-k2vn · The IPC fallback warning in dev is harmless, the CSP stays
- Context: `npm run tauri dev` on macOS logged "IPC custom protocol failed, Tauri will now use the postMessage interface instead TypeError: Load failed" for every startup call. Suspected: the CSP, the dev server origin, or a Tauri default.
- Decision: keep the CSP and the config. In tauri 2.12.5 the warning comes from `scripts/ipc-protocol.js` when an `ipc://` fetch is rejected; WebKit rejects in-flight fetches with "Load failed" when the page reloads or navigates, for example on a Vite full reload. The fallback flag lives in the page, so the reloaded page uses the custom protocol again. Clean starts showed no warning; a reload 75 ms after load reproduced it exactly. In desktop dev no CSP applies at all (`protocol/tauri.rs` adds it only to `tauri://` assets).
- Rejected: adding `connect-src ipc: http://ipc.localhost` (no effect: dev has no CSP, and in builds `default-src` already covers `connect-src`); a separate `devCsp` (not the cause, weakens parity with builds); hiding the warning in the frontend (would hide real IPC or CSP failures).
- Consequences: `S-tauri` criteria. A warning after a dev reload needs no action; one on a clean start or in a release build points to a real problem.

### D-20261031-011535-qgmp · Glossary terms marked per paragraph as native abbr tooltips
- Context: `S-glossary` needs definitions on hover in read mode. It had to be decided which text counts and how the hover is shown.
- Decision: a remark plugin marks the first whole-word occurrence of each term per paragraph or table cell, preferring longer terms. It skips headings, code and links. Terms render as `<abbr title="Term: definition">` and use the native tooltip.
- Rejected: a custom React tooltip component (more code, and positioning inside the scrolling editor pane); marking every occurrence (noisy); marking headings and link text (a hover target inside a link conflicts with its click, and headings get crowded); stemming or plurals (needs a model of English).
- Consequences: `S-glossary` criteria. No new dependency; `@types/mdast` added as a direct dev dependency for the plugin's types. Tooltips appear after the browser's hover delay and not on keyboard focus. Plural forms are not marked.

### D-20261031-011542-f7mq · Fog meter counts #later nodes only under Later
- Context: `S-fog-meter` counts `#later` nodes separately, but a `#later` node can also be ticked or unticked.
- Decision: a node tagged `#later` counts only under Later, whether ticked or not. Only the node's own tag counts; children of a `#later` node are counted by their own tick.
- Rejected: counting `#later` nodes under ticked or unticked as well (counted twice); passing `#later` down to the children.
- Consequences: `S-fog-meter` criteria. Ticked plus unticked plus Later equals all nodes with a checkbox. The gate skips whole `#later` subtrees (D-20261031-011731-g8te), so the two can differ for children of a `#later` node.

### D-20261031-011606-s3pn · Session panel lists ready tasks by priority, then id
- Context: `S-session-panel` lists the ready tasks "in order", but `S-board-sort` is not built; the board shows tasks by file name. The ready column is configurable, and the Result has to come from somewhere without a stored brief (D-20260920-093000-6f8e).
- Decision: ready tasks are ordered by priority 1 to 5, tasks without priority last, then by file name (the id, so creation time). The ready column follows the column roles, mirrored in TypeScript from `column_roles`. The most recently completed task is the latest `completed` date, then the latest file time, read from the board's tasks, whose sections already carry the Result. Hiding is per project and for the session only.
- Rejected: board order alone (ignores priority); a Rust command for the column roles (one more IPC call for three lines of logic); hiding remembered in the app settings (the panel is meant to show at every project open).
- Consequences: `S-session-panel` criteria. When `S-board-sort` is built, the panel should use its order. `readyColumnOf` must stay in step with `column_roles` in `src-tauri/src/domain/columns.rs`.

### D-20261031-011731-g8te · Gate checks in Rust; areas and #later subtrees are not checked
- Context: `S-gate` says every node not tagged `#later` is ticked and has a criterion, but domain areas have no checkbox and no criteria, and it does not say whether `#later` covers children or what makes a question blocking.
- Decision: the gate is a Rust function over the spec model and the `gate` config, with a command `gate_status(repo_root)`. A top-level node without checkbox is an area and is skipped itself, its children are checked. `#later` skips the node and its whole subtree. A question blocks when it is marked `(blocking)` or a node links it as its blocking question. A missing spec never meets the gate. Failing items carry file and line.
- Rejected: a pure TypeScript module over the `Spec` binding (no reuse by the Doctor or agent checks later); counting areas as unticked nodes (the gate could never be met); checking children of `#later` nodes (deferred work would hold the gate closed).
- Consequences: `S-gate` criteria. The spec is read twice per reload, once by the spec store and once by `gate_status`; a sub-node without checkbox is reported as not ticked.

### D-20261031-011800-v3sk · Board and spec view share the main area, the editor opens at a line
- Context: the spec view needs room beside the editor, which already shares the window with the board. Section and node navigation needs the editor to jump to a line, but it could only open a file.
- Decision: a Board | Spec switch under the project bar swaps the main area. The choice, the tree's expand state and the mind map toggle are kept for the session only, in `useViewStore`. `useEditorStore.open` takes an optional 1-based line; it switches the file to source mode and scrolls CodeMirror there, also when the file is already open. The fog meter and gate status sit under the spec view's header.
- Rejected: board and spec side by side (too narrow next to the editor); keeping the view in app settings (not needed yet); revealing the line in read mode (the rendered view has no line positions).
- Consequences: `S-spec-file`, `S-nodes` criteria. The fog meter, gate status, mind map and session panel use `open(…, line)`. Clicking a node while its file is in read mode switches that file to source mode.

### D-20261031-011815-mk7v · Mind map built from the spec model with markmap-view only
- Context: Markmap usually takes markdown through markmap-lib, which pulls in markdown-it, KaTeX, prism and highlight.js, and its plugins load assets from a CDN; the app makes no network calls. The spec model already holds the Structure with file and line.
- Decision: build the Markmap tree from `spec.structure` in a pure module and render it with `markmap-view` alone, loaded on first use. Labels are escaped HTML carrying file and line; state is shown through CSS classes scoped to the Markmap id and the theme variables. Below the top level a node without a checkbox counts as unticked, because only a tick means clarified (`R-tick-means-clear`).
- Rejected: markmap-lib transforming the Structure text (a second parser beside the spec reader, heavy dependencies, CDN plugins); markmap-autoloader (loads from a CDN).
- Consequences: `S-mindmap` criteria; dependency `markmap-view` (with its peer `markmap-common`). Fold state is not kept across reloads of the spec.

### D-20261031-011923-a7q2 · The append-only guard refuses the save, not the keystroke
- Context: `S-decisions` and `R-append-only` let the editor only append entries and mark existing ones, but do not say how an edit is blocked or how much counts as one edit. Answering a question means typing into its line and moving it from Open to Answered, a cut and a paste; a check per keystroke would refuse these steps halfway through.
- Decision: the guard compares whole entries of the saved and the edited text before every save, using the spec parser in Rust and matching by id. A save that changes or removes an existing entry is not written; the edits stay in the editor and a notice lists each entry with the reason. "Undo my edits" reloads the saved text and keeps the edits restorable. The check is one Rust function (`append_only_violations`) and one command, used by the editor and available to the Questions form.
- Rejected: a CodeMirror transaction filter on protected line ranges (must decide synchronously, which means duplicating the spec parser in TypeScript, and blocks the intermediate steps of allowed changes); a pure TypeScript comparison (a second parser that could drift from Rust).
- Consequences: `S-decisions` criteria. Typing in a protected entry is possible but not saved until it is fixed or undone; the notice appears with the autosave about 1 s later. Agents writing to disk are not checked by the app. Accepting a proposal inside an existing decision will be refused as a change.

### D-20261031-012029-p7rq · Proposal blocks are found by lines, Accept and Reject are text edits with their own undo
- Context: `S-proposals` says unwrap and delete but not what the block is, what exactly Accept removes, how much blank space Reject takes, or how an edit made in read mode is undone when CodeMirror is not mounted.
- Decision: a proposal is the run of consecutive `>` lines (any indentation, outside the frontmatter and fences) whose first line starts with `**Proposal:**`. Accept drops one `>` marker plus one space per line and the label; a label-only line goes with any blank lines that would then open the text. Reject removes the block plus the following blank line, or the preceding one when there is none after it. Both are computed in `src/lib/proposals.ts` and applied as one `edit()` of the editor store. Undo is a one-step store undo (bar plus Ctrl/⌘+Z in read mode), valid while the text is unchanged since. The list comes from a Rust scan with the same rules.
- Rejected: a remark plugin or the mdast tree to find blocks (not available to the Rust scan, and positions only cover the body); keeping CodeMirror mounted in read mode for its history (too invasive for one action); including lazy continuation lines (CommonMark rules too complex for a line reader).
- Consequences: `S-proposals` and `S-editor-layout` criteria. A proposal written with lazy continuation lines only has its `>` lines unwrapped or removed. Accepting a proposal inside an existing decision is refused by the append-only guard (D-20261031-011923-a7q2).

### D-20261031-012140-ol0p · Split spec checks the model, undoes failed steps, and stays inside the planning root
- Context: `S-spec-split` moves sections and rewrites links but does not say how a failure halfway is handled, which links count, what `spec: file` means for a split, or that links in the moved text break one folder deeper. General link rewriting is `S-links` in phase 3.
- Decision: the split is planned in full and checked in memory, then written in the order folder → read back and compared → links → trash `spec.md`, each step undone when a later one fails. Only markdown files under the planning root and the moved text itself are rewritten. Anchors are mapped by GitHub's heading slugs. Sections must be known, single and in the folder's reading order. `spec: file` blocks the split. A planner block already present is regenerated.
- Rejected: cutting unknown sections into extra files (they would read after the known ones and change the order); rewriting links repo-wide (that is `S-links`); writing `spec: auto` into the config on a `file` setting (the config is the user's); leaving the planner block naming `spec.md` (agents would read a trashed file).
- Consequences: `S-spec-split` criteria. Links to `spec.md` from outside the planning root, such as `ARCHITECTURE.md`, break after a split.

### D-20261031-013458-xysm · Glossary plurals by suffix rules, definitions on focus as a CSS tooltip
- Context: `S-glossary` did not mark plural forms and showed definitions only on mouse hover (D-20261031-011535-qgmp). Task 20261031-012417-6wgq asks for simple plurals and keyboard focus.
- Decision: each term also matches one plural made on its last word with the regular English suffix rules (s, es after s/x/z/ch/sh, ies after a consonant and y). A plural that is itself a term stays that term, and singular and plural count as one term per paragraph. Marked terms get `tabindex="0"` and a `data-definition` attribute; on `:focus-visible` a CSS `::after` tooltip shows it, while mouse hover keeps the native title.
- Rejected: a stemming or inflection library (a dependency for little gain); matching any optional "s/es" (would mark words like "taskes"); `aria-describedby` with generated ids (needs unique ids across the rendered document, and the title already gives assistive tech the description); a roving tabindex or one focusable glossary list (more code; marking only the first occurrence per paragraph keeps tab stops few); a React tooltip component (see D-20261031-011535-qgmp).
- Consequences: `S-glossary` criteria. Irregular plurals are still not matched. Read mode gets one tab stop per marked term. The focus tooltip can be clipped at the pane edge.

### D-20261031-013434-mqvf · Where the ideation prompt buttons sit
- Context: `S-prompts` lists the ideation prompts but not where their buttons go. Structure this reads the braindump, the three spec prompts work on the whole spec, and Verify area needs one node.
- Decision: Structure this goes in the editor's existing "Copy prompt" row while `{planning_root}/braindump.md` is open; the row matches by path, the same file the prompt reads. Interview me, Integrate answers and Generate tasks go in the spec view header, only while the spec exists. Verify area is a small text button on every Structure node row with an id, in the tree only.
- Rejected: all ideation prompts in the project bar (far from the file they act on); Verify area in the mind map too (crowds the nodes); hiding Structure this once a spec exists (the user may want to rebuild the spec).
- Consequences: `S-prompts` criteria. Every prompt in `templates/prompts.md` now has a button.

### D-20261031-013531-2k1u · The proposal list is read again in full after batches that touch planning markdown
- Context: the list was read only when it opened. The button now shows a count, so the list has to be current all the time.
- Decision: the proposal store reads `list_proposals` when the project opens and again after every batch for which `proposalsTouched` is true: a `.md` file under the planning root, a folder in it, or a folder that holds it, ignoring hidden names and other file types. The latest load wins.
- Rejected: reloading only while the list is open (the count would go stale); an incremental per-file proposal index in Rust (more code, for a walk that costs about as much as building the search index); finding proposals in the frontend from batch contents (batches carry paths, not text).
- Consequences: `S-proposals` criteria. Each save to a planning file costs one walk of the planning root. If that is too slow on large trees, the list moves into an incremental index next to `SearchIndex`.

### D-20261031-013555-1ofs · Links in spec view texts
- Context: node titles and criteria are buttons that open the editor at their line; links inside them must not navigate the window, and must not also open the row.
- Decision: relative `.md` links open the linked file in the editor, resolved from the spec file the text is in, as in read mode; the click stops there. Every other link (web, anchor) shows as text with the address on hover, and a click opens the row. Block constructs are turned off in the parser rather than dropped after it, so sub-item lines keep their markers.
- Rejected: every link as plain text (planning links are the useful ones); web links that do nothing on click, as in read mode (they would block the row's click target); unwrapping blocks after parsing (loses `- ` markers and line breaks).
- Consequences: `S-nodes` criterion; a link is an `<a>` inside a `<button>`, which is invalid HTML (task 20261031-013556-iwh8).

### D-20261031-013706-d7rx · Trace gaps: which tasks and nodes count
- Context: `S-trace` lists tasks without `implements` and ticked nodes without any task, but does not say whether finished tasks, areas, `#later` nodes or parents of implemented nodes count.
- Decision: tasks in every column implement nodes and are checked for unknown entries; only tasks outside the terminal column are listed for a missing `implements`. A ticked node is listed when no task implements it or any node below it. Areas have no checkbox and are never listed; `#later` nodes are skipped with their whole subtree, like the gate (D-20261031-011731-g8te). The index is a pure TypeScript module over the board and the spec stores.
- Rejected: listing finished tasks without `implements` (they are history and predate the field); requiring a task on every parent node (container nodes would always be reported); a Rust command (both inputs already live in the frontend stores).
- Consequences: `S-trace` criteria. A parent node can look traced through one child task while other children are listed on their own.

### D-20261031-013850-qf4m · Answers are written by Rust as a checked text edit, the open spec file is saved first
- Context: `S-questions` says saving appends the answer and moves the entry to Answered, but not where in Answered, what happens to an emptied Open list, how the write avoids overwriting changes on disk, or what happens when the spec file is open in the editor with unsaved edits.
- Decision: one Rust function edits the file that holds the question, `spec.md` or `spec/questions.md`. It appends `Answer. (date)` before the `→`, ticks the entry and moves it to the top of `### Answered`, keeping newest first as in this spec. An emptied Open list gets `- (none)`. It checks its own result with `append_only_violations` and writes with `save_text` against the text it read. When that file is open in the editor, the editor saves first; the answer is refused while the editor has a conflict or edits it cannot save. An answer is one line and may not contain `→`. The form is toggled in the spec view like the mind map.
- Rejected: building the new text in TypeScript (a second writer beside the Rust parser); writing the answer into the editor buffer (only works while the file is open, and mixes the answer with unrelated edits); refusing whenever the spec is open with any unsaved edits (most of them are harmless and save at once); appending at the end of Answered (this spec lists the newest first).
- Consequences: `S-questions` criteria. Line breaks in an answer become spaces. A question without a `Q-` id is answered in the editor only. The form hides an answered question until the watcher batch reloads the spec.

### D-20261031-015912-681c · Spec view rows open through their own button
- Context: node titles and criteria were buttons, so their links were `<a>` nested in a `<button>` (D-20261031-013555-1ofs). Rows must stay keyboard usable, and D-20261031-013555-1ofs let a click on a web link open the row.
- Decision: titles and criteria are plain text. A small ↗ ghost button opens the row at its line: after the title of a node, before the text of a criterion. Its title and accessible name come from `openLabel` in `src/lib/spec-view.ts`, such as `Open S-nodes at spec.md:191` or `Open criterion at spec.md:200`. Relative `.md` links stay real links beside it. A web or anchor link is text with the address on hover, and clicking it does nothing, superseding that part of D-20261031-013555-1ofs.
- Rejected: a click handler on the row text as well (a second, mouse-only target on a non-interactive element, flagged by the linter's accessibility rules); turning the id chip into the open control (criteria and nodes without id have none); a `role="button"` wrapper (still nests interactive content).
- Consequences: `S-nodes` criterion. Clicking a title no longer opens the editor; the ↗ button does. Each row gets one more tab stop.

### D-20261031-015930-k4vn · Split spec rewrites links to the spec in the whole repository
- Context: D-20261031-012140-ol0p kept the split's link rewriting inside the planning root and accepted that links from outside it, such as `ARCHITECTURE.md`, break. Task 20261031-012423-afyd asks for links anywhere in the repository; general rewriting on any move (`S-links`) is not built.
- Decision: supersedes the "only markdown files under the planning root" part of D-20261031-012140-ol0p. The split searches every `.md` file under the repository root, skipping hidden names and folders named `node_modules` or `target`, but never the planning root or a folder above it. A link is rewritten when it resolves from its file to the planning root's `spec.md`. The same steps hold: listed in the preview, written only over the text read, undone when a later step fails. A file that cannot be read blocks the split; a file that is not UTF-8 blocks it only when its bytes contain `spec.md`, otherwise it is skipped. Paths in the preview and in the report's rewritten files are relative to the repository root.
- Rejected: honouring `.gitignore` (a second matcher for its glob rules, or a call to git; the fixed list covers dependencies and build output); asking git for tracked files (the tool works without git); waiting for `S-links` (links outside the planning root keep breaking until then); a longer skip list such as `dist` or `build` (such folders can hold hand-written docs).
- Consequences: `S-spec-split` criteria. Markdown in other ignored folders, such as `dist`, is searched and its links to the spec are rewritten too. A large repository takes one walk of its tree per preview and per split. Root-absolute links (`/docs/planning/spec.md`) are not rewritten. `S-links` should reuse the walk and the link rewriting when it lands.

### D-20261031-020200-i22i · Claude Code adapter: one command per prompt, marked in the frontmatter, written with the planner block
- Context: `S-adapters` asks for Claude Code command files that wrap the prompts, but not their names, how arguments arrive, when they are written, or how the tool tells its own files from the user's. Claude Code's docs (checked 2026-10-31) read `.claude/commands/<name>.md` as `/<name>`, take `description` and `argument-hint` in the frontmatter, put everything typed after the command into `$ARGUMENTS`, and ignore unknown frontmatter fields.
- Decision: one file per prompt, named after the prompt heading in kebab case, filled from the config like the prompt buttons, with `{task_path}` and `{node_id}` replaced by `$ARGUMENTS`. The tool's own files carry the frontmatter line `planner: generated` (with a YAML comment saying how to keep edits); only those are rewritten, any other file at the path is skipped. The files are written inside `write_planner_block`, so every regeneration of the block writes them too. Removing an adapter leaves the files.
- Rejected: an HTML comment marker in the body (Claude Code would send it to the agent with the prompt); short names like `/work` (less clear next to the headings and the button labels); a `.claude/commands/planner/` subfolder (commands would become `/planner:work-on-task`); Claude Code skills (`.claude/skills/`), which the docs recommend for new work but which need one folder per command; deleting files when the adapter is removed (`R-no-destroy`).
- Consequences: `S-adapters` criteria. Skipped user files are not reported. If Claude Code drops `.claude/commands/`, the adapter moves to skills.

### D-20261031-021102-jyia · Board sort: base order, then dependencies within the column
- Context: `S-board-sort` names priority, created and dependency order per column but not how they combine, what happens with cycles or unknown ids, or where a moved card lands (D-20261030-232042-h9dm put it at the end until the sort exists).
- Decision: the base order is priority 1 to 5 (none last), then `created` (none last), then id (none last), then file name. Dependency order is applied on top as a stable topological order within the column: each place goes to the first task in base order whose dependencies in the same column are all placed, so a dependent task moves down below its dependencies, not the dependency up. Dependencies on tasks in other columns, on ids found in no column and on the task itself are ignored. When no task is free there is a cycle: from the first remaining task in base order its first unplaced dependency is followed until a task repeats, and that task is placed next. The sort runs where cards are built (`cardsOf`), so an optimistic move and a move put back after a failure show at the sorted place without changing `moveCard`.
- Rejected: pulling dependencies up above their dependents (a low priority dependency would jump over higher priority tasks); ordering across columns (a column only shows its own tasks); hiding or flagging tasks in a cycle (the order must not drop cards; cycles are a matter for `S-dependencies`); inserting at the sorted place in `moveCard` (the board would hold two orderings of the same tasks).
- Consequences: `S-board-sort` criteria. The "lands at the end of the column" part of D-20261030-232042-h9dm no longer holds; `S-board-dnd` still says so. `BoardColumn.tasks` stays in the order read from disk; anything showing tasks in board order uses `sortTasks`.

### D-20261031-021155-7d0n · Session panel lists ready tasks in board order
- Context: D-20261031-011606-s3pn ordered the session panel's ready tasks by priority, then id, until `S-board-sort` existed. It now exists (D-20261031-021102-jyia).
- Decision: supersedes the ordering part of D-20261031-011606-s3pn. `sessionBrief` orders the ready column with `sortTasks`, the function the board uses, and `readyOrder` is removed. The rest of D-20261031-011606-s3pn stands.
- Rejected: reading the order from the board's cards (would tie the brief to the tag filter and to card fields it does not need).
- Consequences: `S-session-panel` and `S-board-sort` criteria. The panel and the ready column on the board always show the same order. The panel now also orders by `created` and puts a task after the ready tasks it depends on.

### D-20261031-021203-z7jn · Release builds on a version tag, universal macOS, Windows signed with Azure Artifact Signing
- Context: `S-tauri` asks for signed builds for Windows, macOS and Linux, and task 20261030-220019-45ec for CI that signs, notarizes and attaches the builds to a release. The repository had no CI and no signing setup.
- Decision: a GitHub Actions workflow (`.github/workflows/release.yml`) runs on a pushed tag `v*` that must match the version in `tauri.conf.json`. One job creates a draft release; a matrix (`ubuntu-22.04`, `macos-latest`, `windows-latest`) builds with `tauri-apps/tauri-action` pinned by SHA and uploads to that draft; publishing stays a manual step. macOS ships one universal bundle, signed with a Developer ID certificate and notarized with an Apple ID and app-specific password, both through Tauri's environment variables. Windows is signed with Azure Artifact Signing through `artifact-signing-cli`, its sign command written into a CI-only config passed with `--config`. Linux bundles are not signed. Secrets are listed in `docs/release.md`.
- Rejected: building on every push to a branch (releases should be deliberate); letting each matrix job create the release (they race and can create duplicate drafts); separate Intel and Apple silicon macOS bundles (users would have to pick); an App Store Connect API key for notarization (needs the key file written on the runner; the Apple ID needs only three secrets); a `.pfx` with thumbprint for Windows (certificates issued since June 2023 keep the key in hardware and cannot be exported); the sign command in `tauri.conf.json` (local builds would need Azure tooling).
- Consequences: `S-tauri` criteria once the workflow has run; Linux "signed builds" there needs rewording. Nothing is verified until the owner adds the secrets and pushes a tag. Artifact Signing requires Microsoft's identity validation, which is not offered in every country; another service changes only the sign command step. The app itself still makes no network calls and never runs git; this is CI only.

### D-20261031-022559-5bb8 · Dropped images through Tauri's drag-drop events, copied with a suffix, missing images as a badge
- Context: `S-images` asks for drop, inline rendering and a missing badge, but not how the webview gets dropped files, where the link goes, what happens to a file already in the image root, or how read mode tells a missing image from a refused one. Read mode already showed local images as `data:` URLs (D-20261030-233646-imm8) and a text notice for any failure.
- Decision: OS drops are taken from Tauri's webview drag-drop events (`onDragDropEvent`), which carry file paths; the window keeps Tauri's default drag-drop handling, and the board's card drag uses pointer events, so the two do not meet. Only drops on the open editor pane count. Rust copies each file into the image root, claiming `name`, then `stem-1.ext`, `stem-2.ext`, ... with create-new, and returns the markdown with a link relative to the open file; a file already in the image root is linked without a copy; non-images and files over 20 MB (the read mode limit) are refused. The links go on their own lines at the pointer in source mode (at the cursor over the form, never into the frontmatter) and at the end in read mode, as one store edit like Accept and Reject. `read_image` now returns `shown` or `missing`, and errors stay for refused sources; both show a badge in the line instead of the image.
- Rejected: HTML5 `drop` events in the webview (Tauri's default drag-drop handling keeps OS file drops from the DOM, and DOM files carry no paths); turning Tauri's drag-drop handling off (the dropped bytes would have to be read in the frontend and sent through IPC); overwriting or asking on a name clash (`R-no-destroy`, and a prompt for every drop is noise); a content hash or timestamp as the file name (unreadable links); copying an image that already sits in the image root (duplicates); inserting through a CodeMirror transaction at the drop point (the store's `edit` is the one writer, used by the form and proposals too); a placeholder box the size of the image for missing images (the size is unknown without the file).
- Consequences: `S-images` criteria. Dropping the same file twice makes two copies. Images are checked by extension only, not by content. In source mode the inserted links reach CodeMirror as a new value, as with Accept and Reject, so the cursor lands where CodeMirror maps it. Drop positions rely on Tauri reporting physical pixels; nothing of the drop has been tried in the running app on any platform yet. The `S-editor-layout` criterion that refused images "show a notice" now means the badge.

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
- Criterion: a sub-bullet of a node that describes current behaviour; not a node itself.
- Folder form: the spec split into one file per section under `spec/`, as opposed to the single `spec.md`.
- Spec view: the main area view showing the spec's sections, the fog meter, the gate status and the Structure as a tree or mind map; the alternative to the board.
- Session brief: what the session panel shows at the start of a session, computed from the board and the spec; never written to a file.
- Violation: an existing question or decision that an unsaved edit changes or removes against `R-append-only`; such an edit is not saved.
- Split: moving `spec.md` into the folder form, after a preview; the spec stays the same model.
- Trace: the index between tasks and the nodes they implement, and its gaps: tasks without `implements`, ticked nodes without any task, `implements` entries naming no node.
- Image root: the folder dropped images are copied into, `images_root` in the config, `docs/images` by default; kept out of version control (D-20260919-104200-9f03).
