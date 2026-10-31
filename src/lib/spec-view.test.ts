import { describe, expect, it } from "vitest";
import type { Node_Serialize, Spec } from "@/bindings";
import {
  clarifiedCount,
  expandableKeys,
  hasDetails,
  isExpanded,
  nodeKey,
  questionById,
  sourceLabel,
  specPathOf,
  tickLabel,
} from "./spec-view";

const node = (
  id: string | null,
  ticked: boolean | null,
  children: Node_Serialize[] = [],
  criteria = 0,
): Node_Serialize => ({
  id,
  title: id ?? "untitled",
  ticked,
  later: false,
  blocking_question: null,
  criteria: Array.from({ length: criteria }, (_, i) => ({
    text: `criterion ${i}`,
    at: { file: "spec.md", line: 100 + i },
  })),
  rules: [],
  children,
  at: { file: "spec/structure.md", line: 7 },
  end_line: 9,
});

describe("specPathOf", () => {
  it("joins repository, planning root and spec file", () => {
    expect(specPathOf("/repo/", "docs/planning/", "spec.md")).toBe(
      "/repo/docs/planning/spec.md",
    );
    expect(specPathOf("/repo", "docs/planning", "spec/structure.md")).toBe(
      "/repo/docs/planning/spec/structure.md",
    );
  });
});

describe("nodeKey", () => {
  it("is the id, or file and line without one", () => {
    expect(nodeKey(node("S-a", true))).toBe("S-a");
    expect(nodeKey(node(null, true))).toBe("spec/structure.md:7");
  });
});

describe("expansion", () => {
  const leaf = node("S-leaf", false);
  const withCriteria = node("S-c", true, [], 2);
  const area = node("S-area", null, [withCriteria, leaf]);

  it("expands areas and collapses deeper nodes by default", () => {
    expect(isExpanded({}, area, 0)).toBe(true);
    expect(isExpanded({}, withCriteria, 1)).toBe(false);
    expect(isExpanded({ "S-c": true }, withCriteria, 1)).toBe(true);
    expect(isExpanded({ "S-area": false }, area, 0)).toBe(false);
  });

  it("lists only nodes with criteria or children", () => {
    expect(hasDetails(leaf)).toBe(false);
    expect(hasDetails(withCriteria)).toBe(true);
    expect(expandableKeys([area])).toEqual(["S-area", "S-c"]);
  });
});

describe("tickLabel", () => {
  it("says clarified, never done (R-tick-means-clear)", () => {
    expect(tickLabel(true)).toBe("Clarified");
    expect(tickLabel(false)).toBe("Not clarified");
    expect(tickLabel(null)).toBeNull();
    expect(tickLabel(undefined)).toBeNull();
  });
});

describe("clarifiedCount", () => {
  it("counts nodes with a checkbox at every depth", () => {
    const tree = [
      node("S-area", null, [
        node("S-a", true, [node("S-b", false)]),
        node("S-c", true),
      ]),
    ];
    expect(clarifiedCount(tree)).toEqual({ clarified: 2, total: 3 });
  });
});

describe("questionById", () => {
  const question = {
    id: "Q-1",
    text: "Why?",
    question: "Why?",
    answer: null,
    answered: false,
    answered_on: null,
    blocking: true,
    nodes: [],
    decision: null,
    at: { file: "spec.md", line: 40 },
    end_line: 40,
  };
  const spec = { questions: [question] } as unknown as Spec;

  it("finds the linked question", () => {
    expect(questionById(spec, "Q-1")).toBe(question);
    expect(questionById(spec, "Q-2")).toBeNull();
    expect(questionById(spec, null)).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("is file and line", () => {
    expect(sourceLabel({ file: "spec.md", line: 3 })).toBe("spec.md:3");
  });
});
