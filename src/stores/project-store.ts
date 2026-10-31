import { create } from "zustand";
import {
  type ConfigReport_Serialize,
  commands,
  type InitReport,
  type LinkRepair,
  type MoveLinks,
  type OutsideChange,
  type PlanningChanged_Serialize,
  type SourceFiles,
} from "@/bindings";
import {
  hasLinkNotice,
  hasRepairNotice,
  type Offer,
  offersOf,
} from "@/lib/project";
import { useBoardStore } from "./board-store";
import { useCommitStore } from "./commit-store";
import { useEditorStore } from "./editor-store";
import { useLinkStore } from "./link-store";
import { useProposalStore } from "./proposal-store";
import { useSearchStore } from "./search-store";
import { useSpecStore } from "./spec-store";
import { useStalenessStore } from "./staleness-store";

interface ProjectState {
  repoRoot: string | null;
  config: ConfigReport_Serialize | null;
  /** The result of the last init, shown until another repository is opened. */
  initReport: InitReport | null;
  /** Offers from the last init not yet accepted or dismissed. */
  offers: Offer[];
  error: string | null;
  /** The braindump and spec file, which open in the editor from the project bar. */
  sources: SourceFiles | null;
  /** The last burst of changes on disk (`S-watcher`). */
  lastChange: PlanningChanged_Serialize | null;
  /** Counts bursts of changes, so views can reload when it grows. */
  revision: number;
  /**
   * The last links rewritten after files moved, or the problems doing so (`S-links`). Kept
   * until dismissed or another repository opens, since the rewrites bring a batch of their own.
   */
  links: MoveLinks | null;
  /**
   * The last links repaired by id, when the project was watched or after a batch, or the
   * problems doing so (`S-links`). Shown and dismissed with `links`.
   */
  repair: LinkRepair | null;
  /**
   * Why the repository watcher could not start when the project was opened, if it could not
   * (`S-watcher`). The planning watcher runs anyway. Kept until the project is opened again.
   */
  repositoryWatchError: string | null;
  /**
   * Whether `watch_project` is running for the open repository (`S-watcher`): the repair by
   * id, the search index and the watchers are not done yet, so the board is not loaded.
   */
  opening: boolean;
  /** Dismisses the link notice: `links` and `repair`. */
  dismissLinks: () => void;
  /** Applies a burst of changes on disk of this project; the workspace routes it here. */
  receive: (change: PlanningChanged_Serialize) => Promise<void>;
  /** Passes a change outside the planning root to the views that read the disk for it. */
  receiveOutside: (change: OutsideChange) => Promise<void>;
  /**
   * Loads the repository into the stores and watches it. The workspace store calls it for a
   * tab shown for the first time; it does not remember the repository itself.
   */
  openRepository: (repoRoot: string) => Promise<void>;
  initialize: () => Promise<void>;
  accept: (offer: Offer) => Promise<void>;
  dismiss: (offer: Offer) => void;
}

/**
 * The repository of the shown tab (`S-init`, `S-multi-project`). The workspace store keeps the
 * open repositories in the app settings and swaps this store's state between tabs.
 */
export const useProjectStore = create<ProjectState>()((set, get) => {
  /** Counts calls of `watch_project`; only the latest may end `opening`. */
  let watches = 0;
  /** Loads the config and, once the project exists, (re)starts the watcher and the board. */
  const load = async (repoRoot: string) => {
    const config = await commands.loadConfig(repoRoot);
    set({ config });
    if (!config.found) {
      // An open of another repository still running no longer counts.
      watches++;
      set({ sources: null, repositoryWatchError: null, opening: false });
      useBoardStore.getState().clear();
      useSpecStore.getState().clear();
      useProposalStore.getState().clear();
      useLinkStore.getState().clear();
      useStalenessStore.getState().clear();
      useCommitStore.getState().clear();
      return;
    }
    set({ sources: await commands.sourceFiles(repoRoot) });
    // Runs off the main thread and can take a while on a large repository (`S-watcher`).
    const watch = ++watches;
    set({ opening: true });
    const watched = await commands.watchProject(repoRoot).finally(() => {
      if (watch === watches) set({ opening: false });
    });
    // Another repository was opened meanwhile; its own load fills the stores.
    if (get().repoRoot !== repoRoot) return;
    if (watched.status === "error") set({ error: watched.error });
    else {
      set({
        repositoryWatchError: watched.data.repository_watch_error ?? null,
      });
      if (hasRepairNotice(watched.data.repair))
        set({ repair: watched.data.repair });
    }
    await Promise.all([
      useBoardStore
        .getState()
        .load(repoRoot, config.config, config.missing_columns),
      useSpecStore.getState().load(repoRoot, config.config),
      useProposalStore.getState().load(repoRoot, config.config),
      useLinkStore.getState().load(repoRoot, config.config),
      useStalenessStore.getState().load(repoRoot, config.config),
      useCommitStore.getState().load(repoRoot),
    ]);
  };
  const without = (offer: Offer) =>
    get().offers.filter((pending) => pending !== offer);

  return {
    repoRoot: null,
    config: null,
    initReport: null,
    offers: [],
    error: null,
    sources: null,
    lastChange: null,
    revision: 0,
    links: null,
    repair: null,
    repositoryWatchError: null,
    opening: false,

    receiveOutside: async (change) => {
      await Promise.all([
        useStalenessStore.getState().applyOutside(change),
        useLinkStore.getState().applyOutside(change),
      ]);
    },

    receive: async (change) => {
      set((state) => ({
        lastChange: change,
        revision: state.revision + 1,
        error: change.block_error,
        links: hasLinkNotice(change.links) ? change.links : state.links,
        repair: hasRepairNotice(change.repair) ? change.repair : state.repair,
      }));
      const { repoRoot } = get();
      // The planning root may have moved, so the watcher restarts with the new config.
      await useEditorStore.getState().apply(change.batch);
      // The index took the batch before it was sent, so the results can follow at once.
      void useSearchStore.getState().refresh();
      if (change.batch.config_changed && repoRoot !== null)
        await load(repoRoot);
      else
        await Promise.all([
          useBoardStore.getState().apply(change.batch),
          useSpecStore.getState().apply(change.batch),
          useProposalStore.getState().apply(change.batch),
          useLinkStore.getState().apply(change.batch),
          useStalenessStore.getState().apply(change.batch),
        ]);
    },

    dismissLinks: () => set({ links: null, repair: null }),

    openRepository: async (repoRoot) => {
      await useEditorStore.getState().close();
      useSearchStore.getState().reset(repoRoot);
      set({
        repoRoot,
        config: null,
        initReport: null,
        offers: [],
        error: null,
        sources: null,
        lastChange: null,
        links: null,
        repair: null,
        repositoryWatchError: null,
      });
      await load(repoRoot);
    },

    initialize: async () => {
      const { repoRoot } = get();
      if (repoRoot === null) return;
      const result = await commands.initProject(repoRoot);
      if (result.status === "error") {
        set({ error: result.error });
        return;
      }
      set({
        initReport: result.data,
        offers: offersOf(result.data),
        error: null,
      });
      await load(repoRoot);
    },

    accept: async (offer) => {
      const { repoRoot } = get();
      if (repoRoot === null) return;
      const result =
        offer === "gitignore"
          ? await commands.addImagesToGitignore(repoRoot)
          : await commands.writePlannerBlock(repoRoot);
      if (result.status === "error") {
        set({ error: result.error });
        return;
      }
      set({ offers: without(offer), error: null });
    },

    dismiss: (offer) => {
      set({ offers: without(offer) });
    },
  };
});
