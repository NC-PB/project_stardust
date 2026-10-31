import { create } from "zustand";
import {
  commands,
  type DoctorFix,
  type DoctorReport_Serialize,
} from "@/bindings";
import { fixResult } from "@/lib/doctor";
import { settleInTab } from "./tab-snapshots";

interface DoctorState {
  repoRoot: string | null;
  /** The last check, shown until closed; `null` when the panel is closed. */
  report: DoctorReport_Serialize | null;
  /** Whether a check is running. */
  checking: boolean;
  /** The fix waiting for confirmation; nothing is fixed before `confirm`. */
  pending: DoctorFix | null;
  /** What the last fix did, or why it was refused. */
  notice: string | null;
  error: string | null;
  /** Checks the planning files of `repoRoot` (`S-doctor`). */
  check: (repoRoot: string) => Promise<void>;
  /** Asks for confirmation of `fix`. */
  propose: (fix: DoctorFix) => void;
  /** Applies the pending fix, then checks again. */
  confirm: () => Promise<void>;
  cancel: () => void;
  close: () => void;
}

/**
 * Runs the check of `repoRoot` and writes its report into that tab's state, shown or hidden;
 * nothing when the tab no longer holds this check.
 */
async function runCheck(repoRoot: string): Promise<void> {
  if (!settleInTab(useDoctorStore, repoRoot, { checking: true })) return;
  const report = await commands.doctor(repoRoot);
  settleInTab(useDoctorStore, repoRoot, { report, checking: false });
}

/** The doctor's findings and their fixes, applied only after confirmation (`S-doctor`). */
export const useDoctorStore = create<DoctorState>()((set, get) => ({
  repoRoot: null,
  report: null,
  checking: false,
  pending: null,
  notice: null,
  error: null,

  check: async (repoRoot) => {
    if (get().repoRoot !== repoRoot)
      set({ report: null, pending: null, notice: null, error: null });
    set({ repoRoot });
    await runCheck(repoRoot);
  },

  propose: (fix) => set({ pending: fix, notice: null, error: null }),

  confirm: async () => {
    const { repoRoot, pending } = get();
    if (repoRoot === null || pending === null) return;
    set({ pending: null });
    const result = await commands.applyDoctorFix(repoRoot, pending);
    const landed = settleInTab(
      useDoctorStore,
      repoRoot,
      result.status === "error"
        ? { error: `Not fixed: ${result.error}` }
        : { notice: fixResult(result.data), error: null },
    );
    if (landed) await runCheck(repoRoot);
  },

  cancel: () => set({ pending: null }),

  close: () => set({ report: null, pending: null, notice: null, error: null }),
}));
