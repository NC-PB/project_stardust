import { Button } from "@/components/ui/button";
import {
  findingGroups,
  findingKey,
  findingPath,
  fixLabel,
  reportSummary,
} from "@/lib/doctor";
import { useDoctorStore } from "@/stores/doctor-store";
import { useEditorStore } from "@/stores/editor-store";

/** The doctor's findings for `repoRoot`, each opening its file at its line. */
export function DoctorPanel({ repoRoot }: { repoRoot: string }) {
  const state = useDoctorStore();
  const { propose, confirm, cancel, close } = state;
  const openFile = useEditorStore((editor) => editor.open);
  // Findings of a repository opened before are not shown.
  const current = state.repoRoot === repoRoot;
  const report = current ? state.report : null;
  if (report === null) return null;
  const pending = state.pending;

  return (
    <div
      role="status"
      className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border bg-card p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          {state.checking ? "Checking…" : reportSummary(report)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void state.check(repoRoot)}
          >
            Check again
          </Button>
          <Button variant="ghost" size="xs" onClick={close}>
            Close
          </Button>
        </div>
      </div>
      {state.notice && <p className="text-muted-foreground">{state.notice}</p>}
      {state.error && <p className="text-destructive">{state.error}</p>}
      {pending && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md bg-muted p-2"
        >
          <span>{fixLabel(pending)}?</span>
          <div className="flex gap-2">
            <Button size="xs" onClick={() => void confirm()}>
              Apply
            </Button>
            <Button variant="ghost" size="xs" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {findingGroups(report.findings).map((group) => (
        <div key={group.kind}>
          <p className="font-medium">
            {group.label} ({group.findings.length})
          </p>
          <ul className="flex flex-col gap-0.5 pl-2">
            {group.findings.map((finding) => (
              <li
                key={findingKey(finding)}
                className="flex flex-wrap items-baseline gap-x-2 py-0.5"
              >
                <button
                  type="button"
                  className="code-id min-w-0 text-left break-all hover:underline"
                  onClick={() =>
                    void openFile(
                      repoRoot,
                      findingPath(repoRoot, finding.file),
                      finding.line,
                    )
                  }
                  title="Opens the file at this line"
                >
                  {finding.file}:{finding.line}
                </button>
                <span className="order-last basis-full break-words text-muted-foreground">
                  {finding.message}
                </span>
                {finding.fix && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => finding.fix && propose(finding.fix)}
                    title={fixLabel(finding.fix)}
                  >
                    Fix…
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {report.problems.length > 0 && (
        <ul className="list-inside list-disc text-destructive">
          {report.problems.map((problem) => (
            <li key={problem}>Not checked: {problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
