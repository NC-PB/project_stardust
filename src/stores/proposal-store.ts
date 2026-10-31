import { create } from "zustand";
import { commands, type ProposalRef } from "@/bindings";
import { useEditorStore } from "@/stores/editor-store";

interface ProposalState {
  /** Every open proposal across the planning root, by path and line (`S-proposals`). */
  proposals: ProposalRef[];
  /** Reads the proposals of the repository at `repoRoot` again. */
  load: (repoRoot: string) => Promise<void>;
  /** Opens the file of `proposal` in read mode, where it has its actions. */
  open: (repoRoot: string, proposal: ProposalRef) => Promise<void>;
}

/** Counts loads so an older answer never replaces a newer one. */
let sent = 0;

/** The list of open proposals (`S-proposals`). */
export const useProposalStore = create<ProposalState>()((set) => ({
  proposals: [],

  load: async (repoRoot) => {
    sent += 1;
    const mine = sent;
    const proposals = await commands.listProposals(repoRoot);
    if (mine === sent) set({ proposals });
  },

  open: async (repoRoot, proposal) => {
    const path = `${repoRoot.replace(/[\\/]+$/, "")}/${proposal.path}`;
    await useEditorStore.getState().open(repoRoot, path);
    const { path: opened, modes } = useEditorStore.getState();
    if (opened === path)
      useEditorStore.setState({ modes: { ...modes, [path]: "read" } });
  },
}));
