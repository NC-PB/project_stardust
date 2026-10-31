import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const pick = vi.fn<() => Promise<string | null>>();
const unwatchProject = vi.fn();
const loadConfig = vi.fn();
const doctor = vi.fn();
const moveTask = vi.fn();
type Listener = (event: { payload: unknown }) => void;
const listeners: Record<string, Listener> = {};

vi.mock("@/bindings", () => ({
  commands: new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "unwatchProject") return unwatchProject;
        if (name === "loadConfig") return loadConfig;
        if (name === "doctor") return doctor;
        if (name === "moveTask") return moveTask;
        return async () => ({ status: "ok", data: null });
      },
    },
  ),
  events: {
    planningChanged: {
      listen: async (callback: Listener) => {
        listeners.planning = callback;
        return () => {};
      },
    },
    repositoryChanged: {
      listen: async (callback: Listener) => {
        listeners.repository = callback;
        return () => {};
      },
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: () => pick() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: async () => {} }),
}));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));

const { useWorkspaceStore, WORKSPACE_SETTING, RECENT_SETTING } = await import(
  "./workspace-store"
);
const { useBoardStore } = await import("./board-store");
const { useDoctorStore } = await import("./doctor-store");
const { useEditorStore } = await import("./editor-store");
const { useMenuStore } = await import("./menu-store");
const { useProjectStore } = await import("./project-store");
const { useViewStore } = await import("./view-store");

const NO_LINKS = { rewritten: [], problems: [] };
const NO_REPAIR = { repaired: [], unresolved: [], problems: [] };

const change = (repoRoot: string) => ({
  repo_root: repoRoot,
  batch: { changes: [], config_changed: false },
  block_written: [],
  block_error: null,
  links: NO_LINKS,
  repair: NO_REPAIR,
});

/** Waits until the workspace's queue of tab changes and changes on disk is empty. */
const settled = () => useWorkspaceStore.getState().step(0);

