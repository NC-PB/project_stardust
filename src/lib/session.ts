import type {
  ArchivedTask_Serialize,
  Config,
  Spec,
  Task_Serialize,
} from "@/bindings";
import { type BoardColumn, columnDir, sortTasks } from "@/lib/board";

/** How many of the latest decisions the session brief shows. */
export const SESSION_DECISIONS = 5;

/** A task of the ready column; the brief lists them in board order (`S-board-sort`). */
export interface SessionTask {
  id: string | null;
  title: string;
  priority: number | null;
  /** Absolute path of the task file. */
  path: string;
}

/** The task finished last, with the text of its Result section. */
export interface SessionResult {
  id: string | null;
  title: string;
  completed: string | null;
  /** The Result section without its heading; `null` when the task has none or it is empty. */
  result: string | null;
  path: string;
}

/** A spec entry (decision or question) with the line it starts on. */
export interface SessionEntry {
  id: string | null;
  text: string;
  /** Absolute path of the spec file holding the entry. */
  path: string;
  line: number;
  /** A decision with "Superseded by" fields; always false for questions. */
  superseded: boolean;
}

/**
 * What the session panel shows at the start of a session (`S-session-panel`): computed from the
 * board and the spec, never written anywhere.
 */
export interface SessionBrief {
  /** The column whose role is "ready for you" (D-20261031-001850-0g9f). */
  readyColumn: string;
  ready: SessionTask[];
  lastCompleted: SessionResult | null;
  /** The last `SESSION_DECISIONS` decisions of the Decisions section, newest first. */
  decisions: SessionEntry[];
  /** Open questions flagged `(blocking)`, in file order. */
  blockingQuestions: SessionEntry[];
}

/**
 * The column that is "ready for you": counted without the terminal column, the second column;
 * with a single such column, that one; without any, the terminal column. Mirrors
 * `column_roles` in `src-tauri/src/domain/columns.rs`.
 */
export function readyColumnOf(columns: string[], terminal: string): string {
  const open = columns.filter((column) => column !== terminal);
  return open[1] ?? open[0] ?? terminal;
}

/**
 * The task finished most recently: the latest `completed` date, then the latest change on disk.
 * Tasks without `completed` count as older than any with one.
 */
export function lastCompletedTask(
  tasks: Task_Serialize[],
): Task_Serialize | null {
  const fileTime = (task: Task_Serialize) => {
    const time =
      task.modified === null ? Number.NaN : Date.parse(task.modified);
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  };
  let latest: Task_Serialize | null = null;
  for (const task of tasks) {
    if (latest === null) {
      latest = task;
      continue;
    }
    const byDate = (task.completed ?? "").localeCompare(latest.completed ?? "");
    if (byDate > 0 || (byDate === 0 && fileTime(task) > fileTime(latest)))
      latest = task;
  }
  return latest;
}

/** The text of the task's Result section, `null` when it is missing or empty. */
export function resultOf(task: Task_Serialize): string | null {
  const section = task.sections.find(
    (candidate) => candidate.heading.trim().toLowerCase() === "result",
  );
  const content = section?.content.trim() ?? "";
  return content === "" ? null : content;
}

/** Absolute path of a file given relative to the planning root, such as `spec.md`. */
export function planningPath(
  repoRoot: string,
  planningRoot: string,
  file: string,
): string {
  return columnDir(repoRoot, planningRoot, file);
}

/**
 * The task finished last: from the files directly in the terminal column, or, when it holds none,
 * from its archived tasks, opened at their month folder path (D-20261031-031857-6qqi).
 */
function lastFinished(
  terminalTasks: Task_Serialize[],
  archived: ArchivedTask_Serialize[],
  pathOf: (folder: string, task: Task_Serialize) => string,
): SessionResult | null {
  let finished = lastCompletedTask(terminalTasks);
  let folder = "";
  if (finished === null) {
    finished = lastCompletedTask(archived.map((entry) => entry.task));
    const month = archived.find((entry) => entry.task === finished)?.month;
    if (month !== undefined) folder = `${month}/`;
  }
  if (finished === null) return null;
  return {
    id: finished.id,
    title: finished.title,
    completed: finished.completed,
    result: resultOf(finished),
    path: pathOf(folder, finished),
  };
}

/**
 * The session brief of the open project; without a spec the spec parts are empty. The archived
 * tasks of the terminal column (`S-archive`) are read only when no task is directly in it.
 */
export function sessionBrief(
  repoRoot: string,
  config: Config,
  columns: BoardColumn[],
  spec: Spec | null,
  archived: ArchivedTask_Serialize[] = [],
): SessionBrief {
  const readyColumn = readyColumnOf(config.columns, config.terminal);
  const pathIn = (column: string, task: Task_Serialize) =>
    `${columnDir(repoRoot, config.planning_root, column)}/${task.file_name}`;
  const tasksOf = (name: string) =>
    columns.find((column) => column.name === name)?.tasks ?? [];

  // The board order of the ready column (`S-board-sort`).
  const ready = sortTasks(tasksOf(readyColumn)).map((task) => ({
    id: task.id,
    title: task.title,
    priority: task.priority,
    path: pathIn(readyColumn, task),
  }));

  const lastCompleted = lastFinished(
    tasksOf(config.terminal),
    archived,
    (folder, task) =>
      `${columnDir(repoRoot, config.planning_root, config.terminal)}/${folder}${task.file_name}`,
  );

  const specPath = (file: string) =>
    planningPath(repoRoot, config.planning_root, file);
  const decisions = (spec?.decisions ?? [])
    .slice(-SESSION_DECISIONS)
    .reverse()
    .map((decision) => ({
      id: decision.id ?? null,
      text: decision.title,
      path: specPath(decision.at.file),
      line: decision.at.line,
      superseded: decision.superseded_by.length > 0,
    }));
  const blockingQuestions = (spec?.questions ?? [])
    .filter((question) => question.blocking && !question.answered)
    .map((question) => ({
      id: question.id ?? null,
      text: question.question || question.text,
      path: specPath(question.at.file),
      line: question.at.line,
      superseded: false,
    }));

  return { readyColumn, ready, lastCompleted, decisions, blockingQuestions };
}
