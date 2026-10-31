import { Button } from "@/components/ui/button";
import {
  findingGroups,
  findingKey,
  findingPath,
  fixLabel,
  reportSummary,
} from "@/lib/doctor";
import { runCommand } from "@/stores/command-store";
import { useDoctorStore } from "@/stores/doctor-store";
import { useEditorStore } from "@/stores/editor-store";

/** Runs the doctor over the planning files (`S-doctor`). */
export function DoctorButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => runCommand("project.doctor")}
      title="Checks ids, links, images, frontmatter and trace of the planning files"
    >
      Doctor
    </Button>
  );
}

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
      className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border p-2 text-xs"
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
                className="flex items-baseline gap-2"
              >
                <button
                  type="button"
                  className="shrink-0 font-mono text-left hover:underline"
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
                <span className="min-w-0 flex-1 break-words text-muted-foreground">
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
