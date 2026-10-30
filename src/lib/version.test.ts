import { describe, expect, it } from "vitest";
import { versionLabel } from "./version";

describe("versionLabel", () => {
  it("prefixes a loaded version with v", () => {
    expect(versionLabel("0.1.0")).toBe("v0.1.0");
  });

  it("shows a placeholder while loading", () => {
    expect(versionLabel(null)).toBe("loading…");
  });
});
