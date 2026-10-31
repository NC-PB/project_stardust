import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const setCaptureHotkey = vi.fn();
const appendToBraindump = vi.fn();
const hideWindow = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    setCaptureHotkey: (...args: unknown[]) => setCaptureHotkey(...args),
    appendToBraindump: (...args: unknown[]) => appendToBraindump(...args),
    hideWindow: (...args: unknown[]) => hideWindow(...args),
  },
}));
vi.mock("./settings", () => ({
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));
vi.mock("./workspace-store", () => ({
  WORKSPACE_SETTING: "workspace",
  RECENT_SETTING: "recentProjects",
  LEGACY_REPO_ROOT_SETTING: "repoRoot",
}));

import { DEFAULT_HOTKEY, HOTKEY_SETTING } from "@/lib/quick-capture";
import { useCaptureStore, useHotkeyStore } from "./quick-capture-store";

describe("useHotkeyStore", () => {
  beforeEach(() => {
    settings.clear();
    setCaptureHotkey.mockReset();
    useHotkeyStore.setState({ hotkey: "", error: null });
  });

  it("registers the default hotkey until one is set", async () => {
    setCaptureHotkey.mockResolvedValue({ status: "ok", data: "x" });
    await useHotkeyStore.getState().load();
    expect(setCaptureHotkey).toHaveBeenLastCalledWith(DEFAULT_HOTKEY);
    expect(useHotkeyStore.getState().hotkey).toBe(DEFAULT_HOTKEY);

    await useHotkeyStore.getState().setHotkey(" Alt+KeyN ");
    expect(settings.get(HOTKEY_SETTING)).toBe("Alt+KeyN");
    expect(setCaptureHotkey).toHaveBeenLastCalledWith("Alt+KeyN");
    expect(useHotkeyStore.getState().error).toBeNull();
  });

  it("keeps why a hotkey could not be registered, until one is", async () => {
    setCaptureHotkey.mockResolvedValue({
      status: "error",
      error: "Alt+KeyN could not be registered: HotKey already registered",
    });
    await useHotkeyStore.getState().setHotkey("Alt+KeyN");
    expect(useHotkeyStore.getState().error).toBe(
      "Quick capture hotkey: Alt+KeyN could not be registered: HotKey already registered",
    );
    setCaptureHotkey.mockResolvedValue({ status: "ok", data: "" });
    await useHotkeyStore.getState().setHotkey("");
    expect(useHotkeyStore.getState().error).toBeNull();
    expect(settings.get(HOTKEY_SETTING)).toBe("");
  });
});

describe("useCaptureStore", () => {
  beforeEach(() => {
    settings.clear();
    appendToBraindump.mockReset();
    hideWindow.mockReset();
    hideWindow.mockResolvedValue({ status: "ok", data: null });
    useCaptureStore.setState(useCaptureStore.getInitialState(), true);
    settings.set("workspace", { tabs: ["/a/one", "/b/two"], active: "/b/two" });
  });

  it("appends to the chosen project, then empties the text and hides", async () => {
    appendToBraindump.mockResolvedValue({ status: "ok", data: "/a/one/b.md" });
    await useCaptureStore.getState().load();
    expect(useCaptureStore.getState().chosen).toBe("/b/two");
    useCaptureStore.getState().choose("/a/one");
    useCaptureStore.getState().setText("an idea");
    await useCaptureStore.getState().submit();
    expect(appendToBraindump).toHaveBeenCalledWith("/a/one", "an idea");
    expect(useCaptureStore.getState().text).toBe("");
    expect(hideWindow).toHaveBeenCalledTimes(1);

    // The choice stays for the next capture.
    await useCaptureStore.getState().load();
    expect(useCaptureStore.getState().chosen).toBe("/a/one");
  });

  it("keeps the text and shows why a capture failed", async () => {
    appendToBraindump.mockResolvedValue({
      status: "error",
      error: "no braindump at docs/planning/braindump.md",
    });
    await useCaptureStore.getState().load();
    useCaptureStore.getState().setText("an idea");
    await useCaptureStore.getState().submit();
    expect(useCaptureStore.getState().text).toBe("an idea");
    expect(useCaptureStore.getState().error).toBe(
      "no braindump at docs/planning/braindump.md",
    );
    expect(hideWindow).not.toHaveBeenCalled();
  });

  it("writes nothing for empty text or without a project", async () => {
    await useCaptureStore.getState().load();
    useCaptureStore.getState().setText("  ");
    await useCaptureStore.getState().submit();
    expect(appendToBraindump).not.toHaveBeenCalled();

    settings.clear();
    await useCaptureStore.getState().load();
    useCaptureStore.getState().setText("idea");
    await useCaptureStore.getState().submit();
    expect(appendToBraindump).not.toHaveBeenCalled();
    expect(useCaptureStore.getState().error).toBe(
      "Open a project in the app first.",
    );
  });

  it("hides on cancel and keeps the text", async () => {
    useCaptureStore.getState().setText("half");
    await useCaptureStore.getState().cancel();
    expect(hideWindow).toHaveBeenCalledTimes(1);
    expect(useCaptureStore.getState().text).toBe("half");
  });
});
