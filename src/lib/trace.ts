import type {
  ArchivedTask_Serialize,
  Node,
  SourceLine,
  Task_Serialize,
} from "@/bindings";
import type { BoardColumn } from "@/lib/board";

/** A task as seen from the Structure: the task and the column it lives in (`S-trace`). */
export interface TracedTask {
  /** The task id; `null` when the file has none. */
  id: string | null;
  title: string;
  fileName: string;
  column: string;
  /** The month folder `YYYY-MM` of an archived task (`S-archive`); `null` directly in the column. */
  month: string | null;
}

/** A ticked node that no task implements, neither it nor a node below it (`S-trace`). */
export interface UntracedNode {
  id: string;
  title: string;
  at: SourceLine;
}

/** An `implements` entry of a task that names no node of the Structure (`S-trace`). */
export interface UnknownImplements {
  task: TracedTask;
  /** The entry as written in the task. */
  nodeId: string;
}

/** The trace between tasks and nodes (`S-trace`). */
export interface Trace {
  /**
   * Node id to the tasks implementing it, in column order then file order; archived tasks follow
   * the tasks directly in the terminal column, by month.
   */
  tasksByNode: Map<string, TracedTask[]>;
  /** Tasks outside the terminal column with an empty `implements`. */
  withoutImplements: TracedTask[];
  /** Ticked nodes without any task, in Structure order. */
  untracedNodes: UntracedNode[];
  /** `implements` entries naming no node, in column order then file order. */
  unknownImplements: UnknownImplements[];
}

function traced(
  task: Task_Serialize,
  column: string,
  month: string | null = null,
): TracedTask {
  return {
    id: task.id,
    title: task.title,
    fileName: task.file_name,
    column,
    month,
  };
}

/** Every task with its column: the board's columns in order, the archive after the terminal one. */
function allTasks(
  columns: BoardColumn[],
  terminal: string,
  archived: ArchivedTask_Serialize[],
): { task: Task_Serialize; entry: TracedTask }[] {
  const all: { task: Task_Serialize; entry: TracedTask }[] = [];
  for (const column of columns) {
    for (const task of column.tasks)
      all.push({ task, entry: traced(task, column.name) });
    if (column.name !== terminal) continue;
    for (const { month, task } of archived)
      all.push({ task, entry: traced(task, column.name, month) });
  }
  return all;
}

/** Every node id in the Structure, depth first. */
function nodeIds(nodes: Node[], into: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.id) into.add(node.id);
    nodeIds(node.children, into);
  }
  return into;
}

/**
 * Ticked nodes without a task, depth first; returns whether any node of `nodes` or below is
 * implemented. Areas have no checkbox and are never listed; a `#later` node is skipped with
 * its subtree, like the gate does (D-20261031-011731-g8te). A node counts as implemented when a
 * task implements it or a node below it.
 */
function collectUntraced(
  nodes: Node[],
  tasksByNode: Map<string, TracedTask[]>,
  into: UntracedNode[],
): boolean {
  let anyImplemented = false;
  for (const node of nodes) {
    const ownTasks = node.id ? (tasksByNode.get(node.id)?.length ?? 0) : 0;
    const below: UntracedNode[] = [];
    const childImplemented = collectUntraced(node.children, tasksByNode, below);
    const implemented = ownTasks > 0 || childImplemented;
    if (implemented) anyImplemented = true;
    if (node.later) continue;
    if (node.ticked === true && node.id && !implemented)
      into.push({ id: node.id, title: node.title, at: node.at });
    into.push(...below);
  }
  return anyImplemented;
}

/**
 * Builds the trace between the tasks on the board and the nodes of the Structure (`S-trace`).
 * Tasks in every column, the terminal one and its archive (`archived`, the month folders)
 * included, implement their nodes and are checked for unknown entries; only tasks outside
 * `terminal` are listed for a missing `implements`, since finished tasks are history. An entry
 * repeated in one task counts once. The doctor (`src-tauri/src/domain/doctor.rs`, `untraced`)
 * applies the same two task rules in Rust; change them together.
 */
export function buildTrace(
  columns: BoardColumn[],
  structure: Node[],
  terminal: string,
  archived: ArchivedTask_Serialize[] = [],
): Trace {
  const known = nodeIds(structure);
  const tasksByNode = new Map<string, TracedTask[]>();
  const withoutImplements: TracedTask[] = [];
  const unknownImplements: UnknownImplements[] = [];

  for (const { task, entry } of allTasks(columns, terminal, archived)) {
    const entries = [
      ...new Set(task.implements.map((id) => id.trim()).filter(Boolean)),
    ];
    if (entries.length === 0 && entry.column !== terminal)
      withoutImplements.push(entry);
    for (const nodeId of entries) {
      if (!known.has(nodeId)) {
        unknownImplements.push({ task: entry, nodeId });
        continue;
      }
      const list = tasksByNode.get(nodeId);
      if (list === undefined) tasksByNode.set(nodeId, [entry]);
      else list.push(entry);
    }
  }

  const untracedNodes: UntracedNode[] = [];
  collectUntraced(structure, tasksByNode, untracedNodes);
  return { tasksByNode, withoutImplements, untracedNodes, unknownImplements };
}

/** The tasks implementing the node with `id`; none for a node without id. */
export function tasksOfNode(
  trace: Trace,
  id: string | null | undefined,
): TracedTask[] {
  return id ? (trace.tasksByNode.get(id) ?? []) : [];
}

/** How a task is named in the trace: its title, else its file name. */
export function tracedTaskLabel(task: TracedTask): string {
  return task.title.trim() || task.fileName;
}

/** The task file below its column folder: `name.md`, or `YYYY-MM/name.md` when archived. */
export function tracedTaskFile(task: TracedTask): string {
  return task.month === null ? task.fileName : `${task.month}/${task.fileName}`;
}

/** The task file below the planning root, such as `done/2026-09/name.md`. */
export function tracedTaskPath(task: TracedTask): string {
  return `${task.column}/${tracedTaskFile(task)}`;
}
