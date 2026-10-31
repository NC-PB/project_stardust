import { create } from "zustand";
import {
  commands,
  type GitattributesPlan,
  type GitattributesReport,
} from "@/bindings";

interface GitattributesState {
  repoRoot: string | null;
  /** The lines that would be added, shown for confirmation; `null` when nothing is pending. */
  plan: GitattributesPlan | null;
  /** What the last write did, shown until dismissed. */
  report: GitattributesReport | null;
  error: string | null;
  /** Reads which `merge=union` lines `.gitattributes` lacks and shows them (`S-gitattributes`). */
  preview: (repoRoot: string) => Promise<void>;
  /** Appends the previewed lines; refused by Rust when the plan changed since the preview. */
  confirm: () => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

/** Adding `merge=union` lines for the questions and decisions files, after a preview (`S-gitattributes`). */
export const useGitattributesStore = create<GitattributesState>()(
  (set, get) => ({
    repoRoot: null,
    plan: null,
    report: null,
    error: null,

    preview: async (repoRoot) => {
      set({ repoRoot, plan: null, report: null, error: null });
      const plan = await commands.planGitattributes(repoRoot);
      if (get().repoRoot === repoRoot) set({ plan });
    },

    confirm: async () => {
      const { repoRoot, plan } = get();
      if (
        repoRoot === null ||
        plan === null ||
        plan.blockers.length > 0 ||
        plan.missing.length === 0
      )
        return;
      const result = await commands.addGitattributes(repoRoot, plan.missing);
      if (get().repoRoot !== repoRoot) return;
      if (result.status === "error") {
        set({
          plan: null,
          error: `.gitattributes not changed: ${result.error}`,
        });
        return;
      }
      set({ plan: null, report: result.data, error: null });
    },

    cancel: () => set({ plan: null }),

    dismiss: () => set({ report: null, error: null }),
  }),
);
