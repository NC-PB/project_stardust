import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/bindings";

const settings = new Map<string, unknown>();
const readColumn = vi.fn();
const moveTask = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    readColumn: (...args: unknown[]) => readColumn(...args),
    moveTask: (...args: unknown[]) => moveTask(...args),
  },
}));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));

import { useBoardStore } from "./board-store";
import { useEditorStore } from "./editor-store";

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
  terminal: "done",
} as Config;

const ok = (file: string) => ({
  status: "ok",
  data: [{ file_name: file }],
});

describe("useBoardStore", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
    readColumn.mockImplementation(async (dir: string) =>
      ok(`${dir.split("/").pop()}.md`),
    );
    useBoardStore.getState().clear();
  });

  it("reads the configured columns in order and skips missing folders", async () => {
    await useBoardStore.getState().load("/repo", config, ["next"]);
    const { columns } = useBoardStore.getState();
    expect(columns.map((column) => column.name)).toEqual(config.columns);
    expect(columns[1]).toEqual({
      name: "next",
      tasks: [],
      missing: true,
      error: null,
    });
    expect(readColumn).toHaveBeenCalledWith("/repo/docs/planning/inbox");
    expect(readColumn).not.toHaveBeenCalledWith("/repo/docs/planning/next");
  });

  it("keeps a column that cannot be read, with its error", async () => {
    readColumn.mockResolvedValue({ status: "error", error: "denied" });
    await useBoardStore.getState().load("/repo", config, []);
    expect(useBoardStore.getState().columns[0].error).toBe("denied");
  });

  it("keeps last visits in the app settings, per repository", async () => {
    settings.set("lastVisits", { "/other": 5, "/repo": 10 });
    await useBoardStore.getState().load("/repo", config, []);
    expect(useBoardStore.getState().since).toBe(10);
    const visits = settings.get("lastVisits") as Record<string, number>;
    expect(visits["/other"]).toBe(5);
    expect(visits["/repo"]).toBeGreaterThan(10);
  });

  it("has no previous visit for a new project", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    expect(useBoardStore.getState().since).toBeNull();
  });

  it("keeps the previous visit when the config of the same project reloads", async () => {
    settings.set("lastVisits", { "/repo": 10 });
    await useBoardStore.getState().load("/repo", config, []);
    await useBoardStore.getState().load("/repo", config, []);
    expect(useBoardStore.getState().since).toBe(10);
  });

  it("re-reads only the columns a batch touched", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    readColumn.mockClear();
    readColumn.mockResolvedValue(ok("moved.md"));
    await useBoardStore.getState().apply({
      changes: [
        {
          kind: "moved",
          id: "x",
          from: "docs/planning/inbox/x.md",
          to: "docs/planning/done/x.md",
        },
      ],
      config_changed: false,
    });
    expect(readColumn).toHaveBeenCalledTimes(2);
    const files = useBoardStore
      .getState()
      .columns.map((column) => column.tasks[0].file_name);
    expect(files).toEqual(["moved.md", "next.md", "moved.md"]);
  });

  it("ignores batches outside the columns", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    readColumn.mockClear();
    await useBoardStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/spec.md" }],
      config_changed: false,
    });
    expect(readColumn).not.toHaveBeenCalled();
  });
  it("toggles tags in the filter and clears it with one action", () => {
    const { toggleTag, clearTagFilter } = useBoardStore.getState();
    toggleTag("ui");
    toggleTag("board");
    expect(useBoardStore.getState().tagFilter).toEqual(["ui", "board"]);
    toggleTag("ui");
    expect(useBoardStore.getState().tagFilter).toEqual(["board"]);
    clearTagFilter();
    expect(useBoardStore.getState().tagFilter).toEqual([]);
  });

  it("keeps the filter for the same project and drops it for another", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    useBoardStore.getState().toggleTag("ui");
    await useBoardStore.getState().load("/repo", config, []);
    expect(useBoardStore.getState().tagFilter).toEqual(["ui"]);
    await useBoardStore.getState().load("/other", config, []);
    expect(useBoardStore.getState().tagFilter).toEqual([]);
  });

  it("moves the card at once and calls move_task", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    moveTask.mockResolvedValue({ status: "ok", data: null });
    await useBoardStore.getState().moveTask("inbox.md", "inbox", "done");
    expect(moveTask).toHaveBeenCalledWith("/repo", "inbox.md", "inbox", "done");
    const { columns, moveError } = useBoardStore.getState();
    expect(columns[0].tasks).toEqual([]);
    expect(columns[2].tasks.map((task) => task.file_name)).toEqual([
      "done.md",
      "inbox.md",
    ]);
    expect(moveError).toBeNull();
  });

  it("saves the moved file first when it is open in the editor", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    const order: string[] = [];
    const save = vi.fn(async () => {
      order.push("save");
    });
    moveTask.mockImplementation(async () => {
      order.push("move");
      return { status: "ok", data: null };
    });
    useEditorStore.setState({
      path: "/repo/docs/planning/inbox/inbox.md",
      save,
    });
    await useBoardStore.getState().moveTask("inbox.md", "inbox", "done");
    expect(order).toEqual(["save", "move"]);

    useEditorStore.setState({ path: "/repo/docs/planning/next/other.md" });
    await useBoardStore.getState().moveTask("done.md", "done", "next");
    expect(save).toHaveBeenCalledTimes(1);
    useEditorStore.setState({ path: null });
  });

  it("puts the card back and keeps the error when the move fails", async () => {
    await useBoardStore.getState().load("/repo", config, []);
    moveTask.mockResolvedValue({ status: "error", error: "denied" });
    await useBoardStore.getState().moveTask("inbox.md", "inbox", "next");
    const { columns, moveError } = useBoardStore.getState();
    expect(columns[0].tasks.map((task) => task.file_name)).toEqual([
      "inbox.md",
    ]);
    expect(columns[1].tasks.map((task) => task.file_name)).toEqual(["next.md"]);
    expect(moveError).toBe("denied");
    useBoardStore.getState().dismissMoveError();
    expect(useBoardStore.getState().moveError).toBeNull();
  });
});
