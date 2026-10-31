import { useEffect, useMemo } from "react";
import { useNow, useStaleFlagList } from "@/components/stale-flags";
import { Button } from "@/components/ui/button";
import { staleGroups, staleSummary, staleViewEntries } from "@/lib/stale-view";
import { useBoardStore } from "@/stores/board-store";
import { useEditorStore } from "@/stores/editor-store";
import { useStaleViewStore } from "@/stores/stale-view-store";

/**
 * The Stale view (`S-staleness`): everything flagged as stale, blocked or broken, each entry
 * with its reason, opening its file in the editor at its line. The doctor's findings follow
 * changes on disk while the view is shown.
 */
export function StaleView() {
  const repoRoot = useBoardStore((state) => state.repoRoot);
  const config = useBoardStore((state) => state.config);
  const columns = useBoardStore((state) => state.columns);
  const flags = useStaleFlagList();
  const now = useNow();
  const state = useStaleViewStore();
  const { follow, check } = state;
  const open = useEditorStore((editor) => editor.open);

  useEffect(
    () => (repoRoot === null ? undefined : follow(repoRoot)),
    [repoRoot, follow],
  );

  // Findings of a repository opened before are not shown.
  const report = state.repoRoot === repoRoot ? state.report : null;
  const entries = useMemo(
    () =>
      repoRoot === null || config === null
        ? []
        : staleViewEntries({
            repoRoot,
            config,
            columns,
            flags,
            findings: report?.findings ?? null,
            now,
          }),
    [repoRoot, config, columns, flags, report, now],
  );
  if (repoRoot === null || config === null) return null;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto bg-card px-6 py-5 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{staleSummary(entries)}</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {state.checking
              ? "Doctor checking…"
              : state.checkedAt !== null
                ? `Doctor checked ${new Date(state.checkedAt).toLocaleTimeString()}`
                : null}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void check(repoRoot)}
            title="Runs the doctor again; it also runs after every change on disk"
          >
            Check again
          </Button>
        </div>
      </header>
      {staleGroups(entries).map((group) => (
        <div key={group.group} className="flex max-w-4xl flex-col gap-1">
          <h3 className="flex items-baseline gap-2 border-b pb-1 font-semibold">
            {group.label}
            <span className="code-id font-normal text-muted-foreground">
              {group.entries.length}
            </span>
          </h3>
          {group.group === "broken" && report === null ? (
            <p className="py-1 text-xs text-muted-foreground">
              The doctor is checking…
            </p>
          ) : group.entries.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">Nothing here.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {group.entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      void open(repoRoot, entry.path, entry.line ?? undefined)
                    }
                    title="Opens the file in the editor"
                  >
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-attention">
                        {entry.label}
                      </span>
                      {entry.title !== null && (
                        <span className="font-medium">{entry.title}</span>
                      )}
                      <span className="code-id text-muted-foreground">
                        {entry.location}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {entry.reason}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {report !== null && report.problems.length > 0 && (
        <ul className="list-inside list-disc text-xs text-destructive">
          {report.problems.map((problem) => (
            <li key={problem}>Not checked: {problem}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
