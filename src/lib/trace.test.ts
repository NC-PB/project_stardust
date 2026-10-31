import { describe, expect, it } from "vitest";
import type { Node_Serialize, Task_Serialize } from "@/bindings";
import type { BoardColumn } from "./board";
import { buildTrace, tasksOfNode, tracedTaskLabel } from "./trace";

function task(id: string, implementsIds: string[] = []): Task_Serialize {
  return {
    file_name: `${id}-x.md`,
    id,
    title: `Task ${id}`,
    created: null,
    tags: [],
    priority: null,
    depends_on: [],
    parent: null,
    implements: implementsIds,
    completed: null,
    modified: null,
    sections: [],
    issues: [],
  };
}

function column(name: string, tasks: Task_Serialize[]): BoardColumn {
  return { name, tasks, missing: false, error: null };
}

let line = 0;
function node(
  id: string | null,
  ticked: boolean | null,
  children: Node_Serialize[] = [],
  later = false,
): Node_Serialize {
  line += 1;
  return {
    id,
    title: `Node ${id ?? "untitled"}`,
    ticked,
    later,
    blocking_question: null,
    criteria: [],
    rules: [],
    children,
    at: { file: "spec.md", line },
    end_line: line,
  };
}

describe("buildTrace", () => {
  it("maps node ids to their tasks with the column, in column order", () => {
    const structure = [
      node(null, null, [node("S-a", true), node("S-b", true)]),
    ];
    const trace = buildTrace(
      [
        column("inbox", [task("1", ["S-a"])]),
        column("next", [task("2", ["S-a", "S-b"])]),
        column("done", [task("3", ["S-a"])]),
      ],
      structure,
      "done",
    );
    expect(
      tasksOfNode(trace, "S-a").map((t) => [t.id, t.column, t.fileName]),
    ).toEqual([
      ["1", "inbox", "1-x.md"],
      ["2", "next", "2-x.md"],
      ["3", "done", "3-x.md"],
    ]);
    expect(tasksOfNode(trace, "S-b").map((t) => t.id)).toEqual(["2"]);
    expect(tasksOfNode(trace, "S-c")).toEqual([]);
    expect(tasksOfNode(trace, null)).toEqual([]);
  });

  it("counts an entry repeated in one task once and trims it", () => {
    const trace = buildTrace(
      [column("next", [task("1", ["S-a", " S-a ", ""])])],
      [node("S-a", true)],
      "done",
    );
    expect(tasksOfNode(trace, "S-a")).toHaveLength(1);
    expect(trace.unknownImplements).toEqual([]);
    expect(trace.withoutImplements).toEqual([]);
  });

  it("lists tasks without implements outside the terminal column", () => {
    const trace = buildTrace(
      [
        column("inbox", [task("1"), task("2", ["S-a"])]),
        column("done", [task("3")]),
      ],
      [node("S-a", true)],
      "done",
    );
    expect(trace.withoutImplements.map((t) => [t.id, t.column])).toEqual([
      ["1", "inbox"],
    ]);
  });

  it("reports implements entries that name no node, in every column", () => {
    const trace = buildTrace(
      [
        column("next", [task("1", ["S-a", "S-gone"])]),
        column("done", [task("2", ["S-old"])]),
      ],
      [node("S-a", true)],
      "done",
    );
    expect(
      trace.unknownImplements.map((u) => [u.task.id, u.task.column, u.nodeId]),
    ).toEqual([
      ["1", "next", "S-gone"],
      ["2", "done", "S-old"],
    ]);
    expect(trace.tasksByNode.has("S-gone")).toBe(false);
  });

  it("lists ticked nodes without any task, not areas, unticked or #later nodes", () => {
    const structure = [
      node(null, null, [
        node("S-traced", true),
        node("S-untraced", true),
        node("S-unclear", false),
        node("S-deferred", true, [node("S-deferred-child", true)], true),
      ]),
      node("S-area", null),
    ];
    const trace = buildTrace(
      [column("done", [task("1", ["S-traced"])])],
      structure,
      "done",
    );
    expect(trace.untracedNodes.map((n) => n.id)).toEqual(["S-untraced"]);
    expect(trace.untracedNodes[0]?.at.file).toBe("spec.md");
  });

  it("counts a node as traced when a node below it has a task", () => {
    const structure = [
      node("S-parent", true, [node("S-child", true), node("S-other", true)]),
      node("S-lonely", true, [node("S-lonely-child", true)]),
    ];
    const trace = buildTrace(
      [column("next", [task("1", ["S-child"])])],
      structure,
      "done",
    );
    expect(trace.untracedNodes.map((n) => n.id)).toEqual([
      "S-other",
      "S-lonely",
      "S-lonely-child",
    ]);
  });

  it("is empty for an empty board and Structure", () => {
    const trace = buildTrace([], [], "done");
    expect(trace.tasksByNode.size).toBe(0);
    expect(trace.withoutImplements).toEqual([]);
    expect(trace.untracedNodes).toEqual([]);
    expect(trace.unknownImplements).toEqual([]);
  });
});

describe("tracedTaskLabel", () => {
  it("uses the title, else the file name", () => {
    expect(
      tracedTaskLabel({
        id: "1",
        title: "Do it",
        fileName: "1.md",
        column: "next",
      }),
    ).toBe("Do it");
    expect(
      tracedTaskLabel({
        id: null,
        title: " ",
        fileName: "x.md",
        column: "next",
      }),
    ).toBe("x.md");
  });
});
