import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/bindings";

const readSpec = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    readSpec: (...args: unknown[]) => readSpec(...args),
  },
}));

import { useSpecStore } from "./spec-store";

const config = { planning_root: "docs/planning" } as Config;
const batch = (path: string) => ({
  changes: [{ kind: "modified" as const, path }],
  config_changed: false,
});

describe("useSpecStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSpecStore.getState().clear();
    readSpec.mockImplementation(async () => ({ title: "Specification" }));
  });

  it("reads the spec of the project", async () => {
    await useSpecStore.getState().load("/repo", config);
    expect(readSpec).toHaveBeenCalledWith("/repo");
    expect(useSpecStore.getState().spec).toEqual({ title: "Specification" });
  });

  it("reads again only for batches that touch the spec", async () => {
    await useSpecStore.getState().load("/repo", config);
    await useSpecStore.getState().apply(batch("docs/planning/inbox/a.md"));
    expect(readSpec).toHaveBeenCalledTimes(1);
    await useSpecStore.getState().apply(batch("docs/planning/spec.md"));
    expect(readSpec).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a project", async () => {
    await useSpecStore.getState().apply(batch("docs/planning/spec.md"));
    expect(readSpec).not.toHaveBeenCalled();
  });

  it("drops a spec read for a project closed meanwhile", async () => {
    let finish: (value: unknown) => void = () => {};
    readSpec.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const loading = useSpecStore.getState().load("/old", config);
    useSpecStore.getState().clear();
    finish({ title: "Old" });
    await loading;
    expect(useSpecStore.getState().spec).toBeNull();
  });
});
