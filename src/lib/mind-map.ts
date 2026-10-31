import type { Node, SourceLine, Spec } from "@/bindings";

/**
 * How a node of the mind map is shown: `area` for the top level (no checkbox expected),
 * `ticked` when clarified, `unticked` otherwise (greyed out, `S-mindmap`).
 */
export type MindMapState = "area" | "ticked" | "unticked";

/** A node of the mind map in the shape Markmap draws (`IPureNode` of `markmap-common`). */
export type MindMapNode = {
  /** HTML of the label; every text from the spec is escaped. */
  content: string;
  payload: {
    /** The `S-` id; `null` for the root and for nodes without id. */
    id: string | null;
    state: MindMapState;
    later: boolean;
    /** Where the node starts in the spec; `null` for the root when the Structure is missing. */
    at: SourceLine | null;
  };
  children: MindMapNode[];
};

/** The class every label carries; clicks are traced back to it. */
export const MIND_MAP_LABEL = "mind-map-label";

/** The colour of the branches of unticked nodes; a grey readable on both themes. */
export const UNTICKED_COLOR = "#9ca3af";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** `text` safe inside HTML text and double-quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Top-level nodes are areas; deeper nodes count as clarified only when ticked (`R-tick-means-clear`). */
export function nodeState(node: Node, depth: number): MindMapState {
  if (depth === 0 && node.ticked !== false) return "area";
  return node.ticked === true ? "ticked" : "unticked";
}

function label(
  text: string,
  id: string | null,
  state: MindMapState,
  later: boolean,
  at: SourceLine | null,
): string {
  const classes = [MIND_MAP_LABEL, `mind-map-${state}`];
  if (later) classes.push("mind-map-later");
  const data = at
    ? ` data-file="${escapeHtml(at.file)}" data-line="${at.line}"`
    : "";
  const parts = [escapeHtml(text)];
  if (id !== null) parts.push(`<code>${escapeHtml(id)}</code>`);
  if (later) parts.push(`<span class="mind-map-tag">#later</span>`);
  return `<span class="${classes.join(" ")}"${data}>${parts.join(" ")}</span>`;
}

function toMindMapNode(node: Node, depth: number): MindMapNode {
  const state = nodeState(node, depth);
  const id = node.id ?? null;
  const title = node.title.trim();
  return {
    content: label(title, id, state, node.later, node.at),
    payload: { id, state, later: node.later, at: node.at },
    children: node.children.map((child) => toMindMapNode(child, depth + 1)),
  };
}

/**
 * The Structure of `spec` as a mind map (`S-mindmap`): one root named after the Structure
 * section with the domain areas below it. Labels are title and id.
 */
export function mindMapTree(spec: Spec): MindMapNode {
  const section = spec.sections.find((s) => s.kind === "structure");
  const at = section?.at ?? null;
  const title = section?.heading.trim() || "Structure";
  return {
    content: label(title, null, "area", false, at),
    payload: { id: null, state: "area", later: false, at },
    children: spec.structure.map((node) => toMindMapNode(node, 0)),
  };
}

/** The spot a clicked label points to, from its `data-file` and `data-line`; `null` without. */
export function sourceLineOf(data: {
  file?: string;
  line?: string;
}): SourceLine | null {
  if (data.file === undefined || data.line === undefined) return null;
  const line = Number(data.line);
  if (!Number.isInteger(line) || line < 1) return null;
  return { file: data.file, line };
}

/**
 * The style sheet of the mind map, scoped to the Markmap `id`: app colours and font from the
 * theme variables (`S-theme`), unticked labels greyed out, `#later` marked.
 */
export function mindMapStyle(id: string): string {
  const root = `.${id}`;
  return [
    `${root}{--markmap-text-color:var(--foreground);--markmap-circle-open-bg:var(--background);--markmap-code-bg:var(--muted);--markmap-code-color:var(--muted-foreground);--markmap-highlight-node-bg:var(--muted);--markmap-font:400 14px/20px var(--font-sans)}`,
    `${root} .${MIND_MAP_LABEL}{cursor:pointer}`,
    `${root} .${MIND_MAP_LABEL}:hover{text-decoration:underline}`,
    `${root} .mind-map-unticked{color:var(--muted-foreground);opacity:.6}`,
    `${root} .mind-map-later{font-style:italic}`,
    `${root} .mind-map-tag{font-size:12px;padding:0 4px;border:1px dashed currentColor;border-radius:4px}`,
  ].join("\n");
}
