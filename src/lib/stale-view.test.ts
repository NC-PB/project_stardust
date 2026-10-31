import { describe, expect, it } from "vitest";
import type {
  Config,
  Finding_Serialize,
  MissingCodePath,
  Spec,
  Task_Serialize,
} from "@/bindings";
import type { BoardColumn } from "./board";
import {
  blockedEntries,
  type StaleViewInput,
  staleGroups,
  staleSummary,
  staleViewEntries,
} from "./stale-view";
import { stalenessFlags } from "./staleness";

/** Local noon, so the local day is the same in every time zone. */
const NOW = new Date(2026, 9, 31, 12).getTime();

function task(
  id: string,
  fields: Partial<Task_Serialize> = {},
): Task_Serialize {
  return {
    file_name: `${id}-x.md`,
    id,
    title: `Task ${id}`,
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

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
  terminal: "done",
  stale_after_days: 14,
  review_after_days: 30,
} as Config;

function input(fields: Partial<StaleViewInput>): StaleViewInput {
  return {
    repoRoot: "/repo",
    config,
    columns: [],
    flags: [],
    findings: [],
    now: NOW,
    ...fields,
  };
}

const finding: Finding_Serialize = {
  kind: "broken_link",
  file: "docs/planning/next/b-x.md",
  line: 7,
  message: "Links to `../gone.md`, which does not exist.",
  fix: null,
};

describe("staleViewEntries", () => {
  it("lists flags, then blocked tasks, then findings, each saying why and where", () => {
    const columns = [
      column("inbox", [task("a", { depends_on: ["b"] })]),
      column("next", [task("b")]),
      column("done", []),
    ];
    const flags = stalenessFlags({
      repoRoot: "/repo",
      config,
      columns,
      spec: spec([{ file: "spec.md", reviewed: null }]),
      missingPaths: [],
      now: NOW,
    });
    const entries = staleViewEntries(
      input({ columns, flags, findings: [finding] }),
    );
    expect(
      entries.map(({ group, label, title, location, path, line }) => ({
        group,
        label,
        title,
        location,
        path,
        line,
      })),
    ).toEqual([
      {
        group: "stale",
        label: "Review due",
        title: null,
        location: "docs/planning/spec.md",
        path: "/repo/docs/planning/spec.md",
        line: null,
      },
      {
        group: "blocked",
        label: "Blocked",
        title: "Task a",
        location: "docs/planning/inbox/a-x.md",
        path: "/repo/docs/planning/inbox/a-x.md",
        line: null,
      },
      {
        group: "broken",
        label: "Broken link",
        title: "Task b",
        location: "docs/planning/next/b-x.md:7",
        path: "/repo/docs/planning/next/b-x.md",
        line: 7,
      },
    ]);
    expect(entries[1].reason).toBe("Depends on b (in next), not yet in done.");
    expect(entries[2].reason).toBe(finding.message);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(3);
  });

  it("lists a task once per reason", () => {
    const columns = [
      column("inbox", []),
      column("next", [
        task("a", { created: "2026-09-01", depends_on: ["b"] }),
        task("b", { created: "2026-10-30" }),
      ]),
      column("done", []),
    ];
    const flags = stalenessFlags({
      repoRoot: "/repo",
      config,
      columns,
      spec: null,
      missingPaths: [
        { column: "next", file_name: "a-x.md", path: "src/x.ts", line: 9 },
      ],
      now: NOW,
    });
    const entries = staleViewEntries(input({ columns, flags }));
    expect(entries.map((entry) => `${entry.label} ${entry.location}`)).toEqual([
      "Stale docs/planning/next/a-x.md",
      "Missing path docs/planning/next/a-x.md:9",
      "Blocked docs/planning/next/a-x.md",
    ]);
  });

  it("lists a dependency on the task itself as broken, not blocked", () => {
    const columns = [
      column("inbox", []),
      column("next", [task("a", { depends_on: ["a"] })]),
      column("done", []),
    ];
    const selfDependency: Finding_Serialize = {
      kind: "dependency_error",
      file: "docs/planning/next/a-x.md",
      line: 5,
      message: "`depends_on` names the task's own id `a`",
      fix: {
        kind: "remove_dependency",
        file: "docs/planning/next/a-x.md",
        id: "a",
      },
    };
    const entries = staleViewEntries(
      input({ columns, findings: [selfDependency] }),
    );
    expect(
      entries.map((entry) => `${entry.group} ${entry.label} ${entry.location}`),
    ).toEqual(["broken Dependency error docs/planning/next/a-x.md:5"]);
    expect(entries[0].title).toBe("Task a");
  });
});

describe("blockedEntries", () => {
  it("follows the board: finished and unknown ids do not block; finished tasks are not listed", () => {
    const columns = [
      column("inbox", [
        task("a", { depends_on: ["done1", "gone"] }),
        task("b", { depends_on: ["c", "done1"] }),
      ]),
      column("next", [task("c", { depends_on: ["b"] })]),
      column("done", [task("done1", { depends_on: ["c"] })]),
    ];
    expect(
      blockedEntries(input({ columns })).map((entry) => entry.reason),
    ).toEqual([
      "Depends on c (in next), not yet in done.",
      "Depends on b (in inbox), not yet in done.",
    ]);
  });
});

describe("staleGroups and staleSummary", () => {
  it("keeps every group and counts them", () => {
    const entries = staleViewEntries(
      input({
        columns: [column("inbox", []), column("next", [task("b")])],
        findings: [finding, { ...finding, line: 9 }],
      }),
    );
    expect(staleGroups(entries).map((group) => group.entries.length)).toEqual([
      0, 0, 2,
    ]);
    expect(staleSummary(entries)).toBe("0 stale, 0 blocked, 2 broken");
    expect(staleSummary([])).toBe("Nothing is stale, blocked or broken.");
  });

  it("lists no findings while the doctor has not answered", () => {
    expect(staleViewEntries(input({ findings: null }))).toEqual([]);
  });
});

/**
 * Phase 4 exit test (`S-staleness`): a project worked on every day for more than two months,
 * read at a fixed time with `stale_after_days` and `review_after_days` from its config. Every
 * entry of the Stale view is checked against the files by rules written out here, apart from
 * the code in `src/lib`, and every file those rules call stale is listed.
 */
describe("phase 4 exit: on a project at least two months old, every entry is actually stale", () => {
  const projectConfig = {
    ...config,
    stale_after_days: 10,
    review_after_days: 45,
  } as Config;
  const START = { year: 2026, month: 7, day: 20 }; // 2026-08-20, 72 days before NOW
  const DAYS = 72;

  /** The local date `offset` days after the start, as `YYYY-MM-DD`. */
  const dateOf = (offset: number) => {
    const date = new Date(START.year, START.month, START.day + offset, 12);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  /** A file time at 09:00 local on that date, as RFC 3339 in UTC. */
  const timeOf = (offset: number) =>
    new Date(START.year, START.month, START.day + offset, 9).toISOString();
  /** Whole days from a `YYYY-MM-DD` date to the local day of NOW. */
  const ageOf = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const today = new Date(NOW);
    return Math.round(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(y, m - 1, d)) /
        86_400_000,
    );
  };

  // One task a day. Every third one is finished three days after it was created; the others
  // wait in inbox or next. Some waiting tasks were touched again recently, some never; some
  // depend on the task before them.
  const inbox: Task_Serialize[] = [];
  const next: Task_Serialize[] = [];
  const done: Task_Serialize[] = [];
  for (let offset = 0; offset < DAYS; offset += 1) {
    const id = `t${String(offset).padStart(3, "0")}`;
    const touched = offset % 4 === 0 ? Math.min(DAYS - 1, offset + 50) : offset;
    const fields: Partial<Task_Serialize> = {
      created: dateOf(offset),
      modified: timeOf(touched),
      depends_on:
        offset % 5 === 0 && offset > 0
          ? [`t${String(offset - 1).padStart(3, "0")}`]
          : [],
    };
    if (offset % 3 === 0 && offset + 3 < DAYS)
      done.push(
        task(id, {
          ...fields,
          completed: dateOf(offset + 3),
          modified: timeOf(offset + 3),
        }),
      );
    else if (offset % 3 === 1) inbox.push(task(id, fields));
    else next.push(task(id, fields));
  }
  // Waits on a task archived long ago: not blocking.
  next.push(
    task("t900", { created: dateOf(DAYS - 1), depends_on: ["archived"] }),
  );
  // Touched exactly `stale_after_days` ago: not stale yet.
  next.push(task("t901", { created: dateOf(0), modified: timeOf(DAYS - 10) }));
  const columns = [
    column("inbox", inbox),
    column("next", next),
    column("done", done),
  ];
  const specFiles = [
    { file: "spec/README.md", reviewed: dateOf(40) },
    { file: "spec/structure.md", reviewed: dateOf(5) },
    { file: "spec/decisions.md", reviewed: null },
    { file: "spec/glossary.md", reviewed: dateOf(30) },
  ];
  const missingPaths: MissingCodePath[] = [
    {
      column: "next",
      file_name: "t002-x.md",
      path: "src/removed.ts",
      line: 12,
    },
  ];
  const removedFiles = new Set(["src/removed.ts"]);
  const findings: Finding_Serialize[] = [
    {
      kind: "broken_link",
      file: "docs/planning/next/t005-x.md",
      line: 14,
      message: "Links to `../done/t004-x.md`, which does not exist.",
      fix: null,
    },
  ];

  const flags = stalenessFlags({
    repoRoot: "/repo",
    config: projectConfig,
    columns,
    spec: spec(specFiles),
    missingPaths,
    now: NOW,
  });
  const entries = staleViewEntries({
    repoRoot: "/repo",
    config: projectConfig,
    columns,
    flags,
    findings,
    now: NOW,
  });

  const columnOf = new Map(
    columns.flatMap((col) => col.tasks.map((t) => [t.id, col.name] as const)),
  );
  const taskAt = (path: string) => {
    const [, columnName, fileName] =
      /^\/repo\/docs\/planning\/([^/]+)\/([^/]+)$/.exec(path) ?? [];
    const found = columns
      .find((col) => col.name === columnName)
      ?.tasks.find((t) => t.file_name === fileName);
    return found === undefined ? null : { column: columnName, task: found };
  };
  const lastTouched = (t: Task_Serialize) => {
    const modified = t.modified === null ? null : new Date(t.modified);
    const modifiedDate =
      modified === null
        ? null
        : `${modified.getFullYear()}-${String(modified.getMonth() + 1).padStart(2, "0")}-${String(modified.getDate()).padStart(2, "0")}`;
    return [t.created, modifiedDate]
      .filter((d): d is string => d !== null)
      .map(ageOf)
      .reduce((a, b) => Math.min(a, b));
  };
  const actuallyStale = (t: Task_Serialize) =>
    lastTouched(t) > projectConfig.stale_after_days;
  const actuallyBlocked = (t: Task_Serialize) =>
    t.depends_on.some((dep) => {
      if (dep === t.id) return false;
      const where = columnOf.get(dep);
      return where !== undefined && where !== "done";
    });

  it("is a project at least two months old with something in every group", () => {
    expect(ageOf(dateOf(0))).toBeGreaterThanOrEqual(61);
    for (const group of staleGroups(entries))
      expect(group.entries.length).toBeGreaterThan(0);
  });

  it("lists only what is actually stale, blocked or broken", () => {
    for (const entry of entries) {
      const at = taskAt(entry.path);
      switch (entry.kind) {
        case "stale-task":
          expect(at?.column, entry.location).toBe("next");
          expect(at && actuallyStale(at.task), entry.location).toBe(true);
          break;
        case "unreviewed-spec": {
          const file = specFiles.find(
            (f) => `/repo/docs/planning/${f.file}` === entry.path,
          );
          const reviewed = file?.reviewed ?? null;
          expect(
            reviewed === null
              ? file?.file === "spec/README.md"
              : ageOf(reviewed) > projectConfig.review_after_days,
            entry.location,
          ).toBe(true);
          break;
        }
        case "missing-path":
          expect(at?.column, entry.location).not.toBe("done");
          expect(
            [...removedFiles].some((path) => entry.reason.includes(path)),
          ).toBe(true);
          break;
        case "blocked":
          expect(at?.column, entry.location).not.toBe("done");
          expect(at && actuallyBlocked(at.task), entry.location).toBe(true);
          break;
        default:
          expect(findings.map((f) => `${f.file}:${f.line}`)).toContain(
            entry.location,
          );
      }
    }
  });

  it("lists everything that is actually stale or blocked, and nothing fresh", () => {
    const listed = (kind: string) =>
      new Set(
        entries
          .filter((entry) => entry.kind === kind)
          .map((entry) => taskAt(entry.path)?.task.id),
      );
    const stale = listed("stale-task");
    const blocked = listed("blocked");
    let fresh = 0;
    for (const t of next) {
      expect(stale.has(t.id), t.id ?? "").toBe(actuallyStale(t));
      if (!actuallyStale(t)) fresh += 1;
    }
    for (const t of [...inbox, ...next])
      expect(blocked.has(t.id), t.id ?? "").toBe(actuallyBlocked(t));
    for (const t of done) {
      expect(stale.has(t.id)).toBe(false);
      expect(blocked.has(t.id)).toBe(false);
    }
    // Fresh tasks exist in the ready column, so leaving them out is tested.
    expect(fresh).toBeGreaterThan(5);
    expect(stale.has("t901")).toBe(false);
    expect(blocked.has("t900")).toBe(false);
    expect(
      entries
        .filter((entry) => entry.kind === "unreviewed-spec")
        .map((entry) => entry.location),
    ).toEqual(["docs/planning/spec/structure.md"]);
  });
});
