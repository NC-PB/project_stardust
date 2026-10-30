import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const pick = vi.fn<() => Promise<string | null>>();
const loadConfig = vi.fn();
const initProject = vi.fn();
const addImagesToGitignore = vi.fn();
const writePlannerBlock = vi.fn();
const watchProject = vi.fn();
const loadBoard = vi.fn();
const applyBatch = vi.fn();
const clearBoard = vi.fn();
const sources = {
  braindump: "/repo/docs/planning/braindump.md",
  spec: "/repo/docs/planning/spec.md",
};

vi.mock("@/bindings", () => ({
  commands: {
    loadConfig: (...args: unknown[]) => loadConfig(...args),
    initProject: (...args: unknown[]) => initProject(...args),
    addImagesToGitignore: (...args: unknown[]) => addImagesToGitignore(...args),
    writePlannerBlock: (...args: unknown[]) => writePlannerBlock(...args),
    watchProject: (...args: unknown[]) => watchProject(...args),
    sourceFiles: async () => sources,
  },
  events: { planningChanged: { listen: vi.fn() } },
}));
vi.mock("./board-store", () => ({
  useBoardStore: {
    getState: () => ({ load: loadBoard, apply: applyBatch, clear: clearBoard }),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: () => pick() }));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));

import { useProjectStore } from "./project-store";

const initReport = {
  created: ["docs/planner.yml"],
  existing: [],
  issues: [],
  offer_gitignore: true,
  offer_planner_block: true,
};

describe("useProjectStore", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
    loadConfig.mockResolvedValue({ found: false });
    watchProject.mockResolvedValue({ status: "ok", data: null });
    useProjectStore.setState({
      repoRoot: null,
      config: null,
      initReport: null,
      offers: [],
      error: null,
      lastChange: null,
      revision: 0,
    });
  });

  it("opens a picked folder and remembers it in the settings", async () => {
    pick.mockResolvedValue("/repo");
    await useProjectStore.getState().choose();
    expect(useProjectStore.getState().repoRoot).toBe("/repo");
    expect(useProjectStore.getState().config).toEqual({ found: false });
    expect(settings.get("repoRoot")).toBe("/repo");
  });

  it("does nothing when the picker is cancelled", async () => {
    pick.mockResolvedValue(null);
    await useProjectStore.getState().choose();
    expect(useProjectStore.getState().repoRoot).toBeNull();
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it("restores the remembered repository", async () => {
    settings.set("repoRoot", "/saved");
    await useProjectStore.getState().restore();
    expect(loadConfig).toHaveBeenCalledWith("/saved");
    expect(useProjectStore.getState().repoRoot).toBe("/saved");
  });

  it("runs init, keeps its report and reloads the config", async () => {
    await useProjectStore.getState().openRepository("/repo");
    initProject.mockResolvedValue({ status: "ok", data: initReport });
    loadConfig.mockResolvedValue({ found: true });
    await useProjectStore.getState().initialize();
    const state = useProjectStore.getState();
    expect(initProject).toHaveBeenCalledWith("/repo");
    expect(state.initReport).toEqual(initReport);
    expect(state.offers).toEqual(["gitignore", "planner-block"]);
    expect(state.config).toEqual({ found: true });
  });

  it("shows an init error", async () => {
    await useProjectStore.getState().openRepository("/repo");
    initProject.mockResolvedValue({ status: "error", error: "no access" });
    await useProjectStore.getState().initialize();
    expect(useProjectStore.getState().error).toBe("no access");
  });

  it("applies each offer on its own and dismisses the other", async () => {
    await useProjectStore.getState().openRepository("/repo");
    useProjectStore.setState({ offers: ["gitignore", "planner-block"] });
    writePlannerBlock.mockResolvedValue({
      status: "ok",
      data: { written: [] },
    });
    await useProjectStore.getState().accept("planner-block");
    expect(writePlannerBlock).toHaveBeenCalledWith("/repo");
    expect(addImagesToGitignore).not.toHaveBeenCalled();
    expect(useProjectStore.getState().offers).toEqual(["gitignore"]);

    useProjectStore.getState().dismiss("gitignore");
    expect(useProjectStore.getState().offers).toEqual([]);
    expect(addImagesToGitignore).not.toHaveBeenCalled();
  });

  it("keeps an offer whose command failed", async () => {
    await useProjectStore.getState().openRepository("/repo");
    useProjectStore.setState({ offers: ["gitignore"] });
    addImagesToGitignore.mockResolvedValue({
      status: "error",
      error: "read-only",
    });
    await useProjectStore.getState().accept("gitignore");
    expect(useProjectStore.getState().offers).toEqual(["gitignore"]);
    expect(useProjectStore.getState().error).toBe("read-only");
  });

  it("watches only a repository that has a config", async () => {
    await useProjectStore.getState().openRepository("/empty");
    expect(watchProject).not.toHaveBeenCalled();

    loadConfig.mockResolvedValue({ found: true });
    await useProjectStore.getState().openRepository("/repo");
    expect(watchProject).toHaveBeenCalledWith("/repo");
  });

  it("loads the board of a project and clears it otherwise", async () => {
    await useProjectStore.getState().openRepository("/empty");
    expect(clearBoard).toHaveBeenCalled();
    expect(loadBoard).not.toHaveBeenCalled();

    const report = {
      found: true,
      config: { columns: [] },
      missing_columns: [],
    };
    loadConfig.mockResolvedValue(report);
    await useProjectStore.getState().openRepository("/repo");
    expect(loadBoard).toHaveBeenCalledWith("/repo", report.config, []);
    expect(useProjectStore.getState().sources).toEqual(sources);

    loadConfig.mockResolvedValue({ found: false });
    await useProjectStore.getState().openRepository("/empty");
    expect(useProjectStore.getState().sources).toBeNull();
  });

  it("starts watching after init", async () => {
    await useProjectStore.getState().openRepository("/repo");
    initProject.mockResolvedValue({ status: "ok", data: initReport });
    loadConfig.mockResolvedValue({ found: true });
    await useProjectStore.getState().initialize();
    expect(watchProject).toHaveBeenCalledWith("/repo");
  });

  it("counts changes on disk and reloads the config when it changed", async () => {
    loadConfig.mockResolvedValue({ found: true });
    await useProjectStore.getState().openRepository("/repo");
    loadConfig.mockClear();
    watchProject.mockClear();

    const fileChange = {
      batch: {
        changes: [
          { kind: "created" as const, path: "docs/planning/inbox/a.md" },
        ],
        config_changed: false,
      },
      block_written: [],
      block_error: null,
    };
    await useProjectStore.getState().receive(fileChange);
    expect(useProjectStore.getState().revision).toBe(1);
    expect(useProjectStore.getState().lastChange).toEqual(fileChange);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(applyBatch).toHaveBeenCalledWith(fileChange.batch);

    await useProjectStore.getState().receive({
      batch: { changes: [], config_changed: true },
      block_written: ["AGENTS.md"],
      block_error: null,
    });
    expect(useProjectStore.getState().revision).toBe(2);
    expect(loadConfig).toHaveBeenCalledWith("/repo");
    expect(watchProject).toHaveBeenCalledWith("/repo");
  });

  it("shows why the planner block could not be regenerated", async () => {
    await useProjectStore.getState().receive({
      batch: { changes: [], config_changed: true },
      block_written: [],
      block_error: "AGENTS.md: markers out of order",
    });
    expect(useProjectStore.getState().error).toBe(
      "AGENTS.md: markers out of order",
    );
  });
});
