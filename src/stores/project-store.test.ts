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
const loadProposals = vi.fn();
const applyProposals = vi.fn();
const loadLinks = vi.fn();
const applyLinks = vi.fn();
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
vi.mock("./spec-store", () => ({
  useSpecStore: {
    getState: () => ({
      load: async () => {},
      apply: async () => {},
      clear: () => {},
    }),
  },
}));
vi.mock("./proposal-store", () => ({
  useProposalStore: {
    getState: () => ({
      load: loadProposals,
      apply: applyProposals,
      clear: () => {},
    }),
  },
}));
vi.mock("./link-store", () => ({
  useLinkStore: {
    getState: () => ({
      load: loadLinks,
      apply: applyLinks,
      clear: () => {},
    }),
  },
}));
vi.mock("./staleness-store", () => ({
  useStalenessStore: {
    getState: () => ({
      load: async () => {},
      apply: async () => {},
      clear: () => {},
    }),
  },
}));
vi.mock("./commit-store", () => ({
  useCommitStore: {
    getState: () => ({
      load: async () => {},
      clear: () => {},
    }),
  },
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

const NO_LINKS = { rewritten: [], problems: [] };
const NO_REPAIR = { repaired: [], unresolved: [], problems: [] };

describe("useProjectStore", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
    loadConfig.mockResolvedValue({ found: false });
    watchProject.mockResolvedValue({ status: "ok", data: NO_REPAIR });
    useProjectStore.setState({
      repoRoot: null,
      config: null,
      initReport: null,
      offers: [],
      error: null,
      lastChange: null,
      revision: 0,
      links: null,
      repair: null,
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
    expect(loadProposals).toHaveBeenCalledWith("/repo", report.config);
    expect(loadLinks).toHaveBeenCalledWith("/repo", report.config);
    expect(useProjectStore.getState().sources).toEqual(sources);

    loadConfig.mockResolvedValue({ found: false });
    await useProjectStore.getState().openRepository("/empty");
    expect(useProjectStore.getState().sources).toBeNull();
  });

  it("drops an open that another open overtook while it was watched", async () => {
    loadConfig.mockResolvedValue({
      found: true,
      config: {},
      missing_columns: [],
    });
    let finishFirst: (value: unknown) => void = () => {};
    watchProject.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
    );
    const first = useProjectStore.getState().openRepository("/slow");
    await vi.waitFor(() => expect(watchProject).toHaveBeenCalledWith("/slow"));
    await useProjectStore.getState().openRepository("/repo");
    loadBoard.mockClear();
    finishFirst({ status: "error", error: "superseded" });
    await first;
    expect(useProjectStore.getState().repoRoot).toBe("/repo");
    expect(useProjectStore.getState().error).toBeNull();
    expect(loadBoard).not.toHaveBeenCalled();
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
      links: NO_LINKS,
      repair: NO_REPAIR,
    };
    await useProjectStore.getState().receive(fileChange);
    expect(useProjectStore.getState().revision).toBe(1);
    expect(useProjectStore.getState().lastChange).toEqual(fileChange);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(applyBatch).toHaveBeenCalledWith(fileChange.batch);
    expect(applyProposals).toHaveBeenCalledWith(fileChange.batch);
    expect(applyLinks).toHaveBeenCalledWith(fileChange.batch);

    await useProjectStore.getState().receive({
      batch: { changes: [], config_changed: true },
      block_written: ["AGENTS.md"],
      block_error: null,
      links: NO_LINKS,
      repair: NO_REPAIR,
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
      links: NO_LINKS,
      repair: NO_REPAIR,
    });
    expect(useProjectStore.getState().error).toBe(
      "AGENTS.md: markers out of order",
    );
  });

  it("keeps the last rewritten links until dismissed", async () => {
    const links = {
      rewritten: [
        {
          file: "docs/planning/next/b.md",
          changes: [{ line: 1, old: "a.md", new: "../done/a.md" }],
        },
      ],
      problems: [],
    };
    await useProjectStore.getState().receive({
      batch: {
        changes: [{ kind: "moved", id: "x", from: "a", to: "b" }],
        config_changed: false,
      },
      block_written: [],
      block_error: null,
      links,
      repair: NO_REPAIR,
    });
    expect(useProjectStore.getState().links).toEqual(links);

    // The rewrites come back as a batch of their own, which does not hide them.
    await useProjectStore.getState().receive({
      batch: {
        changes: [{ kind: "modified", path: "docs/planning/next/b.md" }],
        config_changed: false,
      },
      block_written: [],
      block_error: null,
      links: NO_LINKS,
      repair: NO_REPAIR,
    });
    expect(useProjectStore.getState().links).toEqual(links);

    useProjectStore.getState().dismissLinks();
    expect(useProjectStore.getState().links).toBeNull();
  });

  it("shows the links repaired by id when the project is watched and after a batch", async () => {
    const atOpen = {
      repaired: [
        {
          file: "README.md",
          changes: [
            {
              line: 2,
              old: "docs/planning/next/a.md",
              new: "docs/planning/done/a.md",
            },
          ],
        },
      ],
      unresolved: [],
      problems: [],
    };
    loadConfig.mockResolvedValue({ found: true });
    watchProject.mockResolvedValue({ status: "ok", data: atOpen });
    await useProjectStore.getState().openRepository("/repo");
    expect(useProjectStore.getState().repair).toEqual(atOpen);

    const afterBatch = { ...atOpen, problems: ["b.md changed"] };
    await useProjectStore.getState().receive({
      batch: {
        changes: [{ kind: "created", path: "docs/planning/done/a.md" }],
        config_changed: false,
      },
      block_written: [],
      block_error: null,
      links: NO_LINKS,
      repair: afterBatch,
    });
    expect(useProjectStore.getState().repair).toEqual(afterBatch);

    // The repaired files come back as a batch of their own, which does not hide the notice.
    await useProjectStore.getState().receive({
      batch: {
        changes: [{ kind: "modified", path: "README.md" }],
        config_changed: false,
      },
      block_written: [],
      block_error: null,
      links: NO_LINKS,
      repair: NO_REPAIR,
    });
    expect(useProjectStore.getState().repair).toEqual(afterBatch);

    useProjectStore.getState().dismissLinks();
    expect(useProjectStore.getState().repair).toBeNull();
  });
});
