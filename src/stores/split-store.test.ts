import { beforeEach, describe, expect, it, vi } from "vitest";

const planSpecSplit = vi.fn();
const splitSpec = vi.fn();
const sourceFiles = vi.fn();
const save = vi.fn();
const editor = { conflict: null as unknown, save };
const project = {
  repoRoot: "/repo" as string | null,
  sources: null as unknown,
};

vi.mock("@/bindings", () => ({
  commands: {
    planSpecSplit: (...args: unknown[]) => planSpecSplit(...args),
    splitSpec: (...args: unknown[]) => splitSpec(...args),
    sourceFiles: (...args: unknown[]) => sourceFiles(...args),
  },
}));
vi.mock("./editor-store", () => ({
  useEditorStore: { getState: () => editor },
}));
vi.mock("./project-store", () => ({
  useProjectStore: {
    getState: () => project,
    setState: (patch: object) => Object.assign(project, patch),
  },
}));

import { useSplitStore } from "./split-store";

const plan = (blockers: string[] = []) => ({
  location: "docs/planning/spec.md",
  blockers,
  files: [
    { file: "spec/README.md", lines: 3, bytes: 20, first_line: "# Spec" },
  ],
  links: [],
});

describe("useSplitStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    editor.conflict = null;
    project.sources = null;
    useSplitStore.setState({
      repoRoot: null,
      plan: null,
      report: null,
      error: null,
    });
  });

  it("previews, saves the open file, splits and refreshes the sources", async () => {
    planSpecSplit.mockResolvedValue(plan());
    const report = {
      created: ["spec/README.md"],
      rewritten: [],
      trashed: "spec.md",
      block_written: [],
      block_error: null,
    };
    splitSpec.mockResolvedValue({ status: "ok", data: report });
    sourceFiles.mockResolvedValue({ braindump: null, spec: null });

    await useSplitStore.getState().preview("/repo");
    expect(useSplitStore.getState().plan).toEqual(plan());
    expect(splitSpec).not.toHaveBeenCalled();

    await useSplitStore.getState().confirm();
    expect(save).toHaveBeenCalled();
    expect(splitSpec).toHaveBeenCalledWith("/repo");
    expect(useSplitStore.getState().plan).toBeNull();
    expect(useSplitStore.getState().report).toEqual(report);
    expect(project.sources).toEqual({ braindump: null, spec: null });
  });

  it("does not split while the preview has blockers", async () => {
    planSpecSplit.mockResolvedValue(plan(["spec/ exists already"]));
    await useSplitStore.getState().preview("/repo");
    await useSplitStore.getState().confirm();
    expect(splitSpec).not.toHaveBeenCalled();
  });

  it("refuses while the editor has a conflict", async () => {
    planSpecSplit.mockResolvedValue(plan());
    editor.conflict = { kind: "changed" };
    await useSplitStore.getState().preview("/repo");
    await useSplitStore.getState().confirm();
    expect(splitSpec).not.toHaveBeenCalled();
    expect(useSplitStore.getState().error).toMatch(/Resolve/);
  });

  it("keeps why the split failed", async () => {
    planSpecSplit.mockResolvedValue(plan());
    splitSpec.mockResolvedValue({ status: "error", error: "spec.md changed" });
    await useSplitStore.getState().preview("/repo");
    await useSplitStore.getState().confirm();
    expect(useSplitStore.getState().error).toBe(
      "Spec not split: spec.md changed",
    );
    expect(useSplitStore.getState().plan).toBeNull();
  });
});
