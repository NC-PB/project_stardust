import { ArchiveButton, ArchivePanel } from "@/components/archive";
import { ChangelogButton, ChangelogPanel } from "@/components/changelog";
import {
  GitattributesButton,
  GitattributesPanel,
} from "@/components/gitattributes";
import { SplitSpecButton, SplitSpecPanel } from "@/components/spec-split";
import { Button } from "@/components/ui/button";
import {
  describeBatch,
  describeLinks,
  describeRepair,
  describeRepositoryWatchError,
  offerLabel,
  projectStatus,
} from "@/lib/project";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { useTerminalStore } from "@/stores/terminal-store";

/** Chooses the repository, runs init and shows its offers (`S-init`). */
export function ProjectPanel() {
  const {
    repoRoot,
    config,
    initReport,
    offers,
    error,
    lastChange,
    links,
    repair,
    repositoryWatchError,
    dismissLinks,
    sources,
    choose,
    initialize,
    accept,
    dismiss,
  } = useProjectStore();
  const status = projectStatus(repoRoot, config);
  const openFile = useEditorStore((state) => state.open);
  const terminal = useTerminalStore();
  const openSource = (path: string) => {
    if (repoRoot !== null) void openFile(repoRoot, path);
  };

  return (
    <section className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-sm text-muted-foreground">
          {repoRoot ?? "No repository chosen"}
        </p>
        <div className="flex gap-2">
          {repoRoot !== null && (
            <Button
              variant="outline"
              onClick={() => void terminal.open(repoRoot)}
              title="Opens your terminal in the repository root"
            >
              Open terminal
            </Button>
          )}
          <Button variant="outline" onClick={() => void choose()}>
            Open repository
          </Button>
        </div>
      </div>
      {terminal.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-sm text-destructive"
        >
          <span>{terminal.error}</span>
          <Button variant="ghost" size="xs" onClick={terminal.dismiss}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "needs-init" && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">This repository has no docs/planner.yml.</p>
          <Button onClick={() => void initialize()}>Initialize</Button>
        </div>
      )}

      {status === "ready" && !initReport && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">
            Planning root: {config?.config.planning_root}
          </p>
          <div className="flex gap-2">
            {sources?.braindump && (
              <SourceButton
                label="Braindump"
                path={sources.braindump}
                onOpen={openSource}
              />
            )}
            {sources?.spec && (
              <SourceButton
                label="Spec"
                path={sources.spec}
                onOpen={openSource}
              />
            )}
            {sources?.spec && repoRoot !== null && (
              <SplitSpecButton repoRoot={repoRoot} />
            )}
            {repoRoot !== null && <GitattributesButton repoRoot={repoRoot} />}
            {repoRoot !== null && <ChangelogButton repoRoot={repoRoot} />}
            {repoRoot !== null && <ArchiveButton repoRoot={repoRoot} />}
          </div>
        </div>
      )}
      {status === "ready" && repoRoot !== null && (
        <>
          <SplitSpecPanel repoRoot={repoRoot} />
          <GitattributesPanel repoRoot={repoRoot} />
          <ArchivePanel repoRoot={repoRoot} />
        </>
      )}
      {status === "ready" && repoRoot !== null && (
        <ChangelogPanel repoRoot={repoRoot} />
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

      {(links || repair) && (
        <div className="flex items-start justify-between gap-2 text-sm">
          <div>
            {links && describeLinks(links) && (
              <p className="text-muted-foreground">{describeLinks(links)}</p>
            )}
            {links?.problems.map((problem) => (
              <p key={problem} className="text-destructive">
                Links not rewritten: {problem}
              </p>
            ))}
            {repair &&
              describeRepair(repair).map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
            {repair?.problems.map((problem) => (
              <p key={problem} className="text-destructive">
                Links not repaired: {problem}
              </p>
            ))}
          </div>
          <Button variant="ghost" size="xs" onClick={dismissLinks}>
            Dismiss
          </Button>
        </div>
      )}

      {repositoryWatchError && (
        <p role="status" className="text-sm text-destructive">
          {describeRepositoryWatchError(repositoryWatchError)}
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

/** Opens a planning file other than a task in the editor (`S-make-task`). */
function SourceButton({
  label,
  path,
  onOpen,
}: {
  label: string;
  path: string;
  onOpen: (path: string) => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={() => onOpen(path)}>
      {label}
    </Button>
  );
}
