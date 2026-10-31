import { beforeEach, describe, expect, it, vi } from "vitest";

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

const proposal = { path: "docs/planning/spec.md", line: 1, text: "x" };

describe("useProposalStore", () => {
  beforeEach(() => {
    listProposals.mockReset();
    useProposalStore.setState({ proposals: [] });
  });

  it("loads the proposals; a newer load wins over an older one", async () => {
    let first: (value: unknown) => void = () => {};
    listProposals.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    listProposals.mockResolvedValueOnce([proposal]);
    const older = useProposalStore.getState().load("/repo");
    await useProposalStore.getState().load("/repo");
    first([]);
    await older;
    expect(useProposalStore.getState().proposals).toEqual([proposal]);
  });

  it("opens the file of a proposal in read mode", async () => {
    await useProposalStore.getState().open("/repo/", proposal);
    const { path, modes } = useEditorStore.getState();
    expect(path).toBe("/repo/docs/planning/spec.md");
    expect(modes[path as string]).toBe("read");
  });
});
