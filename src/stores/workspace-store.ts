import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import {
  commands,
  events,
  type OutsideChange,
  type PlanningChanged_Serialize,
} from "@/bindings";
import {
  closedRecent,
  EMPTY_WORKSPACE,
  neighbourTab,
  recentFromSettings,
  routeOf,
  type Workspace,
  withoutTab,
  withRecent,
  withTab,
  workspaceFromSettings,
} from "@/lib/workspace";
import { useArchiveStore } from "./archive-store";
import { useBoardStore } from "./board-store";
import { useChangelogStore } from "./changelog-store";
import { useCommitStore } from "./commit-store";
import { useDoctorStore } from "./doctor-store";
import { useEditorStore } from "./editor-store";
import { useGateStore } from "./gate-store";
import { useGitattributesStore } from "./gitattributes-store";
import { useLinkStore } from "./link-store";
import { useMenuStore } from "./menu-store";
import { useProjectStore } from "./project-store";
import { useProposalStore } from "./proposal-store";
import { useQuestionsStore } from "./questions-store";
import { useSearchStore } from "./search-store";
import { useSessionStore } from "./session-store";
import { readSetting, writeSetting } from "./settings";
import { useSpecStore } from "./spec-store";
import { useSplitStore } from "./split-store";
import { useStaleViewStore } from "./stale-view-store";
import { useStalenessStore } from "./staleness-store";
import { type Snapshot, snapshots } from "./tab-snapshots";
import { useViewStore } from "./view-store";

/** The open tabs and the shown one, in the app settings (`S-multi-project`). */
export const WORKSPACE_SETTING = "workspace";
/** The recent projects of the start screen, most recent first. */
export const RECENT_SETTING = "recentProjects";
/** The one repository the app remembered before there were tabs; read once to migrate. */
export const LEGACY_REPO_ROOT_SETTING = "repoRoot";

interface ProjectStore {
  getState: () => object;
  getInitialState: () => object;
  setState: (state: object, replace: true) => void;
}

/**
 * The stores holding the state of one project. Their states are swapped as a whole when another
 * tab is shown; the order keeps the questions after the spec, whose change clears them.
 */
const PROJECT_STORES = [
  useProjectStore,
  useBoardStore,
  useSpecStore,
  useQuestionsStore,
  useGateStore,
  useEditorStore,
  useLinkStore,
  useSearchStore,
  useStalenessStore,
  useCommitStore,
  useProposalStore,
  useDoctorStore,
  useStaleViewStore,
  useArchiveStore,
  useChangelogStore,
  useSplitStore,
  useGitattributesStore,
  useViewStore,
  useSessionStore,
] as unknown as ProjectStore[];

const take = (): Snapshot =>
  new Map(PROJECT_STORES.map((store) => [store, store.getState()]));

const put = (snapshot: Snapshot) => {
  for (const store of PROJECT_STORES) {
    const state = snapshot.get(store);
    if (state !== undefined) store.setState(state, true);
  }
};

const fresh = (): Snapshot =>
  new Map(PROJECT_STORES.map((store) => [store, store.getInitialState()]));

/** A change on disk of a tab not shown, applied when the tab is shown again. */
type Pending =
  | { kind: "planning"; change: PlanningChanged_Serialize }
  | { kind: "outside"; change: OutsideChange };

/** Their changes on disk since they were hidden, oldest first. */
const pending = new Map<string, Pending[]>();
/** Tab changes and changes on disk run one after another, so none lands in another tab. */
let chain: Promise<void> = Promise.resolve();

function serial(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work, work);
  return chain;
}

interface WorkspaceState extends Workspace {
  /** Recent projects, most recent first; the start screen lists the ones without a tab. */
  recent: string[];
  /** Why the last tab action did not happen, until the next one. */
  error: string | null;
  /** Opens the tabs kept in the app settings and shows the one shown last. */
  restore: () => Promise<void>;
  /** Lets the user pick a repository folder and opens it in a tab. */
  choose: () => Promise<void>;
  /** Shows the tab of `repoRoot`, opening one when there is none. */
  open: (repoRoot: string) => Promise<void>;
  /** Shows the tab `step` places after (negative: before) the shown one, wrapping around. */
  step: (step: number) => Promise<void>;
  /**
   * Closes the tab of `repoRoot` (the shown one by default) and stops its watchers. Not while
   * its open file has edits that are not saved; that tab is shown instead.
   */
  close: (repoRoot?: string) => Promise<void>;
  /** Opens the most recent project that has no tab. */
  reopenRecent: () => Promise<void>;
  /** Subscribes to changes on disk of every watched project; returns the unsubscribe. */
  listen: () => Promise<UnlistenFn>;
}

/** Whether the tab of `repoRoot` holds its state in the stores or a snapshot. */
const loaded = (repoRoot: string) =>
  snapshots.has(repoRoot) || useProjectStore.getState().repoRoot === repoRoot;

/** Popups belong to the tab they were opened in. */
const closeMenus = () =>
  useMenuStore.setState({
    palette: false,
    settings: false,
    proposals: false,
    projectMenu: false,
    confirmTrash: null,
  });

