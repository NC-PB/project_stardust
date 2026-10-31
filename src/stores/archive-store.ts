import { create } from "zustand";
import { type ArchivePlan, type ArchiveReport, commands } from "@/bindings";
import { settleInTab } from "./tab-snapshots";

interface ArchiveState {
  repoRoot: string | null;
  /** The tasks that would move, shown for confirmation; `null` when nothing is pending. */
  plan: ArchivePlan | null;
  /** What the last archive did, shown until dismissed. */
  report: ArchiveReport | null;
  error: string | null;
  /** Reads which finished tasks would move into month folders and shows them (`S-archive`). */
  preview: (repoRoot: string) => Promise<void>;
  /** Moves the previewed tasks; refused by Rust when the plan changed since the preview. */
  confirm: () => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

/** Archiving finished tasks by month, after a preview (`S-archive`). */
export const useArchiveStore = create<ArchiveState>()((set, get) => ({
  repoRoot: null,
  plan: null,
  report: null,
  error: null,

  preview: async (repoRoot) => {
    set({ repoRoot, plan: null, report: null, error: null });
    const plan = await commands.planArchive(repoRoot);
    settleInTab(useArchiveStore, repoRoot, { plan });
  },

  confirm: async () => {
    const { repoRoot, plan } = get();
    if (
      repoRoot === null ||
      plan === null ||
      plan.blockers.length > 0 ||
      plan.moves.length === 0
    )
      return;
    const result = await commands.archiveTasks(
      repoRoot,
      plan.moves.map((move) => move.file_name),
    );
    settleInTab(
      useArchiveStore,
      repoRoot,
      result.status === "error"
        ? { plan: null, error: `Nothing archived: ${result.error}` }
        : { plan: null, report: result.data, error: null },
    );
  },

  cancel: () => set({ plan: null }),

  dismiss: () => set({ report: null, error: null }),
}));
