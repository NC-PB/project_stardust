import { create } from "zustand";

interface SessionState {
  /** The project the session brief was hidden for; another project shows it again. */
  hiddenFor: string | null;
  /** The brief was asked for over the open file; opening a file or hiding it ends that. */
  over: boolean;
  /** Hides the session brief of `repoRoot` for this session; nothing is written. */
  hide: (repoRoot: string) => void;
  show: () => void;
  setOver: (over: boolean) => void;
}

/**
 * Whether the session brief (`S-session-panel`) shows in the right pane
 * (`S-window-layout`); kept in the app for this session only.
 */
export const useSessionStore = create<SessionState>()((set) => ({
  hiddenFor: null,
  over: false,
  hide: (repoRoot) => set({ hiddenFor: repoRoot, over: false }),
  show: () => set({ hiddenFor: null }),
  setOver: (over) => set({ over }),
}));
