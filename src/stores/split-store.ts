import { create } from "zustand";
import {
  commands,
  type SplitPlan_Serialize,
  type SplitReport_Serialize,
} from "@/bindings";
import { useEditorStore } from "./editor-store";
import { useProjectStore } from "./project-store";

interface SplitState {
  repoRoot: string | null;
  /** What the split would do, shown for confirmation; `null` when no split is pending. */
  plan: SplitPlan_Serialize | null;
  /** What the last split did, shown until dismissed. */
  report: SplitReport_Serialize | null;
  error: string | null;
  /** Reads what a split of the spec into `spec/` would do and shows it (`S-spec-split`). */
  preview: (repoRoot: string) => Promise<void>;
  /**
   * Splits the spec as previewed. The open file is saved first, since the split rewrites
   * links in markdown files of the repository; refused while it has a conflict.
   */
  confirm: () => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

/** Splitting `spec.md` into the `spec/` folder, after a preview (`S-spec-split`). */
export const useSplitStore = create<SplitState>()((set, get) => ({
  repoRoot: null,
  plan: null,
  report: null,
  error: null,

  preview: async (repoRoot) => {
    set({ repoRoot, plan: null, report: null, error: null });
    const plan = await commands.planSpecSplit(repoRoot);
    if (get().repoRoot === repoRoot) set({ plan });
  },

  confirm: async () => {
    const { repoRoot, plan } = get();
    if (repoRoot === null || plan === null || plan.blockers.length > 0) return;
    const editor = useEditorStore.getState();
    if (editor.conflict !== null) {
      set({
        error: "Resolve the change on disk in the editor before splitting",
      });
      return;
    }
    await editor.save();
    const result = await commands.splitSpec(repoRoot);
    if (get().repoRoot !== repoRoot) return;
    if (result.status === "error") {
      set({ plan: null, error: `Spec not split: ${result.error}` });
      return;
    }
    set({ plan: null, report: result.data, error: null });
    // The single spec file is gone, so the project bar no longer offers it.
    const sources = await commands.sourceFiles(repoRoot);
    if (useProjectStore.getState().repoRoot === repoRoot)
      useProjectStore.setState({ sources });
  },

  cancel: () => set({ plan: null }),

  dismiss: () => set({ report: null, error: null }),
}));
