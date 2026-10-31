import { create } from "zustand";
import { commands } from "@/bindings";
import {
  type CaptureProject,
  captureChoice,
  HOTKEY_SETTING,
  hasCapture,
  hotkeyFromSetting,
} from "@/lib/quick-capture";
import { readSetting, writeSetting } from "./settings";
import {
  LEGACY_REPO_ROOT_SETTING,
  RECENT_SETTING,
  WORKSPACE_SETTING,
} from "./workspace-store";

interface HotkeyState {
  /** The hotkey as set; empty when turned off. */
  hotkey: string;
  /** Why the hotkey is not registered, such as another app holding it; `null` when it is. */
  error: string | null;
  /** Reads the hotkey from the app settings and registers it. */
  load: () => Promise<void>;
  /** Keeps `hotkey` in the app settings and registers it in place of the one before. */
  setHotkey: (hotkey: string) => Promise<void>;
}

/** The quick capture hotkey, set in the Settings menu of the main window (`S-quick-capture`). */
export const useHotkeyStore = create<HotkeyState>()((set) => {
  const register = async (hotkey: string) => {
    const result = await commands.setCaptureHotkey(hotkey);
    set({
      error:
        result.status === "error"
          ? `Quick capture hotkey: ${result.error}`
          : null,
    });
  };

  return {
    hotkey: "",
    error: null,

    load: async () => {
      const hotkey = hotkeyFromSetting(
        await readSetting<unknown>(HOTKEY_SETTING),
      );
      set({ hotkey });
      await register(hotkey);
    },

    setHotkey: async (hotkey) => {
      const value = hotkey.trim();
      set({ hotkey: value });
      await writeSetting(HOTKEY_SETTING, value);
      await register(value);
    },
  };
});

interface CaptureState {
  projects: CaptureProject[];
  /** The project the line goes to. */
  chosen: string | null;
  text: string;
  /** Why the last capture was not written; the text stays. */
  error: string | null;
  /** A capture is being written. */
  saving: boolean;
  /** Reads the projects from the app settings, keeping the chosen one while offered. */
  load: () => Promise<void>;
  choose: (repoRoot: string) => void;
  setText: (text: string) => void;
  /** Appends the text to the chosen project's braindump, then empties it and hides the window. */
  submit: () => Promise<void>;
  /** Hides the window; the text stays for the next time. */
  cancel: () => Promise<void>;
}

/** The capture window's form (`S-quick-capture`). */
export const useCaptureStore = create<CaptureState>()((set, get) => ({
  projects: [],
  chosen: null,
  text: "",
  error: null,
  saving: false,

  load: async () => {
    const choice = captureChoice(
      await readSetting<unknown>(WORKSPACE_SETTING),
      await readSetting<unknown>(RECENT_SETTING),
      await readSetting<unknown>(LEGACY_REPO_ROOT_SETTING),
      get().chosen,
    );
    set({ ...choice, error: null });
  },

  choose: (repoRoot) => set({ chosen: repoRoot, error: null }),

  setText: (text) => set({ text }),

  submit: async () => {
    const { chosen, text, saving } = get();
    if (saving || !hasCapture(text)) return;
    if (chosen === null) {
      set({ error: "Open a project in the app first." });
      return;
    }
    set({ saving: true, error: null });
    const result = await commands.appendToBraindump(chosen, text);
    if (result.status === "error") {
      set({ saving: false, error: result.error });
      return;
    }
    set({ saving: false, text: "" });
    await commands.hideWindow();
  },

  cancel: async () => {
    set({ error: null });
    await commands.hideWindow();
  },
}));
