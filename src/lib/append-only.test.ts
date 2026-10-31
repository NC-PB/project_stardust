import { describe, expect, it } from "vitest";
import { violationText } from "./append-only";

describe("violationText", () => {
  const at = { file: "spec/decisions.md", line: 4 };

  it("points to the entry where it is now", () => {
    expect(
      violationText({ id: "D-1", at, now: 7, message: "D-1: changed" }),
    ).toBe("D-1: changed (line 7)");
  });

  it("points to where a removed entry was", () => {
    expect(
      violationText({ id: "D-1", at, now: null, message: "D-1 was removed" }),
    ).toBe("D-1 was removed (was at line 4)");
  });
});
