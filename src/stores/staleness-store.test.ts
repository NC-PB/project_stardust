import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/bindings";

const missingCodePaths = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    missingCodePaths: (...args: [string]) => missingCodePaths(...args),
  },
}));

import { useStalenessStore } from "./staleness-store";

const config = {
  planning_root: "docs/planning",
  columns: ["inbox", "next", "done"],
} as Config;
const missing = {
  column: "next",
  file_name: "a.md",
  path: "src/gone.ts",
  line: 3,
};

describe("useStalenessStore", () => {
  beforeEach(() => {
    missingCodePaths.mockReset();
    useStalenessStore.getState().clear();
  });

  it("loads the missing paths; a newer load wins over an older one", async () => {
    let first: (value: unknown) => void = () => {};
    missingCodePaths.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    missingCodePaths.mockResolvedValueOnce([missing]);
    const older = useStalenessStore.getState().load("/repo", config);
    await useStalenessStore.getState().load("/repo", config);
    first([]);
    await older;
    expect(useStalenessStore.getState().missingPaths).toEqual([missing]);
  });

  it("checks again after files were added or removed outside the planning root", async () => {
    missingCodePaths.mockResolvedValue([missing]);
    await useStalenessStore.getState().load("/repo", config);
    missingCodePaths.mockResolvedValue([]);
    await useStalenessStore
      .getState()
      .applyOutside({ files_added_or_removed: false, markdown: true });
    expect(missingCodePaths).toHaveBeenCalledTimes(1);
    await useStalenessStore
      .getState()
      .applyOutside({ files_added_or_removed: true, markdown: false });
    expect(missingCodePaths).toHaveBeenCalledTimes(2);
    expect(useStalenessStore.getState().missingPaths).toEqual([]);
  });

  it("checks again only after a batch that touched a column", async () => {
    missingCodePaths.mockResolvedValue([]);
    await useStalenessStore.getState().load("/repo", config);
    missingCodePaths.mockResolvedValue([missing]);
    await useStalenessStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/spec.md" }],
      config_changed: false,
    });
    expect(missingCodePaths).toHaveBeenCalledTimes(1);
    await useStalenessStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/next/a.md" }],
      config_changed: false,
    });
    expect(missingCodePaths).toHaveBeenCalledTimes(2);
    expect(useStalenessStore.getState().missingPaths).toEqual([missing]);
  });

  it("drops an answer that arrives after a clear", async () => {
    let answer: (value: unknown) => void = () => {};
    missingCodePaths.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const loading = useStalenessStore.getState().load("/repo", config);
    useStalenessStore.getState().clear();
    answer([missing]);
    await loading;
    expect(useStalenessStore.getState().missingPaths).toEqual([]);
  });
});
