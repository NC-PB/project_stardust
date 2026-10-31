import { create } from "zustand";
import {
  type Backlink,
  type ChangeBatch,
  type Config,
  commands,
  type LinkCandidate_Serialize,
} from "@/bindings";
import { backlinkPath } from "@/lib/links";
import { proposalsTouched } from "@/lib/proposals";
import { useEditorStore } from "@/stores/editor-store";

interface LinkState {
  repoRoot: string | null;
  config: Config | null;
  /** The files a link can be typed to, from the search index (`S-links`). */
  candidates: LinkCandidate_Serialize[];
  /** The open file the backlinks are for, absolute; `null` when none is open. */
  backlinksOf: string | null;
  /** The files linking to `backlinksOf`, by path relative to the repository root. */
  backlinks: Backlink[];
  /** Reads the candidates of the repository at `repoRoot`, and the backlinks of the open file. */
  load: (repoRoot: string, config: Config) => Promise<void>;
  /**
   * Reads both again after a batch that touched markdown under the planning root, where the
   * watcher sees changes. Call after the editor followed the batch.
   */
  apply: (batch: ChangeBatch) => Promise<void>;
  /** Reads the backlinks of the file open in the editor now. */
  refreshBacklinks: () => Promise<void>;
  clear: () => void;
  /** Opens the file of `backlink` at its first link. */
  open: (backlink: Backlink) => Promise<void>;
}

/** Counts requests so an older answer never replaces a newer one. */
let sentCandidates = 0;
let sentBacklinks = 0;

/** Link autocomplete candidates and the backlinks of the open file (`S-links`). */
export const useLinkStore = create<LinkState>()((set, get) => ({
  repoRoot: null,
  config: null,
  candidates: [],
  backlinksOf: null,
  backlinks: [],

  load: async (repoRoot, config) => {
    set({ repoRoot, config });
    sentCandidates += 1;
    const mine = sentCandidates;
    const [result] = await Promise.all([
      commands.linkCandidates(),
      get().refreshBacklinks(),
    ]);
    if (mine === sentCandidates && get().repoRoot === repoRoot)
      set({ candidates: result.status === "ok" ? result.data : [] });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    // Any markdown file of the planning root may hold or be a link target.
    if (proposalsTouched(batch, config.planning_root))
      await get().load(repoRoot, config);
  },

  refreshBacklinks: async () => {
    sentBacklinks += 1;
    const mine = sentBacklinks;
    const { repoRoot } = get();
    const { path, repoRoot: editorRoot } = useEditorStore.getState();
    if (repoRoot === null || path === null || editorRoot !== repoRoot) {
      set({ backlinksOf: null, backlinks: [] });
      return;
    }
    const backlinks = await commands.backlinks(repoRoot, path);
    if (mine === sentBacklinks) set({ backlinksOf: path, backlinks });
  },

  clear: () => {
    sentCandidates += 1;
    sentBacklinks += 1;
    set({
      repoRoot: null,
      config: null,
      candidates: [],
      backlinksOf: null,
      backlinks: [],
    });
  },

  open: async (backlink) => {
    const { repoRoot } = get();
    if (repoRoot === null) return;
    await useEditorStore
      .getState()
      .open(repoRoot, backlinkPath(repoRoot, backlink), backlink.lines[0]);
  },
}));

// The backlinks follow the open file, whether it was opened, closed or followed a move.
useEditorStore.subscribe((state, previous) => {
  if (state.path !== previous.path)
    void useLinkStore.getState().refreshBacklinks();
});
