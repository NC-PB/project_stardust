import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  describeBatch,
  describeLinks,
  describeRepair,
  describeRepositoryWatchError,
  offerLabel,
  projectStatus,
} from "@/lib/project";
import { versionLabel } from "@/lib/version";
import { useAppStore } from "@/stores/app-store";
import { runCommand } from "@/stores/command-store";
import { useProjectStore } from "@/stores/project-store";
import { useTerminalStore } from "@/stores/terminal-store";

/**
 * What the project asks of the user, at the top of the work area (`S-init`,
 * `S-window-layout`): initializing, the init report, the offers and the errors of the project
 * actions. Nothing shows while there is nothing to answer.
 */
export function ProjectNotices() {
  const { repoRoot, config, initReport, offers, error, accept, dismiss } =
    useProjectStore();
  const status = projectStatus(repoRoot, config);
  const terminal = useTerminalStore();
  const offersShown = config !== null && offers.length > 0;
  if (
    status !== "needs-init" &&
    !initReport &&
    !offersShown &&
    !terminal.error &&
    !error
  )
    return null;

  return (
    <section
      aria-label="Project"
      className="flex flex-col gap-2 border-b bg-card px-4 py-3 text-sm"
    >
      {status === "needs-init" && (
        <div className="flex items-center justify-between gap-4">
          <p>
            This repository has no{" "}
            <code className="code-id">docs/planner.yml</code> yet. Initializing
            adds the planning files and changes nothing that is there.
          </p>
          <Button onClick={() => runCommand("project.initialize")}>
            Initialize
          </Button>
        </div>
      )}

      {initReport && (
        <div className="flex flex-col gap-2">
          <PathList title="Created" paths={initReport.created} />
          <PathList
            title="Already there, left unchanged"
            paths={initReport.existing}
          />
          <PathList title="Issues" paths={initReport.issues} />
        </div>
      )}

      {config &&
        offers.map((offer) => (
          <div key={offer} className="flex items-center justify-between gap-4">
            <p>{offerLabel(offer, config.config)}?</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void accept(offer)}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss(offer)}>
                Not now
              </Button>
            </div>
          </div>
        ))}

      {terminal.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-destructive"
        >
          <span>{terminal.error}</span>
          <Button variant="ghost" size="xs" onClick={terminal.dismiss}>
            Dismiss
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function PathList({ title, paths }: { title: string; paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="flex flex-col text-muted-foreground">
        {paths.map((path) => (
          <li key={path} className="code-id">
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The status bar at the window's foot (`S-window-layout`): the repository and planning root,
 * whether the project is opening, the repository watcher's error, the last change on disk and
 * the link reports, then the version.
 */
export function StatusBar() {
  const {
    repoRoot,
    config,
    lastChange,
    links,
    repair,
    repositoryWatchError,
    opening,
    dismissLinks,
  } = useProjectStore();
  const version = useAppStore((state) => state.version);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t px-3 text-xs text-muted-foreground">
      {repoRoot !== null && (
        <span className="code-id min-w-0 truncate" title={repoRoot}>
          {repoRoot}
          {config?.config.planning_root && (
            <span className="text-muted-foreground/70">
              {" "}
              / {config.config.planning_root}
            </span>
          )}
        </span>
      )}
      {opening && (
        <span role="status" className="shrink-0">
          Opening the project…
        </span>
      )}
      {repositoryWatchError && (
        <span role="status" className="min-w-0 truncate text-destructive">
          {describeRepositoryWatchError(repositoryWatchError)}
        </span>
      )}
      <span className="ml-auto" />
      {(links || repair) && (
        <LinkReport links={links} repair={repair} onDismiss={dismissLinks} />
      )}
      {lastChange && (
        <span
          className="min-w-0 max-w-[40ch] shrink truncate"
          title={describeLastChange(lastChange)}
        >
          {describeLastChange(lastChange)}
        </span>
      )}
      <span className="code-id shrink-0">{versionLabel(version)}</span>
    </footer>
  );
}

type ProjectState = ReturnType<typeof useProjectStore.getState>;

function describeLastChange(
  change: NonNullable<ProjectState["lastChange"]>,
): string {
  const written =
    change.block_written.length > 0
      ? `; planner block rewritten in ${change.block_written.join(", ")}`
      : "";
  return `Changed on disk: ${describeBatch(change.batch)}${written}`;
}

/** The links rewritten after a move and repaired on open; the details open above the bar. */
function LinkReport({
  links,
  repair,
  onDismiss,
}: {
  links: ProjectState["links"];
  repair: ProjectState["repair"];
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const problems = [
    ...(links?.problems.map((problem) => `Links not rewritten: ${problem}`) ??
      []),
    ...(repair?.problems.map((problem) => `Links not repaired: ${problem}`) ??
      []),
  ];
  const lines = [
    ...(links && describeLinks(links) ? [describeLinks(links) as string] : []),
    ...(repair ? describeRepair(repair) : []),
  ];
  const summary =
    problems.length > 0
      ? `${problems.length} link ${problems.length === 1 ? "problem" : "problems"}`
      : "Links updated";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={
          problems.length > 0
            ? "text-destructive hover:underline"
            : "hover:text-foreground hover:underline"
        }
      >
        {summary}
      </button>
      {open && (
        <div
          role="status"
          className="absolute right-0 bottom-full z-30 mb-1 flex w-[28rem] max-w-[80vw] flex-col gap-1 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-[0_8px_24px_-12px_rgb(30_39_51/0.35)]"
        >
          {lines.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
          {problems.map((problem) => (
            <p key={problem} className="text-destructive">
              {problem}
            </p>
          ))}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setOpen(false);
                onDismiss();
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
