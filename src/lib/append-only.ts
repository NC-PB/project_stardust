import type { AppendOnlyViolation_Serialize } from "@/bindings";

/** Why an edit of the spec was not saved (`S-decisions`, `R-append-only`). */
export const APPEND_ONLY_EXPLANATION =
  'Not saved: Questions and Decisions only grow (R-append-only). Add new entries; existing ones can only be answered or get a "Superseded by" line.';

/** One refused entry with the line to find it at: where it is now, or where it was. */
export function violationText(
  violation: AppendOnlyViolation_Serialize,
): string {
  const where =
    violation.now === null
      ? `was at line ${violation.at.line}`
      : `line ${violation.now}`;
  return `${violation.message} (${where})`;
}
