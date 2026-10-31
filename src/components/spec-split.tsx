import { Button } from "@/components/ui/button";
import { useSplitStore } from "@/stores/split-store";

/** Starts a split of the single spec file into `spec/` with a preview (`S-spec-split`). */
export function SplitSpecButton({ repoRoot }: { repoRoot: string }) {
  const preview = useSplitStore((state) => state.preview);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void preview(repoRoot)}
      title="Moves each section of spec.md into its own file under spec/, after a preview"
    >
      Split spec
    </Button>
  );
}

/** The preview of a split, its confirmation, and what the split did, for `repoRoot`. */
export function SplitSpecPanel({ repoRoot }: { repoRoot: string }) {
  const split = useSplitStore();
  const { confirm, cancel, dismiss } = split;
  // A preview or report of a repository opened before is not shown.
  const current = split.repoRoot === repoRoot;
  const plan = current ? split.plan : null;
  const report = current ? split.report : null;
  const error = current ? split.error : null;
  const linkCount =
    plan?.links.reduce((sum, file) => sum + file.changes.length, 0) ?? 0;

  return (
    <>
      {plan && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/50 p-2 text-xs"
        >
          <p className="font-medium">
            Split {plan.location} into {plan.files.length} files under spec/
          </p>
          <ul className="flex flex-col gap-0.5">
            {plan.files.map((file) => (
              <li key={file.file} className="flex gap-2">
                <span className="font-mono">{file.file}</span>
                <span className="text-muted-foreground">
                  {file.lines} lines · {file.first_line}
                </span>
              </li>
            ))}
          </ul>
          {plan.links.length > 0 && (
            <div>
              <p className="font-medium">
                {linkCount} {linkCount === 1 ? "link" : "links"} rewritten
              </p>
              <ul className="flex flex-col gap-0.5">
                {plan.links.map((file) => (
                  <li key={file.file}>
                    <span className="font-mono">{file.file}</span>
                    <ul className="pl-4 text-muted-foreground">
                      {file.changes.map((change) => (
                        <li
                          key={`${change.line}:${change.old}`}
                          className="font-mono break-all"
                        >
                          {change.line}: {change.old} → {change.new}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.blockers.length > 0 ? (
            <ul className="list-inside list-disc text-destructive">
              {plan.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p>
              spec.md then goes to the trash; it can be restored from there.
            </p>
          )}
          <div className="flex gap-2">
            {plan.blockers.length === 0 && (
              <Button
                variant="destructive"
                size="xs"
                onClick={() => void confirm()}
              >
                Split
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {(report || error) && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 text-sm"
        >
          {report ? (
            <p className="text-muted-foreground">
              Spec split into {report.created.length} files under spec/
              {report.rewritten.length > 0 &&
                `; links rewritten in ${report.rewritten.join(", ")}`}
              {report.block_written.length > 0 &&
                `; planner block rewritten in ${report.block_written.join(", ")}`}
              ; spec.md is in the trash.
              {report.block_error &&
                ` The planner block could not be rewritten: ${report.block_error}`}
            </p>
          ) : (
            <p className="text-destructive">{error}</p>
          )}
          <Button variant="ghost" size="xs" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  );
}
