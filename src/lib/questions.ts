import type { Node, Question, SourceLine, Spec } from "@/bindings";

/** A node an open question concerns, for the Questions form. */
export interface QuestionNode {
  /** The `S-` id; `null` for a node without one. */
  id: string | null;
  /** Empty when the id names no node of the Structure. */
  title: string;
  /** Where the node is; `null` when the id names no node. */
  at: SourceLine | null;
}

/** An open question as the Questions form shows it (`S-questions`). */
export interface OpenQuestion {
  question: Question;
  /**
   * Whether it holds the gate closed: marked `(blocking)`, or a node links it as its blocking
   * question (`S-gate`).
   */
  blocking: boolean;
  /** The nodes it blocks or concerns: those after its `→`, then those that link it. */
  nodes: QuestionNode[];
}

/** Every node of the Structure in file order. */
function allNodes(nodes: readonly Node[]): Node[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.children)]);
}

/**
 * The open questions of the spec for the Questions form (`S-questions`): blocking ones first,
 * each group in file order.
 */
export function openQuestions(spec: Spec): OpenQuestion[] {
  const nodes = allNodes(spec.structure);
  const byId = new Map(
    nodes.flatMap((node) => (node.id ? [[node.id, node] as const] : [])),
  );
  const open = spec.questions
    .filter((question) => !question.answered)
    .map((question): OpenQuestion => {
      const linking = nodes.filter(
        (node) => question.id && node.blocking_question === question.id,
      );
      const listed: QuestionNode[] = question.nodes.map((id) => ({
        id,
        title: byId.get(id)?.title ?? "",
        at: byId.get(id)?.at ?? null,
      }));
      const more = linking
        .filter((node) => !node.id || !question.nodes.includes(node.id))
        .map((node) => ({
          id: node.id ?? null,
          title: node.title,
          at: node.at,
        }));
      return {
        question,
        blocking: question.blocking || linking.length > 0,
        nodes: [...listed, ...more],
      };
    });
  return [
    ...open.filter((entry) => entry.blocking),
    ...open.filter((entry) => !entry.blocking),
  ];
}

/**
 * Why `answer` cannot be saved, or `null` when it can. Rust checks the same before writing;
 * this only keeps Save disabled for an answer that would be refused.
 */
export function answerProblem(answer: string): string | null {
  if (answer.trim() === "") return "Type an answer first";
  if (answer.includes("→"))
    return "An answer cannot contain →; links follow it in the spec";
  return null;
}
