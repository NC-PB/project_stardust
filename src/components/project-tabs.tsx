import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { closedRecent, tabLabels } from "@/lib/workspace";
import { runCommand } from "@/stores/command-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * One tab per open project (`S-multi-project`). Choosing a tab shows its board as it was left;
 * the cross closes a tab. "+" opens another repository.
 */
export function ProjectTabs() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const active = useWorkspaceStore((state) => state.active);
  const error = useWorkspaceStore((state) => state.error);
  const open = useWorkspaceStore((state) => state.open);
  const close = useWorkspaceStore((state) => state.close);
  if (tabs.length === 0) return null;
  const labels = tabLabels(tabs);

  return (
    <div className="flex w-full flex-col gap-1">
      <div
        role="tablist"
        aria-label="Projects"
        className="flex w-full flex-wrap items-center gap-1 border-b"
      >
        {tabs.map((root) => (
          <div
            key={root}
            className={cn(
              "flex items-center rounded-t-md border border-b-0 text-sm",
              root === active
                ? "bg-secondary font-medium"
                : "text-muted-foreground",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={root === active}
              title={root}
              className="px-3 py-1"
              onClick={() => void open(root)}
            >
              {labels[root]}
            </button>
            <button
              type="button"
              aria-label={`Close ${labels[root]}`}
              title="Close tab"
              className="px-1.5 py-1 hover:text-foreground"
              onClick={() => void close(root)}
            >
              ×
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="xs"
          title="Open repository in a new tab"
          onClick={() => runCommand("project.open-repository")}
        >
          +
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The recent projects without a tab, on the start screen (`S-multi-project`). */
export function RecentProjects() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const recent = useWorkspaceStore((state) => state.recent);
  const open = useWorkspaceStore((state) => state.open);
  const closed = closedRecent(recent, tabs);
  if (tabs.length > 0 || closed.length === 0) return null;
  const labels = tabLabels(closed);

  return (
    <section className="flex w-full max-w-xl flex-col gap-2">
      <h2 className="text-sm font-medium">Recent projects</h2>
      <ul className="flex flex-col gap-1">
        {closed.map((root) => (
          <li key={root}>
            <button
              type="button"
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary"
              onClick={() => void open(root)}
            >
              <span className="font-medium">{labels[root]}</span>
              <span className="truncate text-xs text-muted-foreground">
                {root}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
