import { create } from "zustand";
import {
  type ChangeBatch,
  type Config,
  commands,
  type MissingCodePath,
  type OutsideChange,
} from "@/bindings";
import { touchedColumns } from "@/lib/board";

interface StalenessState {
  repoRoot: string | null;
  config: Config | null;
  /** Code paths in tasks that name nothing in the repository (`S-staleness`). */
  missingPaths: MissingCodePath[];
  /** Checks the code paths of the tasks of the project. */
  load: (repoRoot: string, config: Config) => Promise<void>;
  /** Checks them again after a batch that touched a column. */
  apply: (batch: ChangeBatch) => Promise<void>;
  /** Checks them again after files were added or removed outside the planning root. */
  applyOutside: (change: OutsideChange) => Promise<void>;
  clear: () => void;
}

/** Counts loads and clears so an older answer never replaces a newer state. */
let sent = 0;

/**
 * The part of the staleness flags that needs the disk: missing code paths, checked in Rust.
 * The flags themselves are computed by `stalenessFlags` in `src/lib/staleness.ts`.
 */
export const useStalenessStore = create<StalenessState>()((set, get) => ({
  repoRoot: null,
  config: null,
  missingPaths: [],

  load: async (repoRoot, config) => {
    sent += 1;
    const mine = sent;
    set({ repoRoot, config });
    const missingPaths = await commands.missingCodePaths(repoRoot);
    if (mine === sent && get().repoRoot === repoRoot) set({ missingPaths });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    if (touchedColumns(batch, config.planning_root, config.columns).length > 0)
      await get().load(repoRoot, config);
  },

  applyOutside: async (change) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    if (change.files_added_or_removed) await get().load(repoRoot, config);
  },

  clear: () => {
    sent += 1;
    set({ repoRoot: null, config: null, missingPaths: [] });
  },
}));
