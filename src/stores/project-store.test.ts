import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const pick = vi.fn<() => Promise<string | null>>();
const loadConfig = vi.fn();
const initProject = vi.fn();
const addImagesToGitignore = vi.fn();
const writePlannerBlock = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    loadConfig: (...args: unknown[]) => loadConfig(...args),
    initProject: (...args: unknown[]) => initProject(...args),
    addImagesToGitignore: (...args: unknown[]) => addImagesToGitignore(...args),
    writePlannerBlock: (...args: unknown[]) => writePlannerBlock(...args),
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
    useProjectStore.setState({
      repoRoot: null,
      config: null,
      initReport: null,
      offers: [],
      error: null,
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
});
