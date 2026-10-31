import { create } from "zustand";
import {
  type ArchivedTask_Serialize,
  type ChangeBatch,
  type Config,
  commands,
} from "@/bindings";
import {
  type BoardColumn,
  columnDir,
  moveCard,
  touchedColumns,
} from "@/lib/board";
import { useEditorStore } from "./editor-store";
import { readSetting, writeSetting } from "./settings";

/** Last visit per repository root, in milliseconds since the epoch. */
const LAST_VISITS_SETTING = "lastVisits";

type Visits = Record<string, number>;

interface BoardState {
  repoRoot: string | null;
  config: Config | null;
  /** The columns listed in `columns`, in config order (`S-board-columns`). */
  columns: BoardColumn[];
  /**
   * The tasks in the month folders of the terminal column (`S-archive`), for trace and the session
   * panel only; never shown as cards or counted (D-20261031-030552-k3qa). Empty when they cannot be read.
   */
  archived: ArchivedTask_Serialize[];
  /** The previous visit of this project; files changed after it are new. */
  since: number | null;
  /** Cards must carry every one of these tags (`S-board-filter`); kept for this session only. */
  tagFilter: string[];
  /** Why the last move failed (`S-board-dnd`); `null` after a successful move. */
  moveError: string | null;
  /** Reads every column of the project and records this visit. */
  load: (repoRoot: string, config: Config, missing: string[]) => Promise<void>;
  /** Re-reads the columns a batch of changes on disk touched. */
  apply: (batch: ChangeBatch) => Promise<void>;
  /**
   * Moves the task file `fileName` from column `from` to column `to`. The card moves at once
   * and goes back when the move fails, with `moveError` saying why.
   */
  moveTask: (fileName: string, from: string, to: string) => Promise<void>;
  dismissMoveError: () => void;
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

/** The archived tasks of the terminal column; none when the folder cannot be read. */
async function readArchived(
  repoRoot: string,
  config: Config,
): Promise<ArchivedTask_Serialize[]> {
  const result = await commands.readArchive(
    columnDir(repoRoot, config.planning_root, config.terminal),
  );
  return result.status === "ok" ? result.data : [];
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
  archived: [],
  since: null,
  tagFilter: [],
  moveError: null,

  load: async (repoRoot, config, missing) => {
    const sameProject = get().repoRoot === repoRoot;
    set(
      sameProject
        ? { config }
        : {
            repoRoot,
            config,
            columns: [],
            archived: [],
            since: null,
            tagFilter: [],
            moveError: null,
          },
    );
    const since = sameProject ? get().since : await recordVisit(repoRoot);
    const terminalMissing =
      missing.includes(config.terminal) ||
      !config.columns.includes(config.terminal);
    const [columns, archived] = await Promise.all([
      Promise.all(
        config.columns.map((name) =>
          missing.includes(name)
            ? { name, tasks: [], missing: true, error: null }
            : readBoardColumn(repoRoot, config, name),
        ),
      ),
      terminalMissing ? [] : readArchived(repoRoot, config),
    ]);
    if (get().repoRoot !== repoRoot) return;
    set({ columns, archived, since });
  },

  apply: async (batch) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null) return;
    const names = touchedColumns(batch, config.planning_root, config.columns);
    if (names.length === 0) return;
    // The archive lives in the terminal column folder, so its changes touch that column.
    const [read, archived] = await Promise.all([
      Promise.all(names.map((name) => readBoardColumn(repoRoot, config, name))),
      names.includes(config.terminal) ? readArchived(repoRoot, config) : null,
    ]);
    // Seen while open: these changes are not new at the next visit.
    await recordVisit(repoRoot);
    if (get().repoRoot !== repoRoot) return;
    set((state) => ({
      columns: state.columns.map(
        (column) => read.find((fresh) => fresh.name === column.name) ?? column,
      ),
      archived: archived ?? state.archived,
    }));
  },

  moveTask: async (fileName, from, to) => {
    const { repoRoot, config } = get();
    if (repoRoot === null || config === null || from === to) return;
    set((state) => ({
      columns: moveCard(state.columns, fileName, from, to),
      moveError: null,
    }));
    // Pending edits of the moved file are written first, so they cannot meet the `completed`
    // change on disk (`S-conflicts`).
    const editor = useEditorStore.getState();
    if (
      editor.path ===
      `${columnDir(repoRoot, config.planning_root, from)}/${fileName}`
    )
      await editor.save();
    const result = await commands.moveTask(repoRoot, fileName, from, to);
    if (result.status === "ok" || get().repoRoot !== repoRoot) return;
    // A failed move leaves the file where it was; the next batch re-reads anything else.
    set((state) => ({
      columns: moveCard(state.columns, fileName, to, from),
      moveError: result.error,
    }));
  },

  dismissMoveError: () => set({ moveError: null }),

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
      archived: [],
      since: null,
      tagFilter: [],
      moveError: null,
    }),
}));
