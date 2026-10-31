import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeBatch, Config } from "@/bindings";

const linkCandidates = vi.fn();
const backlinks = vi.fn();
const readText = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    linkCandidates: () => linkCandidates(),
    backlinks: (...args: unknown[]) => backlinks(...args),
    readText: (...args: unknown[]) => readText(...args),
    parseTaskText: async () => null,
    saveText: async () => ({ status: "ok", data: { kind: "saved" } }),
    checkAppendOnly: async () => [],
  },
}));

import { useEditorStore } from "./editor-store";
import { useLinkStore } from "./link-store";

const config = { planning_root: "docs/planning" } as Config;
const candidate = {
  path: "docs/planning/spec.md",
  title: "Specification",
  id: null,
};
const backlink = {
  file: "docs/planning/inbox/a.md",
  title: "A",
  lines: [4, 9],
};

function batch(path: string): ChangeBatch {
  return { changes: [{ kind: "modified", path }], config_changed: false };
}

describe("useLinkStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useLinkStore.getState().clear();
    await useEditorStore.getState().close();
    linkCandidates.mockResolvedValue({ status: "ok", data: [candidate] });
    backlinks.mockResolvedValue([backlink]);
    readText.mockResolvedValue({ status: "ok", data: "# Spec\n" });
  });

  it("loads the candidates, and backlinks once a file is open", async () => {
    await useLinkStore.getState().load("/repo", config);
    expect(useLinkStore.getState().candidates).toEqual([candidate]);
    expect(backlinks).not.toHaveBeenCalled();
    expect(useLinkStore.getState().backlinksOf).toBeNull();

    await useEditorStore
      .getState()
      .open("/repo", "/repo/docs/planning/spec.md");
    await vi.waitFor(() =>
      expect(useLinkStore.getState().backlinks).toEqual([backlink]),
    );
    expect(backlinks).toHaveBeenCalledWith(
      "/repo",
      "/repo/docs/planning/spec.md",
    );
    expect(useLinkStore.getState().backlinksOf).toBe(
      "/repo/docs/planning/spec.md",
    );
  });

  it("forgets the backlinks when the file closes", async () => {
    await useLinkStore.getState().load("/repo", config);
    await useEditorStore
      .getState()
      .open("/repo", "/repo/docs/planning/spec.md");
    await vi.waitFor(() =>
      expect(useLinkStore.getState().backlinks).toHaveLength(1),
    );
    await useEditorStore.getState().close();
    await vi.waitFor(() =>
      expect(useLinkStore.getState().backlinksOf).toBeNull(),
    );
    expect(useLinkStore.getState().backlinks).toEqual([]);
  });

  it("reads both again after batches touching planning markdown", async () => {
    await useLinkStore.getState().load("/repo", config);
    linkCandidates.mockClear();
    await useLinkStore.getState().apply(batch("src/main.rs"));
    expect(linkCandidates).not.toHaveBeenCalled();
    await useLinkStore.getState().apply(batch("docs/planning/inbox/b.md"));
    expect(linkCandidates).toHaveBeenCalledTimes(1);
  });

  it("opens a backlink at its first link", async () => {
    await useLinkStore.getState().load("/repo", config);
    await useLinkStore.getState().open(backlink);
    expect(readText).toHaveBeenCalledWith("/repo/docs/planning/inbox/a.md");
    expect(useEditorStore.getState().path).toBe(
      "/repo/docs/planning/inbox/a.md",
    );
    expect(useEditorStore.getState().reveal).toBe(4);
  });
});
