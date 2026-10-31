import type { Node, Question, SourceLine, Spec } from "@/bindings";

/** The main area shows the board or the spec view (`S-spec-file`, `S-nodes`). */
export type MainView = "board" | "spec";

/** The absolute path of a spec file; `file` is relative to the planning root (`S-spec-file`). */
export function specPathOf(
  repoRoot: string,
  planningRoot: string,
  file: string,
): string {
  const root = repoRoot.replace(/[\\/]+$/, "");
  const planning = planningRoot.replace(/^\/+|\/+$/g, "");
  return [root, planning, file].filter((part) => part !== "").join("/");
}

/**
 * The key of a node in the Structure tree: its `S-` id, or its file and line when it has none.
 * Stable while the spec is edited, so collapsed nodes stay collapsed after a reload.
 */
export function nodeKey(node: Node): string {
  return node.id ?? `${node.at.file}:${node.at.line}`;
}

/** Areas start expanded, the nodes below them collapsed. */
export function expandedByDefault(depth: number): boolean {
  return depth === 0;
}

/** Whether a node is expanded: the user's choice this session, else the default for its depth. */
export function isExpanded(
  expanded: Record<string, boolean>,
  node: Node,
  depth: number,
): boolean {
  return expanded[nodeKey(node)] ?? expandedByDefault(depth);
}

/** Whether a node has anything to expand: criteria or child nodes. */
export function hasDetails(node: Node): boolean {
  return node.criteria.length > 0 || node.children.length > 0;
}

/** The keys of every node of the Structure that has details, depth first. */
export function expandableKeys(nodes: Node[]): string[] {
  return nodes.flatMap((node) => [
    ...(hasDetails(node) ? [nodeKey(node)] : []),
    ...expandableKeys(node.children),
  ]);
}

/**
 * What the checkbox of a node says. A tick means clarified, not implemented
 * (`R-tick-means-clear`); implementation is shown through `S-trace`. `null` without a checkbox.
 */
export function tickLabel(ticked: boolean | null | undefined): string | null {
  if (ticked === true) return "Clarified";
  if (ticked === false) return "Not clarified";
  return null;
}

/** How many nodes below `nodes` (them included) have a checkbox, and how many are ticked. */
export function clarifiedCount(nodes: Node[]): {
  clarified: number;
  total: number;
} {
  let clarified = 0;
  let total = 0;
  const visit = (node: Node) => {
    if (node.ticked === true) clarified += 1;
    if (node.ticked === true || node.ticked === false) total += 1;
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return { clarified, total };
}

/** The question with `id`, if the spec has it. */
export function questionById(
  spec: Spec,
  id: string | null | undefined,
): Question | null {
  if (!id) return null;
  return spec.questions.find((question) => question.id === id) ?? null;
}

/** Where to open the editor for a part of the spec, as `file:line` for tooltips. */
export function sourceLabel(at: SourceLine): string {
  return `${at.file}:${at.line}`;
}

/**
 * The name of the control that opens a row of the spec view in the editor, such as
 * `Open S-nodes at spec.md:191`. Rows are text, so this control is how they open (`S-nodes`).
 */
export function openLabel(at: SourceLine, name?: string | null): string {
  return name
    ? `Open ${name} at ${sourceLabel(at)}`
    : `Open ${sourceLabel(at)}`;
}
