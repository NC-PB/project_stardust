import { describe, expect, it } from "vitest";
import type {
  Config,
  Decision_Serialize,
  Question_Serialize,
  Spec_Serialize,
  Task_Serialize,
} from "@/bindings";
import type { BoardColumn } from "./board";
import {
  lastCompletedTask,
  readyColumnOf,
  readyOrder,
  resultOf,
  SESSION_DECISIONS,
  sessionBrief,
} from "./session";

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

function decision(id: string, line: number, superseded = false) {
  return {
    id,
    title: `Title ${id}`,
    fields: [],
    superseded_by: superseded ? ["D-later"] : [],
    at: { file: "spec.md", line },
    end_line: line + 3,
  } satisfies Decision_Serialize;
}

function question(
  id: string,
  fields: Partial<Question_Serialize> = {},
): Question_Serialize {
  return {
    id,
    text: `Why ${id}? (2026-10-31)`,
    question: `Why ${id}?`,
    answer: null,
    answered: false,
    answered_on: null,
    blocking: false,
    nodes: [],
    decision: null,
    at: { file: "spec/questions.md", line: 4 },
    end_line: 4,
    ...fields,
  };
}

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
  terminal: "done",
} as Config;

describe("readyColumnOf", () => {
  it("takes the second column counted without the terminal one", () => {
    expect(readyColumnOf(["inbox", "next", "done"], "done")).toBe("next");
    expect(readyColumnOf(["done", "inbox", "doing", "x"], "done")).toBe(
      "doing",
    );
    expect(
      readyColumnOf(["backlog", "todo", "doing", "review", "done"], "done"),
    ).toBe("todo");
  });

  it("falls back to the single open column, then the terminal one", () => {
    expect(readyColumnOf(["inbox", "done"], "done")).toBe("inbox");
    expect(readyColumnOf(["done"], "done")).toBe("done");
  });
});

describe("readyOrder", () => {
  it("puts priorities first, then orders by file name", () => {
    const tasks = [
      task("20261031-000003-cccc"),
      task("20261031-000002-bbbb", { priority: 3 }),
      task("20261031-000001-aaaa"),
      task("20261031-000004-dddd", { priority: 1 }),
    ];
    expect(readyOrder(tasks).map((t) => t.id)).toEqual([
      "20261031-000004-dddd",
      "20261031-000002-bbbb",
      "20261031-000001-aaaa",
      "20261031-000003-cccc",
    ]);
  });
});

describe("lastCompletedTask", () => {
  it("takes the latest completed date, then the latest file time", () => {
    const tasks = [
      task("a", { completed: "2026-10-30", modified: "2026-10-31T09:00:00Z" }),
      task("b", { completed: "2026-10-31", modified: "2026-10-31T08:00:00Z" }),
      task("c", { completed: "2026-10-31", modified: "2026-10-31T10:00:00Z" }),
      task("d", { modified: "2026-11-01T10:00:00Z" }),
    ];
    expect(lastCompletedTask(tasks)?.id).toBe("c");
  });

  it("uses file time when no task has a completed date", () => {
    const tasks = [
      task("a", { modified: "2026-10-30T09:00:00Z" }),
      task("b", { modified: "2026-10-31T09:00:00Z" }),
      task("c"),
    ];
    expect(lastCompletedTask(tasks)?.id).toBe("b");
  });

  it("is null without tasks", () => {
    expect(lastCompletedTask([])).toBeNull();
  });
});

describe("resultOf", () => {
  it("returns the trimmed Result section", () => {
    const done = task("a", {
      sections: [
        { heading: "Description", content: "x" },
        { heading: "Result", content: "\nShipped.\n" },
      ],
    });
    expect(resultOf(done)).toBe("Shipped.");
  });

  it("is null for a missing or empty Result", () => {
    expect(resultOf(task("a"))).toBeNull();
    expect(
      resultOf(task("a", { sections: [{ heading: "Result", content: " " }] })),
    ).toBeNull();
  });
});

describe("sessionBrief", () => {
  const columns = [
    column("inbox", [task("i")]),
    column("next", [task("n2"), task("n1", { priority: 2 })]),
    column("done", [
      task("d1", { completed: "2026-10-30" }),
      task("d2", {
        completed: "2026-10-31",
        sections: [{ heading: "Result", content: "It works." }],
      }),
    ]),
  ];
  const decisions = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    decision(`D-${n}`, n * 10, n === 6),
  );
  const spec = {
    decisions,
    questions: [
      question("Q-1", { blocking: true }),
      question("Q-2"),
      question("Q-3", { blocking: true, answered: true }),
    ],
  } as unknown as Spec_Serialize;

  it("lists the ready tasks in order with their file paths", () => {
    const brief = sessionBrief("/repo", config, columns, spec);
    expect(brief.readyColumn).toBe("next");
    expect(brief.ready).toEqual([
      {
        id: "n1",
        title: "n1",
        priority: 2,
        path: "/repo/docs/planning/next/n1-x.md",
      },
      {
        id: "n2",
        title: "n2",
        priority: null,
        path: "/repo/docs/planning/next/n2-x.md",
      },
    ]);
  });

  it("gives the Result of the task finished last", () => {
    expect(sessionBrief("/repo", config, columns, spec).lastCompleted).toEqual({
      id: "d2",
      title: "d2",
      completed: "2026-10-31",
      result: "It works.",
      path: "/repo/docs/planning/done/d2-x.md",
    });
  });

  it("shows the last five decisions newest first, with their spec file", () => {
    const brief = sessionBrief("/repo", config, columns, spec);
    expect(brief.decisions).toHaveLength(SESSION_DECISIONS);
    expect(brief.decisions.map((entry) => entry.id)).toEqual([
      "D-7",
      "D-6",
      "D-5",
      "D-4",
      "D-3",
    ]);
    expect(brief.decisions[1]).toEqual({
      id: "D-6",
      text: "Title D-6",
      path: "/repo/docs/planning/spec.md",
      line: 60,
      superseded: true,
    });
  });

  it("keeps only open blocking questions", () => {
    const brief = sessionBrief("/repo", config, columns, spec);
    expect(brief.blockingQuestions).toEqual([
      {
        id: "Q-1",
        text: "Why Q-1?",
        path: "/repo/docs/planning/spec/questions.md",
        line: 4,
        superseded: false,
      },
    ]);
  });

  it("has empty spec parts without a spec and no result without done tasks", () => {
    const brief = sessionBrief(
      "/repo",
      config,
      [column("inbox", []), column("next", [])],
      null,
    );
    expect(brief).toEqual({
      readyColumn: "next",
      ready: [],
      lastCompleted: null,
      decisions: [],
      blockingQuestions: [],
    });
  });
});
