import { create } from "zustand";
import { commands, type GateStatus_Serialize } from "@/bindings";
import { useSpecStore } from "./spec-store";

interface GateState {
  /** The gate of the open project's spec (`S-gate`); `null` without a spec. */
  status: GateStatus_Serialize | null;
  /** Evaluates the gate again for the spec in `useSpecStore`. */
  refresh: () => Promise<void>;
}

/** Counts evaluations so an older answer never replaces a newer one. */
let sent = 0;

/** The gate status, evaluated in Rust whenever the spec store holds a new spec. */
export const useGateStore = create<GateState>()((set) => ({
  status: null,

  refresh: async () => {
    sent += 1;
    const mine = sent;
    const { repoRoot, spec } = useSpecStore.getState();
    if (repoRoot === null || spec === null) {
      set({ status: null });
      return;
    }
    const status = await commands.gateStatus(repoRoot);
    if (mine === sent) set({ status });
  },
}));

// The status follows every (re)read of the spec, including those after a config change, and
// starts from a spec read before this module was first imported.
useSpecStore.subscribe((state, previous) => {
  if (state.spec !== previous.spec) void useGateStore.getState().refresh();
});
void useGateStore.getState().refresh();
