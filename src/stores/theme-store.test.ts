import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const setTheme = vi.fn(async () => {});
const listeners: ((event: { matches: boolean }) => void)[] = [];
let systemDark = false;
const classes = new Set<string>();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));
vi.stubGlobal("window", {
  matchMedia: () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.push(listener),
    removeEventListener: () => {},
  }),
});
vi.stubGlobal("document", {
  documentElement: {
    classList: {
      toggle: (name: string, on: boolean) =>
        on ? classes.add(name) : classes.delete(name),
    },
    style: {},
  },
});

import { useThemeStore } from "./theme-store";

describe("useThemeStore", () => {
  beforeEach(() => {
    settings.clear();
    listeners.length = 0;
    classes.clear();
    setTheme.mockClear();
  });

  it("follows the system until a theme is chosen, and keeps the choice", async () => {
    systemDark = true;
    useThemeStore.getState().start();
    await vi.waitFor(() => expect(setTheme).toHaveBeenCalled());
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(setTheme).toHaveBeenLastCalledWith(null);

    for (const listener of listeners) listener({ matches: false });
    expect(useThemeStore.getState().theme).toBe("light");
    expect(classes.has("dark")).toBe(false);

    await useThemeStore.getState().choose("dark");
    expect(settings.get("theme")).toBe("dark");
    expect(setTheme).toHaveBeenLastCalledWith("dark");
    for (const listener of listeners) listener({ matches: false });
    expect(useThemeStore.getState().theme).toBe("dark");
  });
});
