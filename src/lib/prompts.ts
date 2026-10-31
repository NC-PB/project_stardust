import type { Prompt, PromptInput } from "@/bindings";

/** The button label of each prompt, as headed in `templates/prompts.md` (`S-prompts`). */
export const PROMPT_LABELS: Record<Prompt, string> = {
  "work-on-task": "Work on task",
  "verify-task": "Verify task",
  "verify-area": "Verify area",
  handoff: "Handoff",
  "triage-inbox": "Triage inbox",
  "structure-this": "Structure this",
  "interview-me": "Interview me",
  "integrate-answers": "Integrate answers",
  "generate-tasks": "Generate tasks",
};

/** The prompts offered for an open task. */
export const TASK_PROMPTS = [
  "work-on-task",
  "verify-task",
  "handoff",
] as const satisfies readonly Prompt[];

/** The prompts offered while the braindump is open. */
export const BRAINDUMP_PROMPTS = [
  "structure-this",
] as const satisfies readonly Prompt[];

/** The prompts in the spec view header; each works on the whole spec. */
export const SPEC_PROMPTS = [
  "interview-me",
  "integrate-answers",
  "generate-tasks",
] as const satisfies readonly Prompt[];

/** The prompts that work on a whole file, the board or the spec; Verify area needs a node. */
export const FILE_PROMPTS = [
  ...TASK_PROMPTS,
  ...BRAINDUMP_PROMPTS,
  "triage-inbox",
  ...SPEC_PROMPTS,
] as const satisfies readonly Prompt[];

export type FilePrompt = (typeof FILE_PROMPTS)[number];

/** The prompts of the editor's "Copy prompt" row and what they are filled with. */
export interface EditorPrompts {
  prompts: readonly FilePrompt[];
  input: PromptInput;
}

/**
 * The prompts for the file at `path` open in the editor: the task prompts for a task, Structure
 * this for the braindump (`{planning_root}/braindump.md`, the file the prompt reads), otherwise
 * `null`.
 */
export function editorPromptsOf(
  path: string,
  repoRoot: string,
  planningRoot: string,
  columns: string[],
): EditorPrompts | null {
  const taskPath = taskPathOf(path, repoRoot, planningRoot, columns);
  if (taskPath !== null)
    return {
      prompts: TASK_PROMPTS,
      input: { task_path: taskPath, node_id: null },
    };
  if (relativePathOf(path, repoRoot, planningRoot) === "braindump.md")
    return {
      prompts: BRAINDUMP_PROMPTS,
      input: { task_path: null, node_id: null },
    };
  return null;
}

/** The input of Verify area for the node `nodeId`. */
export function nodeInputOf(nodeId: string): PromptInput {
  return { task_path: null, node_id: nodeId };
}

/** The input of the prompts that need neither a task nor a node. */
export const NO_INPUT: PromptInput = { task_path: null, node_id: null };

/**
 * The path of `path` relative to `repoRoot` when it is a markdown file directly in one of the
 * `columns` under `planningRoot`, otherwise `null`. Uses `/` throughout.
 */
export function taskPathOf(
  path: string,
  repoRoot: string,
  planningRoot: string,
  columns: string[],
): string | null {
  const inPlanning = relativePathOf(path, repoRoot, planningRoot);
  if (inPlanning === null) return null;
  const parts = inPlanning.split("/");
  if (parts.length !== 2 || !columns.includes(parts[0])) return null;
  if (!parts[1].toLowerCase().endsWith(".md")) return null;
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  return path.replace(/\\/g, "/").slice(root.length + 1);
}

/** The path of `path` relative to the planning root, with `/`; `null` outside it. */
function relativePathOf(
  path: string,
  repoRoot: string,
  planningRoot: string,
): string | null {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = path.replace(/\\/g, "/");
  if (!file.startsWith(`${root}/`)) return null;
  const relative = file.slice(root.length + 1);
  const planning = planningRoot.replace(/^\/+|\/+$/g, "");
  const prefix = planning === "" ? "" : `${planning}/`;
  return relative.startsWith(prefix) ? relative.slice(prefix.length) : null;
}
