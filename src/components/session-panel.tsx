import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { type SessionEntry, sessionBrief } from "@/lib/session";
import { useBoardStore } from "@/stores/board-store";
import { runCommand } from "@/stores/command-store";
import { useEditorStore } from "@/stores/editor-store";
import { useSessionStore } from "@/stores/session-store";
import { useSpecStore } from "@/stores/spec-store";

/**
 * Where to pick up at the start of a session (`S-session-panel`): the ready tasks, the Result of
 * the task finished last, the latest decisions and the open blocking questions. Computed from
 * the board and the spec; every entry opens its file in the editor. It fills the right pane
 * while no file is open and shows over the open file on request (`S-window-layout`); hidden for
 * the session on request.
 */
export function SessionPanel() {
  const { repoRoot, config, columns, archived } = useBoardStore();
  const spec = useSpecStore((state) =>
    state.repoRoot === repoRoot ? state.spec : null,
  );
  const openFile = useEditorStore((state) => state.open);
  const hiddenFor = useSessionStore((state) => state.hiddenFor);
  const over = useSessionStore((state) => state.over);
  const setOver = useSessionStore((state) => state.setOver);

  if (repoRoot === null || config === null || (hiddenFor === repoRoot && !over))
    return null;

  const brief = sessionBrief(repoRoot, config, columns, spec, archived);
  const open = (path: string, line?: number) => {
    setOver(false);
    void openFile(repoRoot, path, line);
  };
  const last = brief.lastCompleted;
  const prioritized = brief.ready.some((task) => task.priority !== null);

  return (
    <section
      aria-label="Session"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <header className="sticky top-0 flex items-baseline gap-3 border-b bg-card px-5 pt-4 pb-3">
        <h2 className="text-base font-semibold">Where to pick up</h2>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => runCommand("session.hide")}
        >
          {over ? "Back to the file" : "Hide"}
        </Button>
      </header>
      <div className="flex flex-col gap-6 px-5 py-4 text-sm">
        <Part title="Ready" detail={`${brief.readyColumn}/`}>
          {brief.ready.length === 0 && <Empty>No tasks are ready.</Empty>}
          <ol className="flex flex-col">
            {brief.ready.map((task) => (
              <li key={task.path}>
                <EntryLink onOpen={() => open(task.path)} title={task.path}>
                  {prioritized && (
                    <span className="code-id w-6 shrink-0 text-muted-foreground">
                      {task.priority !== null ? `P${task.priority}` : ""}
                    </span>
                  )}
                  <span>{task.title}</span>
                </EntryLink>
              </li>
            ))}
          </ol>
        </Part>
        <Part title="Last finished" detail={last?.completed ?? undefined}>
          {last === null ? (
            <Empty>No task is finished yet.</Empty>
          ) : (
            <>
              <EntryLink onOpen={() => open(last.path)} title={last.path}>
                <span className="font-medium">{last.title}</span>
              </EntryLink>
              {last.result === null ? (
                <Empty>No Result written.</Empty>
              ) : (
                <ResultText text={last.result} />
              )}
            </>
          )}
        </Part>
        <Part title="Latest decisions">
          {brief.decisions.length === 0 && <Empty>No decisions yet.</Empty>}
          <ul className="flex flex-col">
            {brief.decisions.map((entry) => (
              <li key={entryKey(entry)}>
                <SpecEntry entry={entry} onOpen={open} />
              </li>
            ))}
          </ul>
        </Part>
        <Part title="Blocking questions">
          {brief.blockingQuestions.length === 0 && (
            <Empty>No question blocks the work.</Empty>
          )}
          <ul className="flex flex-col">
            {brief.blockingQuestions.map((entry) => (
              <li key={entryKey(entry)}>
                <SpecEntry entry={entry} onOpen={open} />
              </li>
            ))}
          </ul>
        </Part>
      </div>
    </section>
  );
}

/** The Result of the task finished last, folded to a few lines until asked for in full. */
function ResultText({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  const long = text.length > 480;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          "max-w-[70ch] whitespace-pre-wrap font-serif text-[0.9rem] leading-relaxed text-muted-foreground",
          long && !full && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long && (
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2"
          onClick={() => setFull(!full)}
        >
          {full ? "Show less" : "Show all"}
        </Button>
      )}
    </div>
  );
}

const entryKey = (entry: SessionEntry) => `${entry.path}:${entry.line}`;

function Part({
  title,
  detail,
  children,
}: {
  title: string;
  /** A folder or date beside the title. */
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="flex items-baseline gap-2 font-semibold">
        {title}
        {detail && (
          <span className="code-id font-normal text-muted-foreground">
            {detail}
          </span>
        )}
      </h3>
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
      className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-2 rounded-sm px-2 py-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
      <span className="flex min-w-0 flex-col">
        <span className={entry.superseded ? "line-through" : undefined}>
          {entry.text}
        </span>
        {entry.id && (
          <span className="code-id text-muted-foreground">{entry.id}</span>
        )}
      </span>
    </EntryLink>
  );
}
