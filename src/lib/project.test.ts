import { describe, expect, it } from "vitest";
import type { Config, ConfigReport_Serialize, InitReport } from "@/bindings";
import {
  describeBatch,
  describeLinks,
  describeRepair,
  hasLinkNotice,
  hasRepairNotice,
  offerLabel,
  offersOf,
  projectStatus,
} from "./project";

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

describe("describeLinks", () => {
  const file = (name: string) => ({ file: name, changes: [] });

  it("names the files whose links were rewritten", () => {
    expect(describeLinks({ rewritten: [], problems: ["x"] })).toBeNull();
    expect(describeLinks({ rewritten: [file("a.md")], problems: [] })).toBe(
      "Links rewritten in 1 file: a.md",
    );
    expect(
      describeLinks({ rewritten: [file("a.md"), file("b.md")], problems: [] }),
    ).toBe("Links rewritten in 2 files: a.md, b.md");
  });

  it("has a notice when links were rewritten or could not be", () => {
    expect(hasLinkNotice({ rewritten: [], problems: [] })).toBe(false);
    expect(hasLinkNotice({ rewritten: [], problems: ["x"] })).toBe(true);
    expect(hasLinkNotice({ rewritten: [file("a.md")], problems: [] })).toBe(
      true,
    );
  });
});

describe("describeRepair", () => {
  const repaired = {
    file: "docs/planning/note.md",
    changes: [
      { line: 3, old: "next/a.md", new: "done/a.md" },
      { line: 5, old: "inbox/b.md#x", new: "done/2026-10/b.md#x" },
    ],
  };

  it("names each repaired link with its file and new target", () => {
    expect(
      describeRepair({ repaired: [repaired], unresolved: [], problems: [] }),
    ).toEqual([
      "Link repaired in docs/planning/note.md, line 3: next/a.md → done/a.md",
      "Link repaired in docs/planning/note.md, line 5: inbox/b.md#x → done/2026-10/b.md#x",
    ]);
  });

  it("has a notice for repairs and problems, not for unresolved links", () => {
    const unresolved = [
      {
        file: "a.md",
        line: 1,
        target: "x.md",
        reason: { kind: "no_id" as const },
      },
    ];
    expect(hasRepairNotice({ repaired: [], unresolved, problems: [] })).toBe(
      false,
    );
    expect(
      hasRepairNotice({ repaired: [], unresolved: [], problems: ["x"] }),
    ).toBe(true);
    expect(
      hasRepairNotice({ repaired: [repaired], unresolved: [], problems: [] }),
    ).toBe(true);
  });
});
