import { create } from "zustand";

interface MenuState {
  /** The command palette is open (`S-palette`). */
  palette: boolean;
  /** The Settings menu in the header is open. */
  settings: boolean;
  /** The list of open proposals in the header is shown (`S-proposals`). */
  proposals: boolean;
  /** Counts requests to put the focus into the search box; the box follows when it grows. */
  searchFocus: number;
  /** The file the editor asks about before moving it to the trash (`S-trash`), if any. */
  confirmTrash: string | null;
  setPalette: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  setProposals: (shown: boolean) => void;
  focusSearch: () => void;
  setConfirmTrash: (path: string | null) => void;
}

/**
 * What of the header's popups and the editor's delete question is open, for the session only, so commands (`S-palette`) can
 * open them as their buttons do.
 */
export const useMenuStore = create<MenuState>()((set) => ({
  palette: false,
  settings: false,
  proposals: false,
  searchFocus: 0,
  confirmTrash: null,
  setPalette: (palette) => set({ palette }),
  setSettings: (settings) => set({ settings }),
  setProposals: (proposals) => set({ proposals }),
  focusSearch: () => set((state) => ({ searchFocus: state.searchFocus + 1 })),
  setConfirmTrash: (confirmTrash) => set({ confirmTrash }),
}));
