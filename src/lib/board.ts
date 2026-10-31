import type { ChangeBatch, Task_Serialize } from "@/bindings";

/** One column of the board as read from its folder (`S-board-columns`). */
export interface BoardColumn {
  name: string;
  tasks: Task_Serialize[];
  /** The folder does not exist under the planning root. */
  missing: boolean;
  /** Why the folder could not be read. */
  error: string | null;
}

/** What a card shows (`S-board-card`). */
export interface Card {
  /** The file name, unique within a column. */
  key: string;
  id: string | null;
  title: string;
  tags: string[];
  /** Time since the file last changed, such as "3d"; `null` when unknown. */
  age: string | null;
  /** Tasks whose `parent` is this task (`S-subtasks`). */
  subtasks: number;
  /** Dependencies outside the terminal column, other than the task itself (`S-dependencies`). */
  blockedBy: string[];
  /** Changed since the previous visit of the project. */
  isNew: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The folder of `column`. Joined with `/`, which Rust also accepts on Windows. */
export function columnDir(
  repoRoot: string,
  planningRoot: string,
  column: string,
): string {
  const root = repoRoot.replace(/[\\/]+$/, "");
  const planning = planningRoot.replace(/^\/+|\/+$/g, "");
  return [root, planning, column].filter((part) => part !== "").join("/");
}

/** The columns a batch touched; paths in the batch are relative to the repository root. */
export function touchedColumns(
  batch: ChangeBatch,
  planningRoot: string,
  columns: string[],
): string[] {
  const prefix = `${planningRoot.replace(/\/+$/, "")}/`;
  const touched = new Set<string>();
  const visit = (path: string) => {
    if (!path.startsWith(prefix)) return;
    const column = path.slice(prefix.length).split("/")[0];
    if (columns.includes(column)) touched.add(column);
  };
  for (const change of batch.changes) {
    if (change.kind === "moved") {
      visit(change.from);
      visit(change.to);
    } else {
      visit(change.path);
    }
  }
  return columns.filter((column) => touched.has(column));
}

/** Time from `modified` to `now` in the largest fitting unit: "now", "5m", "3h", "2d", "4mo", "1y". */
export function ageLabel(modified: string | null, now: number): string | null {
  if (modified === null) return null;
  const time = Date.parse(modified);
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  if (elapsed < 365 * DAY) return `${Math.floor(elapsed / (30 * DAY))}mo`;
  return `${Math.floor(elapsed / (365 * DAY))}y`;
}

/** Whether a file changed after `since`; nothing is new on the first visit (`since` null). */
export function isNewSince(
  modified: string | null,
  since: number | null,
): boolean {
  if (since === null || modified === null) return false;
  const time = Date.parse(modified);
  return !Number.isNaN(time) && time > since;
}

/** `a` before `b` in the base order: priority 1 to 5, none last; created, none last; id, none last; file name. */
function compareBase(a: Task_Serialize, b: Task_Serialize): number {
  const rank = (task: Task_Serialize) =>
    task.priority ?? Number.POSITIVE_INFINITY;
  const byText = (x: string | null, y: string | null) =>
    x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
  return (
    rank(a) - rank(b) ||
    byText(a.created, b.created) ||
    byText(a.id, b.id) ||
    byText(a.file_name, b.file_name)
  );
}

/**
 * The tasks of one column in board order (`S-board-sort`): the base order (priority 1 to 5, none
 * last, then `created`, then id, then file name), with dependency order on top: a task comes
 * after every task of the same column it depends on. Each place is filled by the first task in
 * base order whose dependencies in the column are all placed. Dependencies on tasks in other
 * columns or on unknown ids are ignored. When no task is free, there is a cycle: starting from the
 * first remaining task in base order, its first unplaced dependency is followed until a task
 * repeats; that task, which lies on the cycle, is placed next.
 */
export function sortTasks(tasks: Task_Serialize[]): Task_Serialize[] {
  const remaining = [...tasks].sort(compareBase);
  /** The first unplaced task of the column that `task` depends on, if any. */
  const blocker = (task: Task_Serialize) => {
    for (const id of task.depends_on) {
      const found = remaining.find(
        (other) => other !== task && other.id === id,
      );
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const sorted: Task_Serialize[] = [];
  while (remaining.length > 0) {
    let next = remaining.find((task) => blocker(task) === undefined);
    if (next === undefined) {
      const seen = new Set<Task_Serialize>();
      let current = remaining[0];
      while (!seen.has(current)) {
        seen.add(current);
        // Every remaining task has a blocker here, since none is free.
        current = blocker(current) ?? current;
      }
      next = current;
    }
    remaining.splice(remaining.indexOf(next), 1);
    sorted.push(next);
  }
  return sorted;
}

/**
 * The cards of every column, each column in board order (`sortTasks`). A dependency blocks while its task is in a column other than
 * `terminal`; an id found in no column (archived or deleted) or the task's own id does not block.
 */
export function cardsOf(
  columns: BoardColumn[],
  terminal: string,
  since: number | null,
  now: number,
): Map<string, Card[]> {
  const columnOf = new Map<string, string>();
  const subtasks = new Map<string, number>();
  for (const column of columns) {
    for (const task of column.tasks) {
      if (task.id !== null) columnOf.set(task.id, column.name);
      if (task.parent !== null)
        subtasks.set(task.parent, (subtasks.get(task.parent) ?? 0) + 1);
    }
  }
  const blocks = (id: string) => {
    const column = columnOf.get(id);
    return column !== undefined && column !== terminal;
  };

  return new Map(
    columns.map((column) => [
      column.name,
      sortTasks(column.tasks).map((task) => ({
        key: task.file_name,
        id: task.id,
        title: task.title,
        tags: task.tags,
        age: ageLabel(task.modified, now),
        subtasks: task.id === null ? 0 : (subtasks.get(task.id) ?? 0),
        blockedBy: task.depends_on.filter((id) => id !== task.id && blocks(id)),
        isNew: isNewSince(task.modified, since),
      })),
    ]),
  );
}

/** Every tag of every task on the board, sorted, each once (`S-board-filter`). */
export function boardTags(columns: BoardColumn[]): string[] {
  const tags = new Set<string>();
  for (const column of columns)
    for (const task of column.tasks) for (const tag of task.tags) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** The cards carrying every tag in `tags`, in all columns; no tags keeps every card. */
export function filterCards(
  cards: Map<string, Card[]>,
  tags: string[],
): Map<string, Card[]> {
  if (tags.length === 0) return cards;
  return new Map(
    [...cards].map(([column, list]) => [
      column,
      list.filter((card) => tags.every((tag) => card.tags.includes(tag))),
    ]),
  );
}

/**
 * The board after moving the task `fileName` from column `from` to column `to` (`S-board-dnd`);
 * unchanged when the task is not in `from` or the columns are the same. A task already in `to`
 * (re-read from disk meanwhile) is not added twice. The task is appended to the column's tasks;
 * `cardsOf` puts it at its sorted place (`S-board-sort`).
 */
export function moveCard(
  columns: BoardColumn[],
  fileName: string,
  from: string,
  to: string,
): BoardColumn[] {
  if (from === to) return columns;
  const task = columns
    .find((column) => column.name === from)
    ?.tasks.find((candidate) => candidate.file_name === fileName);
  if (task === undefined || !columns.some((column) => column.name === to))
    return columns;
  return columns.map((column) => {
    if (column.name === from)
      return {
        ...column,
        tasks: column.tasks.filter((other) => other !== task),
      };
    if (
      column.name === to &&
      !column.tasks.some((other) => other.file_name === fileName)
    )
      return { ...column, tasks: [...column.tasks, task] };
    return column;
  });
}
