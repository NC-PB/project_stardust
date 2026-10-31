import type { Node, SourceLine, Task_Serialize } from "@/bindings";
import type { BoardColumn } from "@/lib/board";

/** A task as seen from the Structure: the task and the column it lives in (`S-trace`). */
export interface TracedTask {
  /** The task id; `null` when the file has none. */
  id: string | null;
  title: string;
  fileName: string;
  column: string;
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
  /** Node id to the tasks implementing it, in column order then file order. */
  tasksByNode: Map<string, TracedTask[]>;
  /** Tasks outside the terminal column with an empty `implements`. */
  withoutImplements: TracedTask[];
  /** Ticked nodes without any task, in Structure order. */
  untracedNodes: UntracedNode[];
  /** `implements` entries naming no node, in column order then file order. */
  unknownImplements: UnknownImplements[];
}

function traced(task: Task_Serialize, column: string): TracedTask {
  return { id: task.id, title: task.title, fileName: task.file_name, column };
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
 * Tasks in every column, the terminal one included, implement their nodes and are checked for
 * unknown entries; only tasks outside `terminal` are listed for a missing `implements`, since
 * finished tasks are history. An entry repeated in one task counts once.
 */
export function buildTrace(
  columns: BoardColumn[],
  structure: Node[],
  terminal: string,
): Trace {
  const known = nodeIds(structure);
  const tasksByNode = new Map<string, TracedTask[]>();
  const withoutImplements: TracedTask[] = [];
  const unknownImplements: UnknownImplements[] = [];

  for (const column of columns) {
    for (const task of column.tasks) {
      const entry = traced(task, column.name);
      const entries = [
        ...new Set(task.implements.map((id) => id.trim()).filter(Boolean)),
      ];
      if (entries.length === 0 && column.name !== terminal)
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
