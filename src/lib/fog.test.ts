import { describe, expect, it } from "vitest";
import type { Node_Serialize, Question_Serialize, Spec } from "@/bindings";
import { FOG_COUNTS, fog, fogCountLabel } from "./fog";

const at = (line: number) => ({ file: "spec.md", line });

const node = (
  id: string,
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
  id: string,
  line: number,
  answered: boolean,
): Question_Serialize => ({
  id,
  text: `${id}?`,
  question: `What about ${id}?`,
  answer: answered ? "This." : null,
  answered,
  answered_on: null,
  blocking: false,
  nodes: [],
  decision: null,
  at: at(line),
  end_line: line,
});

const spec = (
  structure: Node_Serialize[],
  questions: Question_Serialize[] = [],
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

const ids = (entries: { id: string | null }[]) => entries.map((e) => e.id);

describe("fog", () => {
  it("counts ticked and unticked nodes at any depth, not the areas", () => {
    const result = fog(
      spec([
        node("S-area", 1, {
          ticked: null,
          children: [
            node("S-a", 2, { ticked: true }),
            node("S-b", 3, {
              children: [node("S-c", 4, { ticked: true })],
            }),
          ],
        }),
      ]),
    );
    expect(ids(result.ticked)).toEqual(["S-a", "S-c"]);
    expect(ids(result.unticked)).toEqual(["S-b"]);
  });

  it("counts #later nodes separately, ticked or not", () => {
    const result = fog(
      spec([
        node("S-area", 1, {
          ticked: null,
          children: [
            node("S-a", 2, { later: true }),
            node("S-b", 3, { ticked: true, later: true }),
            node("S-c", 4),
          ],
        }),
      ]),
    );
    expect(ids(result.later)).toEqual(["S-a", "S-b"]);
    expect(ids(result.ticked)).toEqual([]);
    expect(ids(result.unticked)).toEqual(["S-c"]);
  });

  it("splits questions into answered and open", () => {
    const result = fog(
      spec([], [question("Q-a", 10, false), question("Q-b", 11, true)]),
    );
    expect(ids(result.open)).toEqual(["Q-a"]);
    expect(ids(result.answered)).toEqual(["Q-b"]);
  });

  it("keeps what is needed to list an entry and open the spec at it", () => {
    const result = fog(
      spec(
        [node("S-area", 1, { ticked: null, children: [node("S-a", 7)] })],
        [question("Q-a", 12, false)],
      ),
    );
    expect(result.unticked[0]).toEqual({
      id: "S-a",
      label: "Title of S-a",
      at: at(7),
    });
    expect(result.open[0]).toEqual({
      id: "Q-a",
      label: "What about Q-a?",
      at: at(12),
    });
  });

  it("keeps items without id", () => {
    const nameless = node("", 2, { id: null });
    const result = fog(
      spec([node("S-area", 1, { ticked: null, children: [nameless] })]),
    );
    expect(ids(result.unticked)).toEqual([null]);
  });

  it("gives every count a label", () => {
    for (const count of FOG_COUNTS) expect(fogCountLabel(count)).not.toBe("");
  });
});
