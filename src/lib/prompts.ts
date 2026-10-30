import type { Prompt } from "@/bindings";

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

/** The prompts offered for an open task in phase 1. */
export const TASK_PROMPTS: Prompt[] = [
  "work-on-task",
  "verify-task",
  "handoff",
];

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
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = path.replace(/\\/g, "/");
  if (!file.startsWith(`${root}/`)) return null;
  const relative = file.slice(root.length + 1);
  const planning = planningRoot.replace(/^\/+|\/+$/g, "");
  const prefix = planning === "" ? "" : `${planning}/`;
  if (!relative.startsWith(prefix)) return null;
  const parts = relative.slice(prefix.length).split("/");
  if (parts.length !== 2 || !columns.includes(parts[0])) return null;
  return parts[1].toLowerCase().endsWith(".md") ? relative : null;
}
