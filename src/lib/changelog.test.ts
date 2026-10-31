import { describe, expect, it } from "vitest";
import { entriesLabel, entryCount, sinceOf } from "./changelog";

describe("sinceOf", () => {
  it("takes the input of the chosen mode, trimmed", () => {
    expect(sinceOf("date", " 2026-10-01 ", "v1")).toEqual({
      kind: "date",
      date: "2026-10-01",
    });
    expect(sinceOf("tag", "2026-10-01", " v1 ")).toEqual({
      kind: "tag",
      tag: "v1",
    });
  });

  it("is null while the chosen input is empty", () => {
    expect(sinceOf("date", "", "v1")).toBeNull();
    expect(sinceOf("tag", "2026-10-01", "  ")).toBeNull();
  });
});

describe("entryCount and entriesLabel", () => {
  it("counts the entries of every group", () => {
    expect(entryCount([{ entries: [1, 2] }, { entries: [3] }])).toBe(3);
    expect(entryCount([])).toBe(0);
    expect(entriesLabel(1)).toBe("1 entry");
    expect(entriesLabel(3)).toBe("3 entries");
  });
});
