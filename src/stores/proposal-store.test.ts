import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/bindings";

const listProposals = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    listProposals: (...args: [string]) => listProposals(...args),
    readText: async () => ({ status: "ok", data: "> **Proposal:** x\n" }),
    saveText: async () => ({ status: "ok", data: { kind: "saved" } }),
    parseTaskText: async (fileName: string) => ({ file_name: fileName }),
  },
}));

import { useEditorStore } from "./editor-store";
import { useProposalStore } from "./proposal-store";

const config = { planning_root: "docs/planning" } as Config;
const proposal = { path: "docs/planning/spec.md", line: 1, text: "x" };

describe("useProposalStore", () => {
  beforeEach(() => {
    listProposals.mockReset();
    useProposalStore.getState().clear();
  });

  it("loads the proposals; a newer load wins over an older one", async () => {
    let first: (value: unknown) => void = () => {};
    listProposals.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    listProposals.mockResolvedValueOnce([proposal]);
    const older = useProposalStore.getState().load("/repo", config);
    await useProposalStore.getState().load("/repo", config);
    first([]);
    await older;
    expect(useProposalStore.getState().proposals).toEqual([proposal]);
  });

  it("reads the proposals again after a batch that may have changed them", async () => {
    listProposals.mockResolvedValue([]);
    await useProposalStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/spec.md" }],
      config_changed: false,
    });
    expect(listProposals).not.toHaveBeenCalled();

    await useProposalStore.getState().load("/repo", config);
    listProposals.mockResolvedValue([proposal]);
    await useProposalStore.getState().apply({
      changes: [{ kind: "modified", path: "src/main.ts" }],
      config_changed: false,
    });
    expect(listProposals).toHaveBeenCalledTimes(1);
    await useProposalStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/spec.md" }],
      config_changed: false,
    });
    expect(listProposals).toHaveBeenCalledTimes(2);
    expect(useProposalStore.getState().proposals).toEqual([proposal]);
  });

  it("drops an answer that arrives after a clear", async () => {
    let answer: (value: unknown) => void = () => {};
    listProposals.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const loading = useProposalStore.getState().load("/repo", config);
    useProposalStore.getState().clear();
    answer([proposal]);
    await loading;
    expect(useProposalStore.getState().proposals).toEqual([]);
  });

  it("opens the file of a proposal in read mode", async () => {
    await useProposalStore.getState().open("/repo/", proposal);
    const { path, modes } = useEditorStore.getState();
    expect(path).toBe("/repo/docs/planning/spec.md");
    expect(modes[path as string]).toBe("read");
  });
});
