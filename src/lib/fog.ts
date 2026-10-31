import type { Node, Question, SourceLine, Spec } from "@/bindings";

/**
 * The counts of the fog meter (`S-fog-meter`). Nodes tagged `#later` are counted under
 * `later` only, ticked or not; domain areas (nodes without a checkbox) are not counted.
 */
export type FogCount = "ticked" | "unticked" | "later" | "answered" | "open";

/** The counts in the order the fog meter shows them. */
export const FOG_COUNTS: readonly FogCount[] = [
  "ticked",
  "unticked",
  "later",
  "answered",
  "open",
];

/** A node or question behind a count, enough to list it and open the spec at it. */
export interface FogEntry {
  /** The `S-` or `Q-` id, `null` when the item has none. */
  id: string | null;
  /** The node title or the question text. */
  label: string;
  at: SourceLine;
}

/** The nodes and questions behind each count, in file order. */
export type Fog = Record<FogCount, FogEntry[]>;

/** Which count a node belongs to; `null` for domain areas (no checkbox). */
function nodeCount(node: Node): FogCount | null {
  if (node.ticked === null || node.ticked === undefined) return null;
  if (node.later) return "later";
  return node.ticked ? "ticked" : "unticked";
}

function nodeEntry(node: Node): FogEntry {
  return { id: node.id ?? null, label: node.title, at: node.at };
}

function questionEntry(question: Question): FogEntry {
  return { id: question.id ?? null, label: question.question, at: question.at };
}

/** Sorts the nodes and questions of a spec into the counts of the fog meter (`S-fog-meter`). */
export function fog(spec: Spec): Fog {
  const result: Fog = {
    ticked: [],
    unticked: [],
    later: [],
    answered: [],
    open: [],
  };
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      const count = nodeCount(node);
      if (count !== null) result[count].push(nodeEntry(node));
      visit(node.children);
    }
  };
  visit(spec.structure);
  for (const question of spec.questions)
    result[question.answered ? "answered" : "open"].push(
      questionEntry(question),
    );
  return result;
}

/** The label of a count. */
export function fogCountLabel(count: FogCount): string {
  switch (count) {
    case "ticked":
      return "Ticked nodes";
    case "unticked":
      return "Unticked nodes";
    case "later":
      return "Later";
    case "answered":
      return "Answered questions";
    case "open":
      return "Open questions";
  }
}
