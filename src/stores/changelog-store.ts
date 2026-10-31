import { create } from "zustand";
import {
  type ChangelogDraft_Serialize as ChangelogDraft,
  commands,
  type TagList_Serialize as TagList,
} from "@/bindings";
import {
  entriesLabel,
  entryCount,
  type SinceMode,
  sinceOf,
} from "@/lib/changelog";
import { settleInTab } from "./tab-snapshots";

interface ChangelogState {
  repoRoot: string | null;
  /** Whether the changelog form is shown. */
  open: boolean;
  /** The tags the changelog can start from; `null` while they are read. */
  tags: TagList | null;
  mode: SinceMode;
  date: string;
  tag: string;
  /** What writing would do, shown for confirmation; `null` when no draft is pending. */
  draft: ChangelogDraft | null;
  /** What the last write did, shown until dismissed. */
  written: string | null;
  error: string | null;
  /** Shows the form for `repoRoot` and reads its tags (`S-changelog`). */
  start: (repoRoot: string) => Promise<void>;
  setMode: (mode: SinceMode) => void;
  setDate: (date: string) => void;
  setTag: (tag: string) => void;
  /** Builds the draft for the current inputs and shows it. Writes nothing. */
  preview: () => Promise<void>;
  /** Writes the previewed draft, only over the text the preview read. */
  confirm: () => Promise<void>;
  /** Drops the draft and closes the form. */
  cancel: () => void;
  dismiss: () => void;
}

/** Drafting `CHANGELOG.md` entries from finished tasks, after a preview (`S-changelog`). */
export const useChangelogStore = create<ChangelogState>()((set, get) => ({
  repoRoot: null,
  open: false,
  tags: null,
  mode: "date",
  date: "",
  tag: "",
  draft: null,
  written: null,
  error: null,

  start: async (repoRoot) => {
    const sameRepo = get().repoRoot === repoRoot;
    set({
      repoRoot,
      open: true,
      tags: null,
      draft: null,
      written: null,
      error: null,
      ...(sameRepo ? {} : { date: "", tag: "" }),
    });
    const tags = await commands.changelogTags(repoRoot);
    const newest = tags.tags[0]?.name;
    settleInTab(
      useChangelogStore,
      repoRoot,
      (state): Partial<ChangelogState> =>
        newest !== undefined && (!sameRepo || state.tag === "")
          ? // The newest tag is the usual start of the next release's entries.
            { tags, mode: "tag", tag: newest }
          : { tags, ...(tags.available ? {} : { mode: "date" }) },
    );
  },

  setMode: (mode) => set({ mode, draft: null }),
  setDate: (date) => set({ date, draft: null }),
  setTag: (tag) => set({ tag, draft: null }),

  preview: async () => {
    const { repoRoot, mode, date, tag } = get();
    const since = sinceOf(mode, date, tag);
    if (repoRoot === null) return;
    if (since === null) {
      set({
        error: mode === "date" ? "Choose a date" : "Choose a tag",
        draft: null,
      });
      return;
    }
    set({ draft: null, written: null, error: null });
    const result = await commands.draftChangelog(repoRoot, since);
    settleInTab(
      useChangelogStore,
      repoRoot,
      result.status === "error"
        ? { error: result.error }
        : { draft: result.data },
    );
  },

  confirm: async () => {
    const { repoRoot, draft } = get();
    if (repoRoot === null || draft === null || draft.section === "") return;
    const result = await commands.writeChangelog(
      repoRoot,
      draft.existing,
      draft.text,
    );
    if (result.status === "error") {
      settleInTab(useChangelogStore, repoRoot, {
        draft: null,
        error: `Changelog not written: ${result.error}`,
      });
      return;
    }
    const count = entriesLabel(entryCount(draft.groups));
    settleInTab(useChangelogStore, repoRoot, {
      draft: null,
      open: false,
      error: null,
      written: `${count} added to ${draft.path}`,
    });
  },

  cancel: () => set({ draft: null, open: false, error: null }),

  dismiss: () => set({ written: null, error: null }),
}));
