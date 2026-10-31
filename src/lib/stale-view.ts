/**
 * The Stale view (`S-staleness`): one list of everything flagged as stale, blocked or broken,
 * combined from the staleness flags, the board's blocked markers and the doctor's findings.
 * Nothing is computed again here; each source keeps its own rules.
 */

import type { Config, Finding_Serialize, FindingKind } from "@/bindings";
import { type BoardColumn, cardsOf, columnDir } from "@/lib/board";
import { findingKey, findingPath } from "@/lib/doctor";
import { repoRelative, type StaleFlag, type StaleKind } from "@/lib/staleness";

/** The three parts of the list, in this order. */
export type StaleGroup = "stale" | "blocked" | "broken";

/** One line of the Stale view: a file and why it is listed. */
export interface StaleEntry {
  group: StaleGroup;
  kind: StaleKind | "blocked" | FindingKind;
  /** Short name of the kind, such as "Stale" or "Broken link". */
  label: string;
  /** Absolute path of the file, as the editor opens it. */
  path: string;
  /** 1-based line to open at, `null` for the top of the file. */
  line: number | null;
  /** The task's title, `null` for files that are not tasks of the board. */
  title: string | null;
  /** The path relative to the repository root, with `:line` when there is one. */
  location: string;
  /** Why the file is listed, in one sentence. */
  reason: string;
  /** Unique within the list. */
  key: string;
}

export interface StaleViewInput {
  repoRoot: string;
  config: Config;
  columns: BoardColumn[];
  /** From `stalenessFlags`. */
  flags: StaleFlag[];
  /** The doctor's findings; `null` while not checked yet. */
  findings: Finding_Serialize[] | null;
  now: number;
}

const FLAG_LABELS: Record<StaleKind, string> = {
  "stale-task": "Stale",
  "unreviewed-spec": "Review due",
  "missing-path": "Missing path",
};

/** The name of one finding of each kind (the doctor panel's headings are plural). */
export const FINDING_LABELS: Record<FindingKind, string> = {
  duplicate_id: "Duplicate id",
  missing_id: "Missing id",
  id_mismatch: "Id mismatch",
  broken_link: "Broken link",
  missing_image: "Missing image",
  frontmatter_error: "Frontmatter error",
  dependency_error: "Dependency error",
  untraced: "Untraced",
};

export const GROUP_LABELS: Record<StaleGroup, string> = {
  stale: "Stale",
  blocked: "Blocked",
  broken: "Broken",
};

/** The titles of the board's tasks by the absolute path of their file. */
function titlesByPath(
  repoRoot: string,
  config: Config,
  columns: BoardColumn[],
): Map<string, string> {
  const titles = new Map<string, string>();
  for (const column of columns) {
    const dir = columnDir(repoRoot, config.planning_root, column.name);
    for (const task of column.tasks)
      titles.set(`${dir}/${task.file_name}`, task.title);
  }
  return titles;
}

function location(repoRoot: string, path: string, line: number | null) {
  const relative = repoRelative(repoRoot, path);
  return line === null ? relative : `${relative}:${line}`;
}

/**
 * Tasks outside the terminal column with a dependency that blocks, as the board's cards mark
 * them (`cardsOf`, `S-dependencies`), in board order. A finished task is not listed: nothing
 * waits on it any more.
 */
export function blockedEntries(input: StaleViewInput): StaleEntry[] {
  const { repoRoot, config, columns, now } = input;
  const columnOf = new Map<string, string>();
  for (const column of columns)
    for (const task of column.tasks)
      if (task.id !== null) columnOf.set(task.id, column.name);
  const cards = cardsOf(columns, config.terminal, null, now);
  return columns.flatMap((column) => {
    if (column.name === config.terminal) return [];
    const dir = columnDir(repoRoot, config.planning_root, column.name);
    return (cards.get(column.name) ?? []).flatMap((card) => {
      if (card.blockedBy.length === 0) return [];
      const path = `${dir}/${card.key}`;
      const waits = card.blockedBy
        .map((id) => `${id} (in ${columnOf.get(id)})`)
        .join(", ");
      return [
        {
          group: "blocked" as const,
          kind: "blocked" as const,
          label: "Blocked",
          path,
          line: null,
          title: card.title,
          location: location(repoRoot, path, null),
          reason: `Depends on ${waits}, not yet in ${config.terminal}.`,
          key: `blocked:${path}`,
        },
      ];
    });
  });
}

/**
 * Every entry of the Stale view: the staleness flags in their order, then blocked tasks, then
 * the doctor's findings in the report's order (kind, file, line).
 */
export function staleViewEntries(input: StaleViewInput): StaleEntry[] {
  const { repoRoot, config, columns, flags, findings } = input;
  const titles = titlesByPath(repoRoot, config, columns);
  const stale = flags.map(
    (flag): StaleEntry => ({
      group: "stale",
      kind: flag.kind,
      label: FLAG_LABELS[flag.kind],
      path: flag.path,
      line: flag.line,
      title: titles.get(flag.path) ?? null,
      location: location(repoRoot, flag.path, flag.line),
      reason: flag.reason,
      key: `${flag.kind}:${flag.path}:${flag.line}:${flag.reason}`,
    }),
  );
  const broken = (findings ?? []).map((finding): StaleEntry => {
    const path = findingPath(repoRoot, finding.file);
    return {
      group: "broken",
      kind: finding.kind,
      label: FINDING_LABELS[finding.kind],
      path,
      line: finding.line,
      title: titles.get(path) ?? null,
      location: `${finding.file}:${finding.line}`,
      reason: finding.message,
      key: findingKey(finding),
    };
  });
  return [...stale, ...blockedEntries(input), ...broken];
}

/** The entries split into the three groups, each kept in list order; empty groups included. */
export function staleGroups(
  entries: StaleEntry[],
): { group: StaleGroup; label: string; entries: StaleEntry[] }[] {
  return (["stale", "blocked", "broken"] as const).map((group) => ({
    group,
    label: GROUP_LABELS[group],
    entries: entries.filter((entry) => entry.group === group),
  }));
}

/** One line on the whole list, such as "3 stale, 1 blocked, 2 broken". */
export function staleSummary(entries: StaleEntry[]): string {
  if (entries.length === 0) return "Nothing is stale, blocked or broken.";
  return staleGroups(entries)
    .map(({ group, entries: list }) => `${list.length} ${group}`)
    .join(", ");
}