describe("useWorkspaceStore", () => {
  beforeEach(async () => {
    settings.clear();
    vi.clearAllMocks();
    loadConfig.mockResolvedValue({ found: false });
    unwatchProject.mockResolvedValue({ status: "ok", data: null });
    // Closes whatever an earlier test left open.
    for (const tab of useWorkspaceStore.getState().tabs)
      await useWorkspaceStore.getState().close(tab);
    useWorkspaceStore.setState({ recent: [], error: null });
    unwatchProject.mockClear();
  });

  it("opens the repository remembered before there were tabs as the one tab", async () => {
    settings.set("repoRoot", "/old");
    await useWorkspaceStore.getState().restore();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/old"]);
    expect(useWorkspaceStore.getState().active).toBe("/old");
    expect(useWorkspaceStore.getState().recent).toEqual(["/old"]);
    expect(useProjectStore.getState().repoRoot).toBe("/old");
  });

  it("restores the saved tabs and loads only the shown one", async () => {
    settings.set(WORKSPACE_SETTING, { tabs: ["/a", "/b"], active: "/b" });
    settings.set(RECENT_SETTING, ["/b", "/a", "/c"]);
    await useWorkspaceStore.getState().restore();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/a", "/b"]);
    expect(useProjectStore.getState().repoRoot).toBe("/b");
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(loadConfig).toHaveBeenCalledWith("/b");
    expect(useWorkspaceStore.getState().recent).toEqual(["/b", "/a", "/c"]);
  });

  it("opens a picked folder in a new tab and keeps the workspace in the settings", async () => {
    pick.mockResolvedValueOnce("/a");
    await useWorkspaceStore.getState().choose();
    pick.mockResolvedValueOnce("/b");
    await useWorkspaceStore.getState().choose();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/a", "/b"]);
    expect(useProjectStore.getState().repoRoot).toBe("/b");
    expect(settings.get(WORKSPACE_SETTING)).toEqual({
      tabs: ["/a", "/b"],
      active: "/b",
    });
    expect(settings.get(RECENT_SETTING)).toEqual(["/b", "/a"]);
    expect(settings.has("repoRoot")).toBe(false);

    pick.mockResolvedValueOnce(null);
    await useWorkspaceStore.getState().choose();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/a", "/b"]);
  });

  it("keeps each tab's board, view, open file and unsaved edits when switching", async () => {
    await useWorkspaceStore.getState().open("/a");
    useBoardStore.setState({ tagFilter: ["ui"] });
    useViewStore.setState({ view: "spec", mindMap: true });
    // A conflict keeps the edits unsaved through the switch.
    useEditorStore.setState({
      repoRoot: "/a",
      path: "/a/docs/planning/spec.md",
      text: "mine",
      saved: "disk",
      conflict: { kind: "changed", disk: "theirs" },
    });
    useMenuStore.setState({ proposals: true });

    await useWorkspaceStore.getState().open("/b");
    expect(useProjectStore.getState().repoRoot).toBe("/b");
    expect(useBoardStore.getState().tagFilter).toEqual([]);
    expect(useViewStore.getState().view).toBe("board");
    expect(useEditorStore.getState().path).toBeNull();
    expect(useMenuStore.getState().proposals).toBe(false);
    useBoardStore.setState({ tagFilter: ["api"] });

    await useWorkspaceStore.getState().open("/a");
    expect(useProjectStore.getState().repoRoot).toBe("/a");
    expect(useBoardStore.getState().tagFilter).toEqual(["ui"]);
    expect(useViewStore.getState()).toMatchObject({
      view: "spec",
      mindMap: true,
    });
    expect(useEditorStore.getState()).toMatchObject({
      path: "/a/docs/planning/spec.md",
      text: "mine",
      saved: "disk",
    });
    // Shown again from its snapshot, not loaded again.
    expect(loadConfig).toHaveBeenCalledTimes(2);

    await useWorkspaceStore.getState().step(1);
    expect(useBoardStore.getState().tagFilter).toEqual(["api"]);
    await useWorkspaceStore.getState().open("/a");
    useEditorStore.setState({ conflict: null, text: "", saved: "" });
  });

  it("applies a hidden tab's changes on disk when it is shown again", async () => {
    await useWorkspaceStore.getState().listen();
    await useWorkspaceStore.getState().open("/a");
    await useWorkspaceStore.getState().open("/b");

    listeners.planning({ payload: change("/a") });
    listeners.planning({ payload: change("/elsewhere") });
    await settled();
    expect(useProjectStore.getState().revision).toBe(0);

    listeners.planning({ payload: change("/b") });
    await settled();
    expect(useProjectStore.getState().revision).toBe(1);

    await useWorkspaceStore.getState().open("/a");
    expect(useProjectStore.getState().revision).toBe(1);
    expect(useProjectStore.getState().lastChange).toEqual(change("/a"));
  });

  it("closes a tab, stops its watchers and shows the next one", async () => {
    await useWorkspaceStore.getState().open("/a");
    await useWorkspaceStore.getState().open("/b");
    await useWorkspaceStore.getState().open("/c");
    await useWorkspaceStore.getState().open("/b");

    await useWorkspaceStore.getState().close();
    expect(unwatchProject).toHaveBeenCalledWith("/b");
    expect(useWorkspaceStore.getState().tabs).toEqual(["/a", "/c"]);
    expect(useProjectStore.getState().repoRoot).toBe("/c");

    await useWorkspaceStore.getState().close("/a");
    expect(unwatchProject).toHaveBeenCalledWith("/a");
    expect(useProjectStore.getState().repoRoot).toBe("/c");

    await useWorkspaceStore.getState().close("/c");
    expect(useWorkspaceStore.getState()).toMatchObject({
      tabs: [],
      active: null,
    });
    expect(useProjectStore.getState().repoRoot).toBeNull();
    expect(settings.get(WORKSPACE_SETTING)).toEqual({ tabs: [], active: null });

    // The tab shown last before closing comes back first.
    await useWorkspaceStore.getState().reopenRecent();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/b"]);
  });

  it("does not close a tab whose open file has unsaved edits", async () => {
    await useWorkspaceStore.getState().open("/a");
    useEditorStore.setState({
      repoRoot: "/a",
      path: "/a/x.md",
      text: "mine",
      saved: "disk",
      conflict: { kind: "changed", disk: "theirs" },
    });
    await useWorkspaceStore.getState().open("/b");

    await useWorkspaceStore.getState().close("/a");
    expect(unwatchProject).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().tabs).toEqual(["/a", "/b"]);
    // The tab is shown, so the edits can be dealt with.
    expect(useWorkspaceStore.getState().active).toBe("/a");
    expect(useWorkspaceStore.getState().error).not.toBeNull();
    useEditorStore.setState({ conflict: null, text: "", saved: "" });
  });

  it("shows the answer of a check or move that arrived while its tab was hidden", async () => {
    await useWorkspaceStore.getState().open("/a");
    let answer: (report: unknown) => void = () => {};
    doctor.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const checking = useDoctorStore.getState().check("/a");
    useBoardStore.setState({
      repoRoot: "/a",
      config: {
        planning_root: "docs/planning",
        columns: ["inbox", "done"],
        terminal: "done",
      } as never,
      columns: [
        {
          name: "inbox",
          tasks: [{ file_name: "t.md" }],
          missing: false,
          error: null,
        },
        { name: "done", tasks: [], missing: false, error: null },
      ] as never,
    });
    let refuse: (result: unknown) => void = () => {};
    moveTask.mockReturnValueOnce(
      new Promise((resolve) => {
        refuse = resolve;
      }),
    );
    const moving = useBoardStore.getState().moveTask("t.md", "inbox", "done");
    expect(useDoctorStore.getState().checking).toBe(true);

    await useWorkspaceStore.getState().open("/b");
    const report = { findings: [], unreadable: [] };
    answer(report);
    refuse({ status: "error", error: "changed on disk" });
    await checking;
    await moving;
    // The shown tab is not touched.
    expect(useDoctorStore.getState()).toMatchObject({
      repoRoot: null,
      report: null,
      checking: false,
    });
    expect(useBoardStore.getState().moveError).toBeNull();

    await useWorkspaceStore.getState().open("/a");
    expect(useDoctorStore.getState()).toMatchObject({
      repoRoot: "/a",
      report,
      checking: false,
    });
    const board = useBoardStore.getState();
    expect(board.moveError).toBe("changed on disk");
    expect(board.columns[0].tasks.map((task) => task.file_name)).toEqual([
      "t.md",
    ]);
    useDoctorStore.getState().close();
  });
});
