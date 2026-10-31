import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { type SessionEntry, sessionBrief } from "@/lib/session";
import { useBoardStore } from "@/stores/board-store";
import { useEditorStore } from "@/stores/editor-store";
import { useSessionStore } from "@/stores/session-store";
import { useSpecStore } from "@/stores/spec-store";

/**
 * Where to pick up at the start of a session (`S-session-panel`): the ready tasks, the Result of
 * the task finished last, the latest decisions and the open blocking questions. Computed from
 * the board and the spec; every entry opens its file in the editor. Shown when a project opens,
 * hidden for the session on request.
 */
export function SessionPanel() {
  const { repoRoot, config, columns, archived } = useBoardStore();
  const spec = useSpecStore((state) =>
    state.repoRoot === repoRoot ? state.spec : null,
  );
  const openFile = useEditorStore((state) => state.open);
  const { hiddenFor, hide, show } = useSessionStore();

  if (repoRoot === null || config === null) return null;
  if (hiddenFor === repoRoot)
    return (
      <div className="flex w-full justify-end">
        <Button variant="ghost" size="xs" onClick={show}>
          Show session
        </Button>
      </div>
    );

  const brief = sessionBrief(repoRoot, config, columns, spec, archived);
  const open = (path: string, line?: number) =>
    void openFile(repoRoot, path, line);
  const last = brief.lastCompleted;

  return (
    <section
      aria-label="Session"
      className="flex w-full flex-col gap-2 rounded-lg border p-2"
    >
      <header className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold">Session</h2>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => hide(repoRoot)}
        >
          Hide
        </Button>
      </header>
      <div className="grid max-h-56 grid-cols-1 gap-3 overflow-y-auto px-1 text-xs md:grid-cols-2 xl:grid-cols-4">
        <Part title={`Ready in ${brief.readyColumn}/`}>
          {brief.ready.length === 0 && <Empty>No tasks</Empty>}
          {brief.ready.map((task) => (
            <EntryLink
              key={task.path}
              onOpen={() => open(task.path)}
              title={task.path}
            >
              {task.priority !== null && (
                <span className="mr-1 text-muted-foreground">
                  P{task.priority}
                </span>
              )}
              {task.title}
            </EntryLink>
          ))}
        </Part>
        <Part title="Last finished">
          {last === null ? (
            <Empty>No finished task</Empty>
          ) : (
            <>
              <EntryLink onOpen={() => open(last.path)} title={last.path}>
                {last.title}
                {last.completed && (
                  <span className="ml-1 text-muted-foreground">
                    {last.completed}
                  </span>
                )}
              </EntryLink>
              {last.result === null ? (
                <Empty>No Result written</Empty>
              ) : (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {last.result}
                </p>
              )}
            </>
          )}
        </Part>
        <Part title="Latest decisions">
          {brief.decisions.length === 0 && <Empty>No decisions</Empty>}
          {brief.decisions.map((entry) => (
            <SpecEntry key={entryKey(entry)} entry={entry} onOpen={open} />
          ))}
        </Part>
        <Part title="Open blocking questions">
          {brief.blockingQuestions.length === 0 && <Empty>None</Empty>}
          {brief.blockingQuestions.map((entry) => (
            <SpecEntry key={entryKey(entry)} entry={entry} onOpen={open} />
          ))}
        </Part>
      </div>
    </section>
  );
}

const entryKey = (entry: SessionEntry) => `${entry.path}:${entry.line}`;

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function EntryLink({
  onOpen,
  title,
  children,
}: {
  onOpen: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className="text-left hover:underline"
    >
      {children}
    </button>
  );
}

/** A decision or question; opens the spec file it is in at its line. */
function SpecEntry({
  entry,
  onOpen,
}: {
  entry: SessionEntry;
  onOpen: (path: string, line: number) => void;
}) {
  return (
    <EntryLink
      onOpen={() => onOpen(entry.path, entry.line)}
      title={`${entry.path}:${entry.line}`}
    >
      {entry.id && (
        <span className="mr-1 font-mono text-muted-foreground">{entry.id}</span>
      )}
      <span className={entry.superseded ? "line-through" : undefined}>
        {entry.text}
      </span>
    </EntryLink>
  );
}
