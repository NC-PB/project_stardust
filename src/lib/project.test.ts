import { describe, expect, it } from "vitest";
import type { Config, ConfigReport_Serialize, InitReport } from "@/bindings";
import { describeBatch, offerLabel, offersOf, projectStatus } from "./project";

const report = (found: boolean) => ({ found }) as ConfigReport_Serialize;

const initReport = (gitignore: boolean, block: boolean): InitReport => ({
  created: [],
  existing: [],
  issues: [],
  offer_gitignore: gitignore,
  offer_planner_block: block,
});

describe("projectStatus", () => {
  it("is none without a repository or before the config is loaded", () => {
    expect(projectStatus(null, null)).toBe("none");
    expect(projectStatus("/repo", null)).toBe("none");
  });

  it("needs init when the repository has no config file", () => {
    expect(projectStatus("/repo", report(false))).toBe("needs-init");
  });

  it("is ready when the config file exists", () => {
    expect(projectStatus("/repo", report(true))).toBe("ready");
  });
});

describe("offersOf", () => {
  it("lists the offers the report makes, gitignore first", () => {
    expect(offersOf(initReport(true, true))).toEqual([
      "gitignore",
      "planner-block",
    ]);
    expect(offersOf(initReport(false, true))).toEqual(["planner-block"]);
    expect(offersOf(initReport(false, false))).toEqual([]);
  });
});

describe("offerLabel", () => {
  const config = {
    images_root: "docs/images/",
    agents_file: "AGENTS.md",
  } as Config;

  it("names the image root and the agents file", () => {
    expect(offerLabel("gitignore", config)).toBe(
      "Add docs/images/ to .gitignore",
    );
    expect(offerLabel("planner-block", config)).toBe(
      "Add the planner block to AGENTS.md",
    );
  });
});

describe("describeBatch", () => {
  it("counts changes by kind in a fixed order", () => {
    expect(
      describeBatch({
        changes: [
          { kind: "removed", path: "a" },
          { kind: "created", path: "b" },
          { kind: "created", path: "c" },
          { kind: "moved", id: "x", from: "d", to: "e" },
        ],
        config_changed: true,
      }),
    ).toBe("2 created, 1 moved, 1 removed, config changed");
  });
});
