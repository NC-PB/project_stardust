import { describe, expect, it } from "vitest";
import type { Node_Serialize, Question_Serialize, Spec } from "@/bindings";
import { answerProblem, openQuestions } from "./questions";

const at = (line: number) => ({ file: "spec.md", line });

const node = (
  id: string | null,
  line: number,
  fields: Partial<Node_Serialize> = {},
): Node_Serialize => ({
  id,
  title: `Title of ${id}`,
  ticked: false,
  later: false,
  blocking_question: null,
  criteria: [],
  rules: [],
  children: [],
  at: at(line),
  end_line: line,
  ...fields,
});

const question = (
  id: string | null,
  line: number,
  fields: Partial<Question_Serialize> = {},
): Question_Serialize => ({
  id,
  text: `${id}?`,
  question: `What about ${id}?`,
  answer: null,
  answered: false,
  answered_on: null,
  blocking: false,
  nodes: [],
  decision: null,
  at: at(line),
  end_line: line,
  ...fields,
});

const spec = (
  structure: Node_Serialize[],
  questions: Question_Serialize[],
): Spec => ({
  form: "file",
  location: "docs/planning/spec.md",
  found: true,
  files: [],
  title: null,
  sections: [],
  vision: "",
  scope: { in_scope: [], out_of_scope: [], later: [] },
  constraints: [],
  domain: { areas: [], entities: [], rules: [], workflows: [] },
  structure,
  questions,
  decisions: [],
  glossary: [],
  issues: [],
});

describe("openQuestions", () => {
  it("lists open questions only, blocking ones first, each group in file order", () => {
    const result = openQuestions(
      spec(
        [
          node("S-area", 1, {
            ticked: null,
            children: [node("S-a", 2, { blocking_question: "Q-linked" })],
          }),
        ],
        [
          question("Q-plain", 10),
          question("Q-marked", 11, { blocking: true }),
          question("Q-done", 12, { answered: true, blocking: true }),
          question("Q-linked", 13),
        ],
      ),
    );
    expect(result.map((entry) => entry.question.id)).toEqual([
      "Q-marked",
      "Q-linked",
      "Q-plain",
    ]);
    expect(result.map((entry) => entry.blocking)).toEqual([true, true, false]);
  });

  it("names the nodes after the arrow, then the nodes linking the question", () => {
    const [entry] = openQuestions(
      spec(
        [
          node("S-a", 2, { blocking_question: "Q-1" }),
          node("S-b", 3, { blocking_question: "Q-1" }),
        ],
        [question("Q-1", 10, { nodes: ["S-b", "S-gone"] })],
      ),
    );
    expect(entry?.nodes).toEqual([
      { id: "S-b", title: "Title of S-b", at: at(3) },
      { id: "S-gone", title: "", at: null },
      { id: "S-a", title: "Title of S-a", at: at(2) },
    ]);
  });

  it("keeps a question without id, which no node can link", () => {
    const [entry] = openQuestions(spec([node("S-a", 2)], [question(null, 10)]));
    expect(entry?.blocking).toBe(false);
    expect(entry?.nodes).toEqual([]);
  });
});

describe("answerProblem", () => {
  it("refuses empty answers and arrows", () => {
    expect(answerProblem(" \n ")).not.toBeNull();
    expect(answerProblem("See → S-a")).not.toBeNull();
    expect(answerProblem("Blue.")).toBeNull();
  });
});
