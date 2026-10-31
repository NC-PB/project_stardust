import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./session-store";

describe("useSessionStore", () => {
  beforeEach(() => useSessionStore.getState().show());

  it("hides the panel for one project only", () => {
    useSessionStore.getState().hide("/repo");
    expect(useSessionStore.getState().hiddenFor).toBe("/repo");
    useSessionStore.getState().show();
    expect(useSessionStore.getState().hiddenFor).toBeNull();
  });
});
