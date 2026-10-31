import { cn } from "cn";
import { Plus, X } from "lucide-react";
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
    <div className="flex min-w-0 items-center gap-2">
      <div
        role="tablist"
        aria-label="Projects"
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
      >
        {tabs.map((root) => (
          <div
            key={root}
            className={cn(
              "group flex h-7 shrink-0 items-center rounded-md text-sm transition-colors",
              root === active
                ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={root === active}
              title={root}
              className="h-full rounded-l-md pr-1 pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void open(root)}
            >
              {labels[root]}
            </button>
            <button
              type="button"
              aria-label={`Close ${labels[root]}`}
              title="Close tab"
              className={cn(
                "flex h-full w-6 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                root === active
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              onClick={() => void close(root)}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Open repository in a new tab"
        title="Open repository in a new tab"
        onClick={() => runCommand("project.open-repository")}
      >
        <Plus aria-hidden />
      </Button>
      {error && (
        <p
          role="alert"
          className="min-w-0 truncate text-xs text-destructive"
          title={error}
        >
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
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Recent projects</h2>
      <ul className="-mx-2 flex flex-col">
        {closed.map((root) => (
          <li key={root}>
            <button
              type="button"
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void open(root)}
            >
              <span className="font-medium">{labels[root]}</span>
              <span className="code-id max-w-full truncate text-muted-foreground">
                {root}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
