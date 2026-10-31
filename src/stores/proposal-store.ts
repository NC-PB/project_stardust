import { create } from "zustand";
import {
  type ChangeBatch,
  type Config,
  commands,
  type ProposalRef,
} from "@/bindings";
import { proposalsTouched } from "@/lib/proposals";
import { useEditorStore } from "@/stores/editor-store";

interface ProposalState {
  repoRoot: string | null;
  config: Config | null;
  /** Every open proposal across the planning root, by path and line (`S-proposals`). */
  proposals: ProposalRef[];
  /** Reads the proposals of the repository at `repoRoot`. */
  load: (repoRoot: string, config: Config) => Promise<void>;
  /** Reads the proposals again when a batch of changes on disk may have changed them. */
  apply: (batch: ChangeBatch) => Promise<void>;
  clear: () => void;
  /** Opens the file of `proposal` in read mode, where it has its actions. */
  open: (repoRoot: string, proposal: ProposalRef) => Promise<void>;
}

/** Counts loads and clears so an older answer never replaces a newer state. */
let sent = 0;

/** The list of open proposals (`S-proposals`), kept current from watcher batches. */
export const useProposalStore = create<ProposalState>()((set, get) => ({
  repoRoot: null,
  config: null,
  proposals: [],

  load: async (repoRoot, config) => {
    sent += 1;
    const mine = sent;
    set({ repoRoot, config });
    const proposals = await commands.listProposals(repoRoot);
    if (mine === sent && get().repoRoot === repoRoot) set({ proposals });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    if (proposalsTouched(batch, config.planning_root))
      await get().load(repoRoot, config);
  },

  clear: () => {
    sent += 1;
    set({ repoRoot: null, config: null, proposals: [] });
  },

  open: async (repoRoot, proposal) => {
    const path = `${repoRoot.replace(/[\\/]+$/, "")}/${proposal.path}`;
    await useEditorStore.getState().open(repoRoot, path);
    const { path: opened, modes } = useEditorStore.getState();
    if (opened === path)
      useEditorStore.setState({ modes: { ...modes, [path]: "read" } });
  },
}));
