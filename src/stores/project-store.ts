import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import {
  type ConfigReport_Serialize,
  commands,
  events,
  type InitReport,
  type PlanningChanged_Serialize,
  type SourceFiles,
} from "@/bindings";
import { type Offer, offersOf } from "@/lib/project";
import { useBoardStore } from "./board-store";
import { useEditorStore } from "./editor-store";
import { useSearchStore } from "./search-store";
import { readSetting, writeSetting } from "./settings";
import { useSpecStore } from "./spec-store";

const REPO_ROOT_SETTING = "repoRoot";

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
  /** Subscribes to changes on disk; returns the function that unsubscribes. */
  listen: () => Promise<UnlistenFn>;
  receive: (change: PlanningChanged_Serialize) => Promise<void>;
  /** Opens the repository remembered in the app settings, if any. */
  restore: () => Promise<void>;
  /** Lets the user pick a repository folder and opens it. */
  choose: () => Promise<void>;
  openRepository: (repoRoot: string) => Promise<void>;
  initialize: () => Promise<void>;
  accept: (offer: Offer) => Promise<void>;
  dismiss: (offer: Offer) => void;
}

/** The repository the app works on (`S-init`), remembered in app settings. */
export const useProjectStore = create<ProjectState>()((set, get) => {
  /** Loads the config and, once the project exists, (re)starts the watcher and the board. */
  const load = async (repoRoot: string) => {
    const config = await commands.loadConfig(repoRoot);
    set({ config });
    if (!config.found) {
      set({ sources: null });
      useBoardStore.getState().clear();
      useSpecStore.getState().clear();
      return;
    }
    set({ sources: await commands.sourceFiles(repoRoot) });
    const watched = await commands.watchProject(repoRoot);
    if (watched.status === "error") set({ error: watched.error });
    await Promise.all([
      useBoardStore
        .getState()
        .load(repoRoot, config.config, config.missing_columns),
      useSpecStore.getState().load(repoRoot, config.config),
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

    listen: () =>
      events.planningChanged.listen((event) => get().receive(event.payload)),

    receive: async (change) => {
      set((state) => ({
        lastChange: change,
        revision: state.revision + 1,
        error: change.block_error,
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
        ]);
    },

    restore: async () => {
      const repoRoot = await readSetting<string>(REPO_ROOT_SETTING);
      if (repoRoot) await get().openRepository(repoRoot);
    },

    choose: async () => {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") await get().openRepository(picked);
    },

    openRepository: async (repoRoot) => {
      await useEditorStore.getState().close();
      useSearchStore.getState().clear();
      set({
        repoRoot,
        config: null,
        initReport: null,
        offers: [],
        error: null,
        sources: null,
        lastChange: null,
      });
      await writeSetting(REPO_ROOT_SETTING, repoRoot);
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
