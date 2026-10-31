import { create } from "zustand";

interface SessionState {
  /** The project the session panel was hidden for; another project shows it again. */
  hiddenFor: string | null;
  /** Hides the session panel of `repoRoot` for this session; nothing is written. */
  hide: (repoRoot: string) => void;
  show: () => void;
}

/** Whether the session panel (`S-session-panel`) shows; kept in the app for this session only. */
export const useSessionStore = create<SessionState>()((set) => ({
  hiddenFor: null,
  hide: (repoRoot) => set({ hiddenFor: repoRoot }),
  show: () => set({ hiddenFor: null }),
}));
