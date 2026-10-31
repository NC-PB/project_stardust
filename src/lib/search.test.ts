import { describe, expect, it } from "vitest";
import { highlight, hitLocation } from "./search";

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

describe("hitLocation", () => {
  const hit = {
    path: "docs/planning/next/a.md",
    title: "A",
    snippet: "match",
    line: 12,
  };

  it("opens the file under the repository at the hit's line", () => {
    expect(hitLocation("/repo", hit)).toEqual({
      path: "/repo/docs/planning/next/a.md",
      line: 12,
    });
  });

  it("drops trailing separators of the repository root", () => {
    expect(hitLocation("C:\\repo\\", hit).path).toBe(
      "C:\\repo/docs/planning/next/a.md",
    );
    expect(hitLocation("/repo//", hit).path).toBe(
      "/repo/docs/planning/next/a.md",
    );
  });

  it("opens at the first line when the hit has none", () => {
    expect(hitLocation("/repo", { ...hit, line: 0 }).line).toBe(1);
  });
});
