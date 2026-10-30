import { describe, expect, it } from "vitest";
import { highlight } from "./search";

describe("highlight", () => {
  it("marks every query word in any case", () => {
    expect(highlight("Sort cards by Priority", "priority CARD")).toEqual([
      { text: "Sort ", match: false },
      { text: "card", match: true },
      { text: "s by ", match: false },
      { text: "Priority", match: true },
    ]);
  });

  it("prefers the longer word where two overlap", () => {
    expect(highlight("boards", "board boards")).toEqual([
      { text: "boards", match: true },
    ]);
  });

  it("leaves text alone without a query", () => {
    expect(highlight("text", "  ")).toEqual([{ text: "text", match: false }]);
    expect(highlight("", "x")).toEqual([]);
  });
});
