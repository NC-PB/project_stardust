import { create } from "zustand";
import { commands } from "@/bindings";

interface AppState {
  version: string | null;
  loadVersion: () => Promise<void>;
}

/** Example store: holds the app version read from Rust through the generated bindings. */
export const useAppStore = create<AppState>()((set) => ({
  version: null,
  loadVersion: async () => {
    set({ version: await commands.appVersion() });
  },
}));
