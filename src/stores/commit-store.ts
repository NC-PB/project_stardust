import { create } from "zustand";
import { commands, type TaskCommits } from "@/bindings";
import { commitsById } from "@/lib/commit-info";

interface CommitState {
  repoRoot: string | null;
  /** Commits mentioning each task id (`S-commit-info`); empty without git. */
  byId: Map<string, TaskCommits>;
  /** Reads the commit info of the project with one `git log` run. */
  load: (repoRoot: string) => Promise<void>;
  /** Reads it again for the open project, if any. */
  refresh: () => Promise<void>;
  /** Reads it again whenever the window gets focus; returns the function that stops. */
  refreshOnFocus: (target?: EventTarget) => () => void;
  clear: () => void;
}

/** Counts loads and clears so an older answer never replaces a newer state. */
let sent = 0;

/**
 * Commit info of the open project. Commits happen outside the planning root, so the watcher
 * never sees them: the info is read when the project opens and when the window gets focus.
 */
export const useCommitStore = create<CommitState>()((set, get) => ({
  repoRoot: null,
  byId: new Map(),

  load: async (repoRoot) => {
    sent += 1;
    const mine = sent;
    set({ repoRoot });
    const info = await commands.commitInfo(repoRoot);
    if (mine === sent && get().repoRoot === repoRoot)
      set({ byId: commitsById(info) });
  },

  refresh: async () => {
    const { repoRoot } = get();
    if (repoRoot !== null) await get().load(repoRoot);
  },

  refreshOnFocus: (target = window) => {
    const onFocus = () => void get().refresh();
    target.addEventListener("focus", onFocus);
    return () => target.removeEventListener("focus", onFocus);
  },

  clear: () => {
    sent += 1;
    set({ repoRoot: null, byId: new Map() });
  },
}));
