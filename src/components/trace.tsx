import type { ReactNode } from "react";
import type { ArchivedTask_Serialize, Node, SourceLine } from "@/bindings";
import { type BoardColumn, columnDir } from "@/lib/board";
import { sourceLabel } from "@/lib/spec-view";
import {
  buildTrace,
  type Trace,
  type TracedTask,
  tasksOfNode,
  tracedTaskFile,
  tracedTaskLabel,
  tracedTaskPath,
} from "@/lib/trace";
import { useBoardStore } from "@/stores/board-store";
import { useEditorStore } from "@/stores/editor-store";
import { useSpecStore } from "@/stores/spec-store";

/** The last trace built, so every node row of the tree shares one index. */
let cached: {
  columns: BoardColumn[];
  structure: Node[];
  terminal: string;
  archived: ArchivedTask_Serialize[];
  trace: Trace;
} | null = null;

/**
 * The trace between the board, its archive and the Structure (`S-trace`); `null` until both
 * are read.
 */
function useTrace(): Trace | null {
  const columns = useBoardStore((state) => state.columns);
  const archived = useBoardStore((state) => state.archived);
  const terminal = useBoardStore((state) => state.config?.terminal ?? null);
  const structure = useSpecStore((state) => state.spec?.structure ?? null);
  if (terminal === null || structure === null) return null;
  if (
    cached === null ||
    cached.columns !== columns ||
    cached.structure !== structure ||
    cached.terminal !== terminal ||
    cached.archived !== archived
  )
    cached = {
      columns,
      structure,
      terminal,
      archived,
      trace: buildTrace(columns, structure, terminal, archived),
    };
  return cached.trace;
}

/** Opens a task file in the editor; `null` until a project is open. */
function useOpenTask(): ((task: TracedTask) => void) | null {
  const repoRoot = useBoardStore((state) => state.repoRoot);
  const config = useBoardStore((state) => state.config);
  const open = useEditorStore((state) => state.open);
  if (repoRoot === null || config === null) return null;
  return (task) =>
    void open(
      repoRoot,
      `${columnDir(repoRoot, config.planning_root, task.column)}/${tracedTaskFile(task)}`,
    );
}

/** A task with its column; opens the task file in the editor. */
function TaskChip({
  task,
  onOpen,
}: {
  task: TracedTask;
  onOpen: (task: TracedTask) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      title={`Open ${tracedTaskPath(task)}`}
      className="flex max-w-64 items-center gap-1 rounded border px-1 text-xs hover:bg-muted"
    >
      <span className="shrink-0 text-muted-foreground">{task.column}</span>
      <span className="truncate">{tracedTaskLabel(task)}</span>
    </button>
  );
}

/** The tasks implementing a node, each with its column (`S-trace`); nothing when none do. */
export function NodeTasks({ id }: { id: string | null | undefined }) {
  const trace = useTrace();
  const openTask = useOpenTask();
  if (trace === null || openTask === null) return null;
  const tasks = tasksOfNode(trace, id);
  if (tasks.length === 0) return null;
  return (
    <span
      className="flex flex-wrap items-center gap-1"
      title="Tasks implementing this node"
    >
      {tasks.map((task) => (
        <TaskChip key={tracedTaskPath(task)} task={task} onOpen={openTask} />
      ))}
    </span>
  );
}

/**
 * The gaps of the trace (`S-trace`): tasks without `implements`, ticked nodes without any task
 * and `implements` entries naming no node. Tasks open in the editor, nodes at their line.
 */
export function TracePanel({ openAt }: { openAt: (at: SourceLine) => void }) {
  const trace = useTrace();
  const openTask = useOpenTask();
  if (trace === null || openTask === null) return null;
  const { withoutImplements, untracedNodes, unknownImplements } = trace;
  const total =
    withoutImplements.length + untracedNodes.length + unknownImplements.length;

  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold">
        Trace{" "}
        <span className="font-normal text-muted-foreground">
          {total === 0 ? "no gaps" : `${total} ${total === 1 ? "gap" : "gaps"}`}
        </span>
      </summary>
      <div className="mt-1 flex flex-col gap-2">
        <TraceGroup
          title="Tasks without implements"
          count={withoutImplements.length}
        >
          {withoutImplements.map((task) => (
            <li key={tracedTaskPath(task)}>
              <TaskChip task={task} onOpen={openTask} />
            </li>
          ))}
        </TraceGroup>
        <TraceGroup
          title="Ticked nodes without any task"
          count={untracedNodes.length}
        >
          {untracedNodes.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => openAt(node.at)}
                title={`Open ${sourceLabel(node.at)}`}
                className="flex gap-2 text-left hover:underline"
              >
                <code className="shrink-0 text-muted-foreground">
                  {node.id}
                </code>
                <span className="truncate">{node.title}</span>
              </button>
            </li>
          ))}
        </TraceGroup>
        <TraceGroup
          title="Implements entries naming no node"
          count={unknownImplements.length}
        >
          {unknownImplements.map(({ task, nodeId }) => (
            <li
              key={`${tracedTaskPath(task)}:${nodeId}`}
              className="flex items-center gap-2"
            >
              <code className="shrink-0 text-destructive">{nodeId}</code>
              <TaskChip task={task} onOpen={openTask} />
            </li>
          ))}
        </TraceGroup>
      </div>
    </details>
  );
}

function TraceGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <h4 className="text-muted-foreground">
        {title} <span className="tabular-nums">{count}</span>
      </h4>
      {count === 0 ? (
        <p className="text-muted-foreground">None</p>
      ) : (
        <ul className="flex flex-col gap-0.5">{children}</ul>
      )}
    </section>
  );
}
