import { create } from "zustand";
import { commands } from "@/bindings";
import { readSetting, writeSetting } from "./settings";

/** The app setting holding the terminal: an application name on macOS, a program elsewhere. */
export const TERMINAL_SETTING = "terminal";

interface TerminalState {
  /** Empty for the platform default. */
  terminal: string;
  /** Why the last terminal did not start; `null` after a start. */
  error: string | null;
  load: () => Promise<void>;
  setTerminal: (terminal: string) => Promise<void>;
  /** Starts the terminal in `repoRoot` and nothing else (`S-terminal`). */
  open: (repoRoot: string) => Promise<void>;
  dismiss: () => void;
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  terminal: "",
  error: null,

  load: async () => {
    const stored = await readSetting<unknown>(TERMINAL_SETTING);
    set({ terminal: typeof stored === "string" ? stored : "" });
  },

  setTerminal: async (terminal) => {
    const value = terminal.trim();
    set({ terminal: value });
    await writeSetting(TERMINAL_SETTING, value);
  },

  open: async (repoRoot) => {
    const { terminal } = get();
    const result = await commands.openTerminal(repoRoot, terminal || null);
    set({
      error: result.status === "error" ? `Terminal: ${result.error}` : null,
    });
  },

  dismiss: () => set({ error: null }),
}));
