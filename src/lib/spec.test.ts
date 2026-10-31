import { describe, expect, it } from "vitest";
import type { ChangeBatch } from "@/bindings";
import { specTouched } from "./spec";

const batch = (...paths: string[]): ChangeBatch => ({
  changes: paths.map((path) => ({ kind: "modified", path })),
  config_changed: false,
});

describe("specTouched", () => {
  it("sees the single spec file", () => {
    expect(specTouched(batch("docs/planning/spec.md"), "docs/planning")).toBe(
      true,
    );
  });

  it("sees the spec folder and its files", () => {
    expect(
      specTouched(batch("docs/planning/spec/questions.md"), "docs/planning"),
    ).toBe(true);
    expect(specTouched(batch("docs/planning/spec"), "docs/planning/")).toBe(
      true,
    );
  });

  it("sees a folder that holds the spec", () => {
    expect(specTouched(batch("docs/planning"), "docs/planning")).toBe(true);
    expect(specTouched(batch("docs"), "docs/planning")).toBe(true);
  });

  it("ignores tasks and look-alike names", () => {
    expect(
      specTouched(
        batch("docs/planning/inbox/a.md", "docs/planning/spec.md.bak"),
        "docs/planning",
      ),
    ).toBe(false);
    expect(
      specTouched(batch("docs/planning/specs/a.md"), "docs/planning"),
    ).toBe(false);
  });

  it("sees a move into or out of the spec folder", () => {
    const moved: ChangeBatch = {
      changes: [
        {
          kind: "moved",
          id: "x",
          from: "docs/planning/inbox/a.md",
          to: "docs/planning/spec/a.md",
        },
      ],
      config_changed: false,
    };
    expect(specTouched(moved, "docs/planning")).toBe(true);
  });
});
