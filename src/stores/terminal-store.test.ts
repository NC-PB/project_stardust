import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const openTerminal = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    openTerminal: (...args: unknown[]) => openTerminal(...args),
  },
}));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));

import { TERMINAL_SETTING, useTerminalStore } from "./terminal-store";

describe("useTerminalStore", () => {
  beforeEach(() => {
    settings.clear();
    openTerminal.mockReset();
    useTerminalStore.setState({ terminal: "", error: null });
  });

  it("opens the platform default until a terminal is set", async () => {
    openTerminal.mockResolvedValue({ status: "ok", data: "open" });
    await useTerminalStore.getState().load();
    await useTerminalStore.getState().open("/repo");
    expect(openTerminal).toHaveBeenLastCalledWith("/repo", null);

    await useTerminalStore.getState().setTerminal(" iTerm ");
    expect(settings.get(TERMINAL_SETTING)).toBe("iTerm");
    await useTerminalStore.getState().open("/repo");
    expect(openTerminal).toHaveBeenLastCalledWith("/repo", "iTerm");
    expect(useTerminalStore.getState().error).toBeNull();
  });

  it("reads the stored terminal and ignores values that are not text", async () => {
    settings.set(TERMINAL_SETTING, "kitty");
    await useTerminalStore.getState().load();
    expect(useTerminalStore.getState().terminal).toBe("kitty");
    settings.set(TERMINAL_SETTING, 3);
    await useTerminalStore.getState().load();
    expect(useTerminalStore.getState().terminal).toBe("");
  });

  it("keeps why the terminal did not start", async () => {
    openTerminal.mockResolvedValue({
      status: "error",
      error: "no terminal found",
    });
    await useTerminalStore.getState().open("/repo");
    expect(useTerminalStore.getState().error).toBe(
      "Terminal: no terminal found",
    );
  });
});
