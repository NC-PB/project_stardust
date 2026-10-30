import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import {
  type ConfigReport_Serialize,
  commands,
  type InitReport,
} from "@/bindings";
import { type Offer, offersOf } from "@/lib/project";
import { readSetting, writeSetting } from "./settings";

const REPO_ROOT_SETTING = "repoRoot";

interface ProjectState {
  repoRoot: string | null;
  config: ConfigReport_Serialize | null;
  /** The result of the last init, shown until another repository is opened. */
  initReport: InitReport | null;
  /** Offers from the last init not yet accepted or dismissed. */
  offers: Offer[];
  error: string | null;
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
  const load = async (repoRoot: string) => {
    set({ config: await commands.loadConfig(repoRoot) });
  };
  const without = (offer: Offer) =>
    get().offers.filter((pending) => pending !== offer);

  return {
    repoRoot: null,
    config: null,
    initReport: null,
    offers: [],
    error: null,

    restore: async () => {
      const repoRoot = await readSetting<string>(REPO_ROOT_SETTING);
      if (repoRoot) await get().openRepository(repoRoot);
    },

    choose: async () => {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") await get().openRepository(picked);
    },

    openRepository: async (repoRoot) => {
      set({
        repoRoot,
        config: null,
        initReport: null,
        offers: [],
        error: null,
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
