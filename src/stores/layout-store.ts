import { create } from "zustand";
import { PANE_DEFAULT_WIDTH, paneWidthFromSetting } from "@/lib/layout";
import { readSetting, writeSetting } from "./settings";

/** App settings key of the right pane width (`S-window-layout`). */
const PANE_WIDTH_KEY = "paneWidth";
/** A drag writes once it rests this long, not on every pointer move. */
const WRITE_DELAY_MS = 400;

interface LayoutState {
  /** The right pane width in CSS pixels, before clamping to the window. */
  paneWidth: number;
  load: () => Promise<void>;
  setPaneWidth: (width: number) => void;
}

let pendingWrite: ReturnType<typeof setTimeout> | undefined;

/** The right pane width, kept in the app settings, never in a repository. */
export const useLayoutStore = create<LayoutState>()((set) => ({
  paneWidth: PANE_DEFAULT_WIDTH,
  load: async () => {
    try {
      set({
        paneWidth: paneWidthFromSetting(await readSetting(PANE_WIDTH_KEY)),
      });
    } catch {
      // Without readable settings the default width stays.
    }
  },
  setPaneWidth: (paneWidth) => {
    set({ paneWidth });
    clearTimeout(pendingWrite);
    pendingWrite = setTimeout(() => {
      void writeSetting(PANE_WIDTH_KEY, paneWidth).catch(() => {});
    }, WRITE_DELAY_MS);
  },
}));
