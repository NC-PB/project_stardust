/** Changelog draft helpers (`S-changelog`); the draft itself is built in Rust. */

import type { Since } from "@/bindings";

/** Whether the changelog starts at a date or at a git tag. */
export type SinceMode = "date" | "tag";

/** The `Since` for the current inputs, or `null` while the chosen input is empty. */
export function sinceOf(
  mode: SinceMode,
  date: string,
  tag: string,
): Since | null {
  if (mode === "date") {
    const value = date.trim();
    return value === "" ? null : { kind: "date", date: value };
  }
  const value = tag.trim();
  return value === "" ? null : { kind: "tag", tag: value };
}

/** How many entries the draft groups hold. */
export function entryCount(groups: { entries: unknown[] }[]): number {
  return groups.reduce((sum, group) => sum + group.entries.length, 0);
}

/** "1 entry" or "n entries". */
export function entriesLabel(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}
