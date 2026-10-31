import { Button } from "@/components/ui/button";
import { useGitattributesStore } from "@/stores/gitattributes-store";

/** Previews the `merge=union` lines for the questions and decisions files (`S-gitattributes`). */
export function GitattributesButton({ repoRoot }: { repoRoot: string }) {
  const preview = useGitattributesStore((state) => state.preview);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void preview(repoRoot)}
      title="Lets git keep both sides when two branches append questions or decisions, after a preview"
    >
      Git attributes
    </Button>
  );
}

/** The preview of the lines, their confirmation, and what was written, for `repoRoot`. */
export function GitattributesPanel({ repoRoot }: { repoRoot: string }) {
  const state = useGitattributesStore();
  const { confirm, cancel, dismiss } = state;
  // A preview or report of a repository opened before is not shown.
  const current = state.repoRoot === repoRoot;
  const plan = current ? state.plan : null;
  const report = current ? state.report : null;
  const error = current ? state.error : null;
  const canAdd =
    plan !== null && plan.blockers.length === 0 && plan.missing.length > 0;

  return (
    <>
      {plan && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border p-2 text-xs"
        >
          <p className="font-medium">
            {plan.missing.length > 0
              ? `${plan.exists ? "Add to" : "Create"} .gitattributes`
              : ".gitattributes needs no new lines"}
          </p>
          <LineList title="Lines to add" lines={plan.missing} />
          <LineList title="Already there" lines={plan.present} />
          <LineList
            title="Another merge setting, left as it is"
            lines={plan.conflicting}
          />
          {plan.form === "file" && plan.missing.length > 0 && (
            <p className="text-destructive">
              The spec is a single file, so all of spec.md merges by union: when
              two branches change the same lines of the Structure, the Glossary
              or any other section, git keeps both versions without a conflict,
              and the duplicate lines have to be found by hand. Split the spec
              to limit this to questions and decisions.
            </p>
          )}
          {plan.blockers.length > 0 && (
            <ul className="list-inside list-disc text-destructive">
              {plan.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {canAdd && (
            <p className="text-muted-foreground">
              Only the lines are added; the rest of the file stays as it is.
              Nothing is committed.
            </p>
          )}
          <div className="flex gap-2">
            {canAdd && (
              <Button size="xs" onClick={() => void confirm()}>
                Add lines
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={cancel}>
              {canAdd ? "Cancel" : "Close"}
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
              {report.created ? "Created" : "Added to"} .gitattributes:{" "}
              {report.added.length}{" "}
              {report.added.length === 1 ? "line" : "lines"}. Commit it with
              your next change.
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

function LineList({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="flex flex-col gap-0.5 pl-4 text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="font-mono break-all">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
