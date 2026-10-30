# Prompt templates

Text only, agent agnostic. The tool fills the placeholders and copies the prompt to the clipboard. Adapters wrap the same text as agent command files.

Placeholders: `{planning_root}`, `{task_path}`, `{spec_location}` (`docs/planning/spec.md` or `docs/planning/spec/`), `{node_id}`, and the column names `{new_column}` (first column), `{ready_column}` (second), `{terminal_column}`.

Each prompt repeats the one check that matters for its step, because standing instructions in AGENTS.md fade during a session.

---

## Work on task

```
Work on {task_path}. Follow the planning conventions in AGENTS.md.
Before you start: read the whole task file and the spec nodes in its implements field, and check that they and the Constraints still match the code. If not, add a proposal to the task and ask me before implementing.
Keep the Implementation notes current while you work. When finished, update the criteria of the implemented nodes to match the code.
```

## Verify task

```
Verify {task_path} against the code. For every acceptance criterion report pass or fail with the evidence (file, function, test). Change nothing. Do not move the file.
```

## Verify area

```
Verify the subtree of node {node_id} in {spec_location} against the code. For every criterion of every node in it report pass or fail with the evidence. Report criteria that the code contradicts and code behaviour that no criterion describes. Change nothing.
```

## Handoff

```
The session is ending. In {task_path}, update the Implementation notes with three short parts: done, open, next step. Change nothing else. Do not move the file.
```

## Triage inbox

```
Read every task in {planning_root}/{new_column}/. For each one: if it is clear, has acceptance criteria, references nodes in implements and is not blocked, move it to {planning_root}/{ready_column}/ and set a priority. If not, leave it in {new_column}/ and add a proposal describing what is missing. Change no other files.
```

## Structure this

```
Read {planning_root}/braindump.md and create {spec_location} following the spec template: Vision, Scope, Constraints, Domain (areas marked core, supporting or generic; entities; rules with R- ids; workflows), Structure grouped by area with S- ids and every node unticked, Questions, Decisions, Glossary. Use only what the braindump contains; where it is silent, add an open question instead of inventing an answer. Do not change the braindump.
```

## Interview me

```
Read {spec_location}. Find the five unknowns that block the most nodes. Ask about the domain before screens: areas, rules, workflows and terms first, views last. Append the questions to Open with new ids in the format Q-YYYYMMDD-HHMMSS-xxxx, each with the node it blocks and whether it is blocking. Change no other section or file.
```

## Integrate answers

```
Read {spec_location}. For every question in Open that now has an answer: re-read the affected sections before editing, update the nodes, rules, entities and Glossary it affects, add criteria to nodes where the answer makes behaviour clear, tick nodes that are now clear, append a decision with a new id in the format D-YYYYMMDD-HHMMSS-xxxx if the answer decided something, and move the question to Answered with a link to the decision. Work from the files as they are now, not from memory. Append only to Questions and Decisions.
```

## Generate tasks

```
Read {spec_location}. First verify every ticked node against the current code; a node the code contradicts becomes an open question, not a task, and a node the code already fulfils gets no task. Then create task files in {planning_root}/{new_column}/ for the remaining work, following the task template and the id format in AGENTS.md. Every task lists the nodes it implements in implements and takes its acceptance criteria from those nodes. Order core areas first. Skip nodes tagged #later. Change no other files.
```
