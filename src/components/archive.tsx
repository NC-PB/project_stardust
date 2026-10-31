import { Button } from "@/components/ui/button";
import { movesByMonth, tasksLabel } from "@/lib/archive";
import { useArchiveStore } from "@/stores/archive-store";
import { runCommand } from "@/stores/command-store";

/** Previews which finished tasks move into month folders (`S-archive`). */
export function ArchiveButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => runCommand("project.archive")}
      title="Moves finished tasks of earlier months into month folders, after a preview"
    >
      Archive
    </Button>
  );
}

/** The preview of the moves, their confirmation, and what was moved, for `repoRoot`. */
export function ArchivePanel({ repoRoot }: { repoRoot: string }) {
  const state = useArchiveStore();
  const { confirm, cancel, dismiss } = state;
  // A preview or report of a repository opened before is not shown.
  const current = state.repoRoot === repoRoot;
  const plan = current ? state.plan : null;
  const report = current ? state.report : null;
  const error = current ? state.error : null;
  const canMove =
    plan !== null && plan.blockers.length === 0 && plan.moves.length > 0;

  return (
    <>
      {plan && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border p-2 text-xs"
        >
          <p className="font-medium">
            {plan.moves.length > 0
              ? `Archive ${tasksLabel(plan.moves.length)} finished before ${plan.current_month}`
              : `Nothing finished before ${plan.current_month} to archive`}
          </p>
          {movesByMonth(plan.moves).map((group) => (
            <div key={group.month}>
              <p className="font-medium">
                {plan.column}/{group.month}/
              </p>
              <ul className="flex flex-col gap-0.5 pl-4 text-muted-foreground">
                {group.moves.map((move) => (
                  <li key={move.file_name} className="break-all">
                    {move.title}{" "}
                    <span className="font-mono">({move.completed})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {plan.kept > 0 && (
            <p className="text-muted-foreground">
              {tasksLabel(plan.kept)} finished in {plan.current_month} or later
              stay in {plan.column}/.
            </p>
          )}
          {plan.skipped.length > 0 && (
            <div>
              <p className="font-medium">Left in place</p>
              <ul className="flex flex-col gap-0.5 pl-4 text-muted-foreground">
                {plan.skipped.map((skip) => (
                  <li key={skip.file_name} className="break-all">
                    <span className="font-mono">{skip.file_name}</span>:{" "}
                    {skip.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.blockers.length > 0 && (
            <ul className="list-inside list-disc text-destructive">
              {plan.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {canMove && (
            <p className="text-muted-foreground">
              The files keep their text; links to them are rewritten. Archived
              tasks leave the board and stay searchable. Nothing is committed.
            </p>
          )}
          <div className="flex gap-2">
            {canMove && (
              <Button size="xs" onClick={() => void confirm()}>
                Move {tasksLabel(plan.moves.length)}
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={cancel}>
              {canMove ? "Cancel" : "Close"}
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
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground">
                Archived {tasksLabel(report.moved.length)}.
              </p>
              {report.failed.length > 0 && (
                <ul className="text-destructive">
                  {report.failed.map((failure) => (
                    <li key={failure.file_name} className="break-all">
                      Not moved: {failure.file_name}: {failure.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
