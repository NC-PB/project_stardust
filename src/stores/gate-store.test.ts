import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/bindings";

const readSpec = vi.fn();
const gateStatus = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    readSpec: (...args: unknown[]) => readSpec(...args),
    gateStatus: (...args: unknown[]) => gateStatus(...args),
  },
}));

import { useGateStore } from "./gate-store";
import { useSpecStore } from "./spec-store";

const config = { planning_root: "docs/planning" } as Config;
const closed = {
  met: false,
  failures: [
    {
      kind: "node_not_ticked",
      id: "S-a",
      message: "Not ticked: A S-a",
      at: { file: "spec.md", line: 3 },
    },
  ],
};

describe("useGateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSpecStore.getState().clear();
    readSpec.mockImplementation(async () => ({ title: "Specification" }));
    gateStatus.mockImplementation(async () => closed);
  });

  it("evaluates the gate whenever the spec is read", async () => {
    await useSpecStore.getState().load("/repo", config);
    await vi.waitFor(() =>
      expect(useGateStore.getState().status).toEqual(closed),
    );
    expect(gateStatus).toHaveBeenCalledWith("/repo");

    gateStatus.mockImplementation(async () => ({ met: true, failures: [] }));
    await useSpecStore.getState().apply({
      changes: [{ kind: "modified", path: "docs/planning/spec.md" }],
      config_changed: false,
    });
    await vi.waitFor(() =>
      expect(useGateStore.getState().status?.met).toBe(true),
    );
  });

  it("has no status once the project is closed", async () => {
    await useSpecStore.getState().load("/repo", config);
    await vi.waitFor(() =>
      expect(useGateStore.getState().status).not.toBeNull(),
    );
    useSpecStore.getState().clear();
    await vi.waitFor(() => expect(useGateStore.getState().status).toBeNull());
  });

  it("drops an answer for a spec replaced meanwhile", async () => {
    let finish: (value: unknown) => void = () => {};
    gateStatus.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    await useSpecStore.getState().load("/repo", config);
    useSpecStore.getState().clear();
    finish(closed);
    await Promise.resolve();
    expect(useGateStore.getState().status).toBeNull();
  });
});