/**
 * The open projects as tabs (`S-multi-project`). Only the shown tab's state is in the project
 * stores; hidden tabs keep theirs as snapshots and their changes on disk as a queue, both
 * replayed when the tab is shown again.
 */
export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const persist = async () => {
    const { tabs, active, recent } = get();
    await writeSetting(WORKSPACE_SETTING, { tabs, active });
    await writeSetting(RECENT_SETTING, recent);
  };

  /** Saves the shown tab's open file and keeps its stores' states. */
  const hide = async () => {
    const { active } = get();
    if (active === null) return;
    await useEditorStore.getState().save();
    if (useProjectStore.getState().repoRoot === active)
      snapshots.set(active, take());
  };

  /** Puts the stores of `repoRoot` in place: its snapshot and queued changes, or a new load. */
  const show = async (repoRoot: string | null) => {
    closeMenus();
    if (repoRoot === null) {
      put(fresh());
      return;
    }
    const snapshot = snapshots.get(repoRoot);
    snapshots.delete(repoRoot);
    const queued = pending.get(repoRoot) ?? [];
    pending.delete(repoRoot);
    // A tab hidden while its project was still opening missed the end of the open; it opens again.
    const opening = (
      snapshot?.get(useProjectStore) as { opening?: boolean } | undefined
    )?.opening;
    if (snapshot === undefined || opening === true) {
      put(fresh());
      await useProjectStore.getState().openRepository(repoRoot);
      return;
    }
    put(snapshot);
    const project = useProjectStore.getState();
    for (const change of queued)
      await (change.kind === "planning"
        ? project.receive(change.change)
        : project.receiveOutside(change.change));
  };

  /** Shows the tab of `repoRoot`, opening it when needed. */
  const activate = async (repoRoot: string) => {
    if (get().active === repoRoot && loaded(repoRoot)) return;
    await hide();
    set((state) => ({
      ...withTab(state, repoRoot),
      recent: withRecent(state.recent, repoRoot),
      error: null,
    }));
    await persist();
    await show(repoRoot);
  };

  /** Whether the tab's open file has edits that are not saved. */
  const unsaved = (repoRoot: string): boolean => {
    if (get().active === repoRoot) {
      const { text, saved, path } = useEditorStore.getState();
      return path !== null && text !== saved;
    }
    const snapshot = snapshots.get(repoRoot);
    if (snapshot === undefined) return false;
    const editor = snapshot.get(useEditorStore) as {
      text: string;
      saved: string;
      path: string | null;
    };
    return editor.path !== null && editor.text !== editor.saved;
  };

  const dispatch = async (repoRoot: string, change: Pending) => {
    const route = routeOf(repoRoot, get().active, loaded);
    if (route === "queued")
      pending.set(repoRoot, [...(pending.get(repoRoot) ?? []), change]);
    else if (route === "active") {
      const project = useProjectStore.getState();
      await (change.kind === "planning"
        ? project.receive(change.change)
        : project.receiveOutside(change.change));
    }
  };

  return {
    ...EMPTY_WORKSPACE,
    recent: [],
    error: null,

    restore: () =>
      serial(async () => {
        const workspace = workspaceFromSettings(
          await readSetting(WORKSPACE_SETTING),
          await readSetting(LEGACY_REPO_ROOT_SETTING),
        );
        const recent = recentFromSettings(
          await readSetting(RECENT_SETTING),
          workspace,
        );
        set({ ...workspace, recent, error: null });
        if (workspace.active !== null) await show(workspace.active);
      }),

    choose: async () => {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") await get().open(picked);
    },

    open: (repoRoot) => serial(() => activate(repoRoot)),

    step: (step) =>
      serial(async () => {
        const next = neighbourTab(get(), step);
        if (next !== null && next !== get().active) await activate(next);
      }),

    close: (repoRoot) =>
      serial(async () => {
        const closing = repoRoot ?? get().active;
        if (closing === null || !get().tabs.includes(closing)) return;
        const shown = get().active === closing;
        if (shown) await useEditorStore.getState().save();
        if (unsaved(closing)) {
          if (!shown) await activate(closing);
          set({
            error:
              "The open file has edits that are not saved; save or discard them before closing the tab.",
          });
          return;
        }
        snapshots.delete(closing);
        pending.delete(closing);
        await commands.unwatchProject(closing);
        const workspace = withoutTab(get(), closing);
        set({ ...workspace, error: null });
        await persist();
        if (shown) await show(workspace.active);
      }),

    reopenRecent: async () => {
      const [latest] = closedRecent(get().recent, get().tabs);
      if (latest !== undefined) await get().open(latest);
    },

    listen: async () => {
      const stops = await Promise.all([
        events.planningChanged.listen((event) => {
          const change = event.payload;
          void serial(() =>
            dispatch(change.repo_root, { kind: "planning", change }),
          );
        }),
        events.repositoryChanged.listen((event) => {
          const { repo_root, change } = event.payload;
          void serial(() => dispatch(repo_root, { kind: "outside", change }));
        }),
      ]);
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
});
