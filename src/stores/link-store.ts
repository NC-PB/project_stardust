import { create } from "zustand";
import {
  type Backlink,
  type ChangeBatch,
  type Config,
  commands,
  type LinkCandidate_Serialize,
  type OutsideChange,
} from "@/bindings";
import { backlinkPath, mergeCandidates } from "@/lib/links";
import { proposalsTouched } from "@/lib/proposals";
import { useEditorStore } from "@/stores/editor-store";

interface LinkState {
  repoRoot: string | null;
  config: Config | null;
  /**
   * The files a link can be typed to (`S-links`): `inside` and `outside` merged by
   * `mergeCandidates`.
   */
  candidates: LinkCandidate_Serialize[];
  /** The files under the planning root, from the search index. */
  inside: LinkCandidate_Serialize[];
  /** The markdown files outside the planning root, from a walk of the repository. */
  outside: LinkCandidate_Serialize[];
  /** The open file the backlinks are for, absolute; `null` when none is open. */
  backlinksOf: string | null;
  /** The files linking to `backlinksOf`, by path relative to the repository root. */
  backlinks: Backlink[];
  /** Reads the candidates of the repository at `repoRoot`, and the backlinks of the open file. */
  load: (repoRoot: string, config: Config) => Promise<void>;
  /**
   * Reads the candidates under the planning root and the backlinks again after a batch that
   * touched markdown there. Call after the editor followed the batch.
   */
  apply: (batch: ChangeBatch) => Promise<void>;
  /**
   * Reads the candidates outside the planning root and the backlinks again after the
   * repository watcher saw markdown change there (`S-watcher`).
   */
  applyOutside: (change: OutsideChange) => Promise<void>;
  /** Reads the backlinks of the file open in the editor now. */
  refreshBacklinks: () => Promise<void>;
  clear: () => void;
  /** Opens the file of `backlink` at its first link. */
  open: (backlink: Backlink) => Promise<void>;
}

/** Counts requests so an older answer never replaces a newer one. */
let sentInside = 0;
let sentOutside = 0;
let sentBacklinks = 0;

/** Link autocomplete candidates and the backlinks of the open file (`S-links`). */
export const useLinkStore = create<LinkState>()((set, get) => {
  const setCandidates = (
    part: Partial<Pick<LinkState, "inside" | "outside">>,
  ) =>
    set((state) => {
      const inside = part.inside ?? state.inside;
      const outside = part.outside ?? state.outside;
      return { inside, outside, candidates: mergeCandidates(inside, outside) };
    });
  const loadInside = async (repoRoot: string) => {
    sentInside += 1;
    const mine = sentInside;
    const result = await commands.linkCandidates(repoRoot);
    if (mine === sentInside && get().repoRoot === repoRoot)
      setCandidates({ inside: result.status === "ok" ? result.data : [] });
  };
  const loadOutside = async (repoRoot: string) => {
    sentOutside += 1;
    const mine = sentOutside;
    const outside = await commands.outsideLinkCandidates(repoRoot);
    if (mine === sentOutside && get().repoRoot === repoRoot)
      setCandidates({ outside });
  };

  return {
    repoRoot: null,
    config: null,
    candidates: [],
    inside: [],
    outside: [],
    backlinksOf: null,
    backlinks: [],

    load: async (repoRoot, config) => {
      set({ repoRoot, config });
      await Promise.all([
        loadInside(repoRoot),
        loadOutside(repoRoot),
        get().refreshBacklinks(),
      ]);
    },

    apply: async (batch) => {
      const { repoRoot, config } = get();
      if (repoRoot === null || config === null) return;
      // Any markdown file of the planning root may hold or be a link target.
      if (proposalsTouched(batch, config.planning_root))
        await Promise.all([loadInside(repoRoot), get().refreshBacklinks()]);
    },

    applyOutside: async (change) => {
      const { repoRoot } = get();
      if (repoRoot === null || !change.markdown) return;
      await Promise.all([loadOutside(repoRoot), get().refreshBacklinks()]);
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
      sentInside += 1;
      sentOutside += 1;
      sentBacklinks += 1;
      set({
        repoRoot: null,
        config: null,
        candidates: [],
        inside: [],
        outside: [],
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
  };
});

// The backlinks follow the open file, whether it was opened, closed or followed a move.
useEditorStore.subscribe((state, previous) => {
  if (state.path !== previous.path)
    void useLinkStore.getState().refreshBacklinks();
});
