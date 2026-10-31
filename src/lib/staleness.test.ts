import { describe, expect, it } from "vitest";
import type { Config, Spec, Task_Serialize } from "@/bindings";
import type { BoardColumn } from "./board";
import {
  badgesOf,
  dateDay,
  daysSince,
  flagsByPath,
  repoRelative,
  type StalenessInput,
  stalenessFlags,
  taskAge,
} from "./staleness";

/** Local noon, so the local day is the same in every time zone. */
const NOW = new Date(2026, 9, 31, 12).getTime();

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
  terminal: "done",
  stale_after_days: 14,
  review_after_days: 30,
} as Config;

function task(
  id: string,
  fields: Partial<Task_Serialize> = {},
): Task_Serialize {
  return {
    file_name: `${id}-x.md`,
    id,
    title: id,
    created: null,
    tags: [],
    priority: null,
    depends_on: [],
    parent: null,
    implements: [],
    completed: null,
    modified: null,
    sections: [],
    issues: [],
    ...fields,
  };
}

function column(name: string, tasks: Task_Serialize[]): BoardColumn {
  return { name, tasks, missing: false, error: null };
}

function spec(files: { file: string; reviewed: string | null }[]): Spec {
  return {
    found: true,
    files: files.map((file) => ({
      id: null,
      title: null,
      status: null,
      ...file,
    })),
  } as unknown as Spec;
}

function input(fields: Partial<StalenessInput>): StalenessInput {
  return {
    repoRoot: "/repo",
    config,
    columns: [],
    spec: null,
    missingPaths: [],
    now: NOW,
    ...fields,
  };
}

/** A file time on a local day of October 2026, as RFC 3339 in UTC. */
const changedOn = (day: number) => new Date(2026, 9, day, 9).toISOString();

describe("dates", () => {
  it("reads only real YYYY-MM-DD dates", () => {
    expect(dateDay("2026-10-31")).not.toBeNull();
    expect(dateDay("2026-02-30")).toBeNull();
    expect(dateDay("31.10.2026")).toBeNull();
    expect(dateDay(null)).toBeNull();
  });

  it("counts whole local days", () => {
    expect(daysSince("2026-10-31", NOW)).toBe(0);
    expect(daysSince("2026-10-01", NOW)).toBe(30);
    expect(daysSince("2025-10-31", NOW)).toBe(365);
  });

  it("takes the later of created and the file time as a task's age", () => {
    expect(taskAge("2026-10-01", changedOn(20), NOW)).toBe(11);
    expect(taskAge("2026-10-25", changedOn(1), NOW)).toBe(6);
    expect(taskAge(null, changedOn(1), NOW)).toBe(30);
    expect(taskAge("2026-10-01", null, NOW)).toBe(30);
    expect(taskAge(null, "garbage", NOW)).toBeNull();
  });
});

describe("stalenessFlags", () => {
  it("flags tasks of the ready column older than stale_after_days", () => {
    const columns = [
      column("inbox", [task("old-inbox", { created: "2026-01-01" })]),
      column("next", [
        task("fresh", { created: "2026-10-17" }),
        task("old", { created: "2026-10-16", priority: 2 }),
        task("touched", { created: "2026-01-01", modified: changedOn(30) }),
        task("undated"),
      ]),
      column("done", [task("old-done", { created: "2026-01-01" })]),
    ];
    const flags = stalenessFlags(input({ columns }));
    expect(flags).toEqual([
      {
        kind: "stale-task",
        path: "/repo/docs/planning/next/old-x.md",
        line: null,
        id: "old",
        reason:
          "In next and not created or changed for 15 days (stale_after_days: 14).",
      },
    ]);
  });

  it("uses the configured columns to find the ready one", () => {
    const columns = [
      column("backlog", []),
      column("todo", [task("a", { created: "2026-01-01" })]),
      column("doing", [task("b", { created: "2026-01-01" })]),
      column("finished", []),
    ];
    const custom = {
      ...config,
      columns: ["backlog", "todo", "doing", "finished"],
      terminal: "finished",
    };
    const flags = stalenessFlags(input({ columns, config: custom }));
    expect(flags.map((flag) => flag.id)).toEqual(["a"]);
  });

  it("flags spec files reviewed more than review_after_days ago", () => {
    const flags = stalenessFlags(
      input({
        spec: spec([
          { file: "spec/README.md", reviewed: "2026-09-30" },
          { file: "spec/vision.md", reviewed: null },
          { file: "spec/domain.md", reviewed: "2026-10-01" },
          { file: "spec/glossary.md", reviewed: "soon" },
        ]),
      }),
    );
    expect(flags.map((flag) => [flag.path, flag.reason])).toEqual([
      [
        "/repo/docs/planning/spec/README.md",
        "Reviewed 2026-09-30, 31 days ago (review_after_days: 30).",
      ],
      [
        "/repo/docs/planning/spec/glossary.md",
        'The `reviewed` date "soon" is not a date.',
      ],
    ]);
  });

  it("flags the first spec file without a reviewed date, and no spec at all never", () => {
    const flags = stalenessFlags(
      input({ spec: spec([{ file: "spec.md", reviewed: null }]) }),
    );
    expect(flags.map((flag) => [flag.kind, flag.reason])).toEqual([
      ["unreviewed-spec", "No `reviewed` date in the frontmatter."],
    ]);
    const missing = { ...spec([]), found: false } as Spec;
    expect(stalenessFlags(input({ spec: missing }))).toEqual([]);
  });

  it("flags each missing code path at its line, with the task id", () => {
    const columns = [column("inbox", [task("a")])];
    const flags = stalenessFlags(
      input({
        columns,
        missingPaths: [
          {
            column: "inbox",
            file_name: "a-x.md",
            path: "src/gone.ts",
            line: 7,
          },
          { column: "next", file_name: "b.md", path: "src/x/y.rs", line: 2 },
        ],
      }),
    );
    expect(flags).toEqual([
      {
        kind: "missing-path",
        path: "/repo/docs/planning/inbox/a-x.md",
        line: 7,
        id: "a",
        reason:
          "Mentions `src/gone.ts` (line 7), which does not exist in the repository.",
      },
      {
        kind: "missing-path",
        path: "/repo/docs/planning/next/b.md",
        line: 2,
        id: null,
        reason:
          "Mentions `src/x/y.rs` (line 2), which does not exist in the repository.",
      },
    ]);
  });
});

describe("badges", () => {
  it("groups flags by file and shows one badge per kind", () => {
    const columns = [column("next", [task("a", { created: "2026-01-01" })])];
    const missing = (line: number) => ({
      column: "next",
      file_name: "a-x.md",
      path: `src/${line}.ts`,
      line,
    });
    const byPath = flagsByPath(
      stalenessFlags(
        input({ columns, missingPaths: [missing(3), missing(9)] }),
      ),
    );
    const flags = byPath.get("/repo/docs/planning/next/a-x.md") ?? [];
    expect(flags).toHaveLength(3);
    expect(badgesOf(flags).map((badge) => badge.label)).toEqual([
      "Stale",
      "2 missing paths",
    ]);
    expect(badgesOf(flags)[1].reasons.split("\n")).toHaveLength(2);
    expect(badgesOf([])).toEqual([]);
  });

  it("shows paths relative to the repository root", () => {
    expect(repoRelative("/repo/", "/repo/docs/planning/spec.md")).toBe(
      "docs/planning/spec.md",
    );
    expect(repoRelative("/repo", "/other/spec.md")).toBe("/other/spec.md");
  });
});
