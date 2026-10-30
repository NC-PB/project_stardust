import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/bindings", () => ({
  commands: { appVersion: vi.fn(async () => "1.2.3") },
}));

import { useAppStore } from "./app-store";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({ version: null });
  });

  it("starts without a version", () => {
    expect(useAppStore.getState().version).toBeNull();
  });

  it("loads the version through the generated bindings", async () => {
    await useAppStore.getState().loadVersion();
    expect(useAppStore.getState().version).toBe("1.2.3");
  });
});
