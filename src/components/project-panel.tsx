import { Button } from "@/components/ui/button";
import { describeBatch, offerLabel, projectStatus } from "@/lib/project";
import { useProjectStore } from "@/stores/project-store";

/** Chooses the repository, runs init and shows its offers (`S-init`). */
export function ProjectPanel() {
  const {
    repoRoot,
    config,
    initReport,
    offers,
    error,
    lastChange,
    choose,
    initialize,
    accept,
    dismiss,
  } = useProjectStore();
  const status = projectStatus(repoRoot, config);

  return (
    <section className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-sm text-muted-foreground">
          {repoRoot ?? "No repository chosen"}
        </p>
        <Button variant="outline" onClick={() => void choose()}>
          Open repository
        </Button>
      </div>

      {status === "needs-init" && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">This repository has no docs/planner.yml.</p>
          <Button onClick={() => void initialize()}>Initialize</Button>
        </div>
      )}

      {status === "ready" && !initReport && (
        <p className="text-sm">Planning root: {config?.config.planning_root}</p>
      )}

      {initReport && (
        <div className="flex flex-col gap-2 text-sm">
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
            <p className="text-sm">{offerLabel(offer, config.config)}?</p>
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

      {lastChange && (
        <p className="text-sm text-muted-foreground">
          Changed on disk: {describeBatch(lastChange.batch)}
          {lastChange.block_written.length > 0 &&
            `; planner block rewritten in ${lastChange.block_written.join(", ")}`}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function PathList({ title, paths }: { title: string; paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="list-inside list-disc text-muted-foreground">
        {paths.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    </div>
  );
}
