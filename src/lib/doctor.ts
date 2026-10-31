/** Doctor helpers (`S-doctor`); the findings and the fixes are made in Rust. */

import type {
  DoctorFix,
  DoctorReport_Serialize,
  Finding_Serialize,
  FindingKind,
  FixReport,
} from "@/bindings";

/** The heading of each kind of finding, in the order Rust lists them. */
export const KIND_LABELS: Record<FindingKind, string> = {
  duplicate_id: "Duplicate ids",
  missing_id: "Missing ids",
  id_mismatch: "Id mismatches",
  broken_link: "Broken links",
  missing_image: "Missing images",
  frontmatter_error: "Frontmatter errors",
  dependency_error: "Dependency errors",
  parent_error: "Parent errors",
  untraced: "Untraced tasks",
};

/** The findings grouped by kind, keeping the report's order. */
export function findingGroups(
  findings: Finding_Serialize[],
): { kind: FindingKind; label: string; findings: Finding_Serialize[] }[] {
  const groups: {
    kind: FindingKind;
    label: string;
    findings: Finding_Serialize[];
  }[] = [];
  for (const finding of findings) {
    const last = groups[groups.length - 1];
    if (last?.kind === finding.kind) last.findings.push(finding);
    else
      groups.push({
        kind: finding.kind,
        label: KIND_LABELS[finding.kind],
        findings: [finding],
      });
  }
  return groups;
}

/** One line on the whole report. */
export function reportSummary(report: DoctorReport_Serialize): string {
  const files = `${report.task_files} task ${report.task_files === 1 ? "file" : "files"}`;
  const count = report.findings.length;
  if (count === 0) return `No findings in ${files} and their links.`;
  return `${count} ${count === 1 ? "finding" : "findings"} in ${files} and their links.`;
}

/** What a fix will do, said before it is confirmed. */
export function fixLabel(fix: DoctorFix): string {
  switch (fix.kind) {
    case "set_id":
      return `Write id ${fix.id} into the frontmatter of ${fileName(fix.file)}`;
    case "rename":
      return `Rename ${fileName(fix.file)} to ${fix.to} and write its id into the frontmatter; links to it follow`;
    case "repair_links":
      return `Repair the broken links of ${fileName(fix.file)} by the task id in their target`;
    case "remove_dependency":
      return `Remove ${fix.id}, the task's own id, from depends_on of ${fileName(fix.file)}`;
  }
}

/** What an applied fix did. */
export function fixResult(report: FixReport): string {
  const files = report.links.rewritten.length;
  const links = report.links.rewritten.reduce(
    (sum, file) => sum + file.changes.length,
    0,
  );
  const fixed = `Fixed ${report.file}`;
  if (links === 0) return `${fixed}.`;
  return `${fixed}; ${links} ${links === 1 ? "link" : "links"} in ${files} ${files === 1 ? "file" : "files"} rewritten.`;
}

/** A stable key for a finding in a list. */
export function findingKey(finding: Finding_Serialize): string {
  return `${finding.kind}:${finding.file}:${finding.line}:${finding.message}`;
}

/** The absolute path of `file`, relative to the repository at `repoRoot`. */
export function findingPath(repoRoot: string, file: string): string {
  return `${repoRoot.replace(/[\\/]+$/, "")}/${file}`;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
