import { create } from "zustand";
import { type ChangeBatch, type Config, commands } from "@/bindings";
import { type BoardColumn, columnDir, touchedColumns } from "@/lib/board";
import { readSetting, writeSetting } from "./settings";

/** Last visit per repository root, in milliseconds since the epoch. */
const LAST_VISITS_SETTING = "lastVisits";

type Visits = Record<string, number>;

interface BoardState {
  repoRoot: string | null;
  config: Config | null;
  /** The columns listed in `columns`, in config order (`S-board-columns`). */
  columns: BoardColumn[];
  /** The previous visit of this project; files changed after it are new. */
  since: number | null;
  /** Cards must carry every one of these tags (`S-board-filter`); kept for this session only. */
  tagFilter: string[];
  /** Reads every column of the project and records this visit. */
  load: (repoRoot: string, config: Config, missing: string[]) => Promise<void>;
  /** Re-reads the columns a batch of changes on disk touched. */
  apply: (batch: ChangeBatch) => Promise<void>;
  /** Adds `tag` to the filter, or removes it when selected. */
  toggleTag: (tag: string) => void;
  clearTagFilter: () => void;
  clear: () => void;
}

async function readBoardColumn(
  repoRoot: string,
  config: Config,
  name: string,
): Promise<BoardColumn> {
  const result = await commands.readColumn(
    columnDir(repoRoot, config.planning_root, name),
  );
  return result.status === "ok"
    ? { name, tasks: result.data, missing: false, error: null }
    : { name, tasks: [], missing: false, error: result.error };
}

/** Records now as the last visit of `repoRoot`; returns the visit before. */
async function recordVisit(repoRoot: string): Promise<number | null> {
  const visits = (await readSetting<Visits>(LAST_VISITS_SETTING)) ?? {};
  const previous = visits[repoRoot] ?? null;
  await writeSetting(LAST_VISITS_SETTING, {
    ...visits,
    [repoRoot]: Date.now(),
  });
  return previous;
}

/** The board of the open project, kept current from watcher batches (`S-watcher`). */
export const useBoardStore = create<BoardState>()((set, get) => ({
  repoRoot: null,
  config: null,
  columns: [],
  since: null,
  tagFilter: [],

  load: async (repoRoot, config, missing) => {
    const sameProject = get().repoRoot === repoRoot;
    set(
      sameProject
        ? { config }
        : { repoRoot, config, columns: [], since: null, tagFilter: [] },
    );
    const since = sameProject ? get().since : await recordVisit(repoRoot);
    const columns = await Promise.all(
      config.columns.map((name) =>
        missing.includes(name)
          ? { name, tasks: [], missing: true, error: null }
          : readBoardColumn(repoRoot, config, name),
      ),
    );
    if (get().repoRoot !== repoRoot) return;
    set({ columns, since });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    const names = touchedColumns(batch, config.planning_root, config.columns);
    if (names.length === 0) return;
    const read = await Promise.all(
      names.map((name) => readBoardColumn(repoRoot, config, name)),
    );
    // Seen while open: these changes are not new at the next visit.
    await recordVisit(repoRoot);
    if (get().repoRoot !== repoRoot) return;
    set((state) => ({
      columns: state.columns.map(
        (column) => read.find((fresh) => fresh.name === column.name) ?? column,
      ),
    }));
  },

  toggleTag: (tag) =>
    set((state) => ({
      tagFilter: state.tagFilter.includes(tag)
        ? state.tagFilter.filter((selected) => selected !== tag)
        : [...state.tagFilter, tag],
    })),

  clearTagFilter: () => set({ tagFilter: [] }),

  clear: () =>
    set({
      repoRoot: null,
      config: null,
      columns: [],
      since: null,
      tagFilter: [],
    }),
}));
