<!-- planner:start -->
## Planning conventions

Planning lives in `{planning_root}/`. Columns: `inbox/` (new), `next/` (ready for you), `done/` (finished).
One task per file, filename `<id>-<slug>.md`, id format `YYYYMMDD-HHMMSS-xxxx` (millisecond timestamp plus 4 random characters).
The spec (`{spec_location}`) is the source of truth: Constraints, Domain (areas, rules, workflows), Structure (nodes `S-...` with acceptance criteria), Questions, Decisions, Glossary. Tasks are changes that implement nodes.

### At session start
1. Read Constraints, Rules and the last 10 Decisions in the spec, and its open Questions.
2. Read `next/` and the Result of the most recently completed task in `done/`.
3. Do not plan from memory. The code is the current state, the spec is the intent. Where they disagree, report the difference before continuing.

### Before starting a task
- Read the whole task file and the nodes listed in `implements`. Check that they still match the code. If not, add a `> **Proposal:**` to the task and ask before implementing.

### While working
- Keep the Implementation notes current: done, open, next step. Sessions can end at any time.
- Work you discover goes into `inbox/` as a new task file with the id format above.
- Name things in code after the Glossary. Add a term to the Glossary when you introduce one.
- If you add, remove or rename an area, module or view, update the Structure.

### When finishing a task
1. Check every acceptance criterion of the task against the code. Unmet criteria stay unchecked and the task stays in `next/`.
2. Update the criteria of the nodes in `implements` so they describe what the code now does.
3. Fill the Result section, set `completed: <date>`, move the file to `done/`.
4. Append any decision you had to make on the way to the Decisions.

### Always
- Respect the Constraints and Rules. If a task would break one, stop and propose.
- Never rewrite human text, except node criteria in step 2 above; propose in a blockquote starting with `> **Proposal:**`.
- Questions and Decisions are append-only.
- Links between planning files are relative markdown links; keep them working when you move a file.
- Do not touch planning files outside the task you work on and its nodes unless asked.
<!-- planner:end -->
