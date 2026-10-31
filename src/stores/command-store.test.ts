import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config, ConfigReport_Serialize, Spec } from "@/bindings";
import { COMMANDS } from "@/lib/commands";

vi.mock("@/bindings", () => ({
  commands: new Proxy(
    {},
    { get: () => async () => ({ status: "ok", data: null }) },
  ),
  events: {
    planningChanged: { listen: vi.fn() },
    repositoryChanged: { listen: vi.fn() },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: async () => {} }),
}));
vi.mock("./settings", () => ({
  readSetting: async () => undefined,
  writeSetting: async () => {},
}));

const { commandContext, handleShortcut, RUN_IDS, runCommand } = await import(
  "./command-store"
);
const { useBoardStore } = await import("./board-store");
const { useDoctorStore } = await import("./doctor-store");
const { useEditorStore } = await import("./editor-store");
const { useMenuStore } = await import("./menu-store");
const { useProjectStore } = await import("./project-store");
const { usePromptStore } = await import("./prompt-store");
const { useSessionStore } = await import("./session-store");
const { useSpecStore } = await import("./spec-store");
const { useViewStore } = await import("./view-store");

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
  terminal: "done",
} as Config;
const task = "/repo/docs/planning/next/20261031-000000-abcd-a.md";

function openProject() {
  useProjectStore.setState({
    repoRoot: "/repo",
    config: { found: true, config } as unknown as ConfigReport_Serialize,
    initReport: null,
    sources: {
      braindump: "/repo/docs/planning/braindump.md",
      spec: "/repo/docs/planning/spec.md",
    },
  });
  useBoardStore.setState({ repoRoot: "/repo", config });
  useSpecStore.setState({
    repoRoot: "/repo",
    config,
    spec: { found: true, structure: [] } as unknown as Spec,
  });
}

describe("the command store", () => {
  beforeEach(() => {
    useProjectStore.setState({ repoRoot: null, config: null, sources: null });
    useBoardStore.setState({ repoRoot: null, config: null });
    useSpecStore.setState({ repoRoot: null, config: null, spec: null });
    useEditorStore.setState({
      path: null,
      text: "",
      selection: "",
      modes: {},
      proposalUndo: null,
    });
    useViewStore.setState({ view: "board", questions: false });
    useMenuStore.setState({ palette: false, confirmTrash: null });
    useSessionStore.setState({ hiddenFor: null });
  });

  it("has a run function for exactly the registered commands", () => {
    expect([...RUN_IDS].sort()).toEqual(
      COMMANDS.map((command) => command.id).sort(),
    );
  });

  it("reads the context from the stores", () => {
    expect(commandContext()).toMatchObject({
      repository: false,
      projectBar: false,
      file: null,
      sessionHidden: null,
    });
    openProject();
    useEditorStore.setState({
      path: task,
      text: "after",
      selection: "x",
      modes: { [task]: "read" },
      proposalUndo: { before: "before", after: "after" },
    });
    useSessionStore.setState({ hiddenFor: "/repo" });
    expect(commandContext()).toMatchObject({
      repository: true,
      needsInit: false,
      projectBar: true,
      braindump: true,
      specFile: true,
      board: true,
      specFound: true,
      sessionHidden: true,
      file: {
        mode: "read",
        selection: true,
        task: true,
        prompts: ["work-on-task", "verify-task", "handoff"],
        proposalUndo: true,
      },
    });
  });

  it("runs commands on the stores", () => {
    openProject();
    const check = vi.fn(async () => {});
    useDoctorStore.setState({ check });
    runCommand("project.doctor");
    expect(check).toHaveBeenCalledWith("/repo");

    runCommand("spec.questions");
    expect(useViewStore.getState()).toMatchObject({
      view: "spec",
      questions: true,
    });

    runCommand("session.hide");
    expect(useSessionStore.getState().hiddenFor).toBe("/repo");

    useEditorStore.setState({ path: task });
    runCommand("editor.delete");
    expect(useMenuStore.getState().confirmTrash).toBe(task);
  });

  it("copies a prompt with the open task as its input", () => {
    openProject();
    useEditorStore.setState({ path: task });
    const copy = vi.fn(async () => {});
    usePromptStore.setState({ copy });
    runCommand("prompt.verify-task");
    expect(copy).toHaveBeenCalledWith("/repo", "verify-task", {
      task_path: "docs/planning/next/20261031-000000-abcd-a.md",
      node_id: null,
    });
    runCommand("prompt.generate-tasks");
    expect(copy).toHaveBeenLastCalledWith("/repo", "generate-tasks", {
      task_path: null,
      node_id: null,
    });
  });

  it("runs the shortcut of an available command and keeps the key from others", () => {
    const preventDefault = vi.fn();
    const key = (name: string) => ({
      key: name,
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      target: null,
      preventDefault,
    });
    expect(handleShortcut(key("s"), true)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(handleShortcut(key("k"), true)).toBe(true);
    expect(useMenuStore.getState().palette).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

/** The source files of the app outside tests, by path relative to `src/`. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    ),
  ).map(([path, text]) => [path.replace(/^\/src\//, ""), text]),
);

describe("shortcuts outside the registry", () => {
  it("are not possible: only the command palette listens for window keys", () => {
    expect(Object.keys(SOURCES)).toContain("App.tsx");
    const listening = Object.entries(SOURCES)
      .filter(([, text]) =>
        /addEventListener\(\s*["']key(down|up|press)["']|\b(matchesShortcut|commandForKey)\(/.test(
          text,
        ),
      )
      .map(([path]) => path)
      .sort();
    // `lib/` defines the matchers; the palette installs the one window handler.
    expect(listening).toEqual([
      "components/command-palette.tsx",
      "lib/commands.ts",
      "lib/palette.ts",
      "stores/command-store.ts",
    ]);
  });
});
