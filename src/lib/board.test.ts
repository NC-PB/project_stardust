import { describe, expect, it } from "vitest";
import type { Task_Serialize } from "@/bindings";
import {
  ageLabel,
  type BoardColumn,
  boardTags,
  type Card,
  cardsOf,
  columnDir,
  filterCards,
  isNewSince,
  moveCard,
  touchedColumns,
} from "./board";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

function task(
  id: string,
  fields: Partial<Task_Serialize> = {},
): Task_Serialize {
  return {
    file_name: `${id}-x.md`,
    id,
    title: id,
    created: "2026-10-30",
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

describe("columnDir", () => {
  it("joins the repository, planning root and column", () => {
    expect(columnDir("/repo/", "docs/planning", "next")).toBe(
      "/repo/docs/planning/next",
    );
    expect(columnDir("C:\\repo", "docs/planning/", "done")).toBe(
      "C:\\repo/docs/planning/done",
    );
  });
});

describe("touchedColumns", () => {
  const columns = ["inbox", "next", "done"];

  it("finds the columns of changed and moved files, in config order", () => {
    const batch = {
      changes: [
        { kind: "modified" as const, path: "docs/planning/done/a.md" },
        {
          kind: "moved" as const,
          id: "x",
          from: "docs/planning/inbox/x.md",
          to: "docs/planning/next/x.md",
        },
      ],
      config_changed: false,
    };
    expect(touchedColumns(batch, "docs/planning", columns)).toEqual(columns);
  });

  it("ignores files outside the columns", () => {
    const batch = {
      changes: [
        { kind: "modified" as const, path: "docs/planning/spec.md" },
        { kind: "created" as const, path: "docs/planning/notes/n.md" },
        { kind: "created" as const, path: "docs/planningx/next/a.md" },
      ],
      config_changed: false,
    };
    expect(touchedColumns(batch, "docs/planning", columns)).toEqual([]);
  });

  it("counts a touched column folder and archive subfolders", () => {
    const batch = {
      changes: [
        { kind: "removed" as const, path: "docs/planning/next" },
        { kind: "created" as const, path: "docs/planning/done/2026-09/a.md" },
      ],
      config_changed: false,
    };
    expect(touchedColumns(batch, "docs/planning", columns)).toEqual([
      "next",
      "done",
    ]);
  });
});

describe("ageLabel", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("uses the largest fitting unit", () => {
    expect(ageLabel(ago(10_000), NOW)).toBe("now");
    expect(ageLabel(ago(5 * 60_000), NOW)).toBe("5m");
    expect(ageLabel(ago(3 * 3_600_000), NOW)).toBe("3h");
    expect(ageLabel(ago(2 * 86_400_000), NOW)).toBe("2d");
    expect(ageLabel(ago(65 * 86_400_000), NOW)).toBe("2mo");
    expect(ageLabel(ago(400 * 86_400_000), NOW)).toBe("1y");
  });

  it("treats future times as now and unknown times as missing", () => {
    expect(ageLabel(ago(-60_000), NOW)).toBe("now");
    expect(ageLabel(null, NOW)).toBeNull();
    expect(ageLabel("not a date", NOW)).toBeNull();
  });
});

describe("isNewSince", () => {
  it("marks files changed after the previous visit", () => {
    expect(isNewSince("2026-10-30T12:00:01.000Z", NOW)).toBe(true);
    expect(isNewSince("2026-10-30T12:00:00.000Z", NOW)).toBe(false);
  });

  it("marks nothing on the first visit", () => {
    expect(isNewSince("2026-10-30T12:00:01.000Z", null)).toBe(false);
    expect(isNewSince(null, NOW)).toBe(false);
  });
});

describe("cardsOf", () => {
  it("counts sub-tasks across columns", () => {
    const columns = [
      column("inbox", [task("p"), task("c1", { parent: "p" })]),
      column("done", [task("c2", { parent: "p" })]),
    ];
    const cards = cardsOf(columns, "done", null, NOW);
    expect(cards.get("inbox")?.[0].subtasks).toBe(2);
    expect(cards.get("inbox")?.[1].subtasks).toBe(0);
  });

  it("blocks on dependencies outside the terminal column only", () => {
    const columns = [
      column("next", [
        task("a", { depends_on: ["b", "c", "archived"] }),
        task("b"),
      ]),
      column("done", [task("c")]),
    ];
    const cards = cardsOf(columns, "done", null, NOW);
    expect(cards.get("next")?.[0].blockedBy).toEqual(["b"]);
    expect(cards.get("next")?.[1].blockedBy).toEqual([]);
  });

  it("fills title, tags, age and the new marker", () => {
    const columns = [
      column("inbox", [
        task("a", {
          title: "A task",
          tags: ["board"],
          modified: "2026-10-30T11:00:00.000Z",
        }),
      ]),
    ];
    const since = Date.parse("2026-10-30T10:00:00.000Z");
    const [card] = cardsOf(columns, "done", since, NOW).get("inbox") ?? [];
    expect(card).toEqual({
      key: "a-x.md",
      id: "a",
      title: "A task",
      tags: ["board"],
      age: "1h",
      subtasks: 0,
      blockedBy: [],
      isNew: true,
    });
  });
});

describe("boardTags", () => {
  it("lists the tags of all columns once, sorted", () => {
    const columns = [
      column("inbox", [task("a", { tags: ["ui", "board"] })]),
      column("done", [task("b", { tags: ["board", "files"] }), task("c")]),
    ];
    expect(boardTags(columns)).toEqual(["board", "files", "ui"]);
  });
});

describe("filterCards", () => {
  const cards = cardsOf(
    [
      column("inbox", [
        task("a", { tags: ["ui", "board"] }),
        task("b", { tags: ["ui"] }),
      ]),
      column("done", [task("c", { tags: ["board"] }), task("d")]),
    ],
    "done",
    null,
    NOW,
  );
  const ids = (filtered: Map<string, Card[]>) =>
    Object.fromEntries(
      [...filtered].map(([name, list]) => [name, list.map((card) => card.id)]),
    );

  it("keeps every card without a filter", () => {
    expect(filterCards(cards, [])).toBe(cards);
  });

  it("hides cards without the tag in all columns", () => {
    expect(ids(filterCards(cards, ["board"]))).toEqual({
      inbox: ["a"],
      done: ["c"],
    });
  });

  it("keeps only cards carrying every selected tag", () => {
    expect(ids(filterCards(cards, ["board", "ui"]))).toEqual({
      inbox: ["a"],
      done: [],
    });
  });
});

describe("moveCard", () => {
  const board = () => [
    column("inbox", [task("a"), task("b")]),
    column("next", [task("c")]),
    column("done", []),
  ];
  const names = (columns: BoardColumn[]) =>
    columns.map((col) => col.tasks.map((t) => t.id).join(","));

  it("moves the task to the end of the target column", () => {
    expect(names(moveCard(board(), "a-x.md", "inbox", "next"))).toEqual([
      "b",
      "c,a",
      "",
    ]);
  });

  it("leaves the board as is for an unknown task, column or the same column", () => {
    const columns = board();
    expect(moveCard(columns, "z-x.md", "inbox", "next")).toBe(columns);
    expect(moveCard(columns, "a-x.md", "inbox", "later")).toBe(columns);
    expect(moveCard(columns, "a-x.md", "inbox", "inbox")).toBe(columns);
  });

  it("does not add a task twice when the target already has it", () => {
    const columns = [column("inbox", [task("a")]), column("next", [task("a")])];
    expect(names(moveCard(columns, "a-x.md", "inbox", "next"))).toEqual([
      "",
      "a",
    ]);
  });
});
