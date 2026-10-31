import { create } from "zustand";
import { type ChangeBatch, type Config, commands, type Spec } from "@/bindings";
import { specTouched } from "@/lib/spec";

interface SpecState {
  repoRoot: string | null;
  config: Config | null;
  /** The spec of the open project (`S-spec-file`); `null` until read. */
  spec: Spec | null;
  /** Reads the spec of the project. */
  load: (repoRoot: string, config: Config) => Promise<void>;
  /** Reads the spec again when a batch of changes on disk touched it. */
  apply: (batch: ChangeBatch) => Promise<void>;
  clear: () => void;
}

/** The spec of the open project, kept current from watcher batches (`S-watcher`). */
export const useSpecStore = create<SpecState>()((set, get) => ({
  repoRoot: null,
  config: null,
  spec: null,

  load: async (repoRoot, config) => {
    set({ repoRoot, config });
    const spec = await commands.readSpec(repoRoot);
    // A project opened meanwhile wins.
    if (get().repoRoot === repoRoot) set({ spec });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    if (specTouched(batch, config.planning_root))
      await get().load(repoRoot, config);
  },

  clear: () => set({ repoRoot: null, config: null, spec: null }),
}));
