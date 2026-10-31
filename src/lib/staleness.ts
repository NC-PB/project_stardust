import type { Config, MissingCodePath, Spec } from "@/bindings";
import { type BoardColumn, columnDir, sortTasks } from "@/lib/board";
import { readyColumnOf } from "@/lib/session";

const DAY = 24 * 60 * 60 * 1000;

/** Why a file is flagged (`S-staleness`). */
export type StaleKind = "stale-task" | "unreviewed-spec" | "missing-path";

/** One staleness flag on a task or spec file. */
export interface StaleFlag {
  kind: StaleKind;
  /** Absolute path of the flagged file, as the editor and the board build it. */
  path: string;
  /** 1-based line the flag points at, `null` for the file as a whole. */
  line: number | null;
  /** The task id, `null` for spec files and tasks without one. */
  id: string | null;
  /** Why the file is flagged, in one sentence. */
  reason: string;
}

/** Everything the flags are computed from; all of it is already read by the stores. */
export interface StalenessInput {
  repoRoot: string;
  config: Config;
  columns: BoardColumn[];
  spec: Spec | null;
  /** From the `missing_code_paths` command. */
  missingPaths: MissingCodePath[];
  now: number;
}

/** The local calendar day of `time`, counted in days since 1970-01-01. */
function dayOf(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY;
}

/** The day of a `YYYY-MM-DD` date, counted like `dayOf`; `null` when it is not a real date. */
export function dateDay(date: string | null): number | null {
  const match = date === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const back = new Date(time);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day)
    return null;
  return time / DAY;
}

/** Whole days from `date` (`YYYY-MM-DD`) to the local day of `now`; `null` for no date. */
export function daysSince(date: string | null, now: number): number | null {
  const day = dateDay(date);
  return day === null ? null : dayOf(now) - day;
}

/**
 * Days since a task was last created or changed: the later of its `created` date and the local
 * day of its file time (`modified`). `null` when it has neither. A task cannot record when it
 * entered a column (D-20260920-093000-6f8e), so this is the closest age the files give.
 */
export function taskAge(
  created: string | null,
  modified: string | null,
  now: number,
): number | null {
  const time = modified === null ? Number.NaN : Date.parse(modified);
  const days = [
    dateDay(created),
    Number.isNaN(time) ? null : dayOf(time),
  ].filter((day): day is number => day !== null);
  return days.length === 0 ? null : dayOf(now) - Math.max(...days);
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** Tasks in the ready column whose age (`taskAge`) is above `stale_after_days`, in board order. */
export function staleTaskFlags(input: StalenessInput): StaleFlag[] {
  const { repoRoot, config, columns, now } = input;
  const ready = readyColumnOf(config.columns, config.terminal);
  const column = columns.find((candidate) => candidate.name === ready);
  if (column === undefined) return [];
  const dir = columnDir(repoRoot, config.planning_root, ready);
  return sortTasks(column.tasks).flatMap((task) => {
    const age = taskAge(task.created, task.modified, now);
    if (age === null || age <= config.stale_after_days) return [];
    return [
      {
        kind: "stale-task" as const,
        path: `${dir}/${task.file_name}`,
        line: null,
        id: task.id,
        reason: `In ${ready} and not created or changed for ${plural(age, "day")} (stale_after_days: ${config.stale_after_days}).`,
      },
    ];
  });
}

/**
 * Spec files whose `reviewed` date is more than `review_after_days` ago, in reading order. The
 * first file (`spec.md`, or `spec/README.md` in the folder form) is also flagged without a
 * readable `reviewed` date; any other file without its own `reviewed` is covered by the first
 * one and never flagged.
 */
export function unreviewedSpecFlags(input: StalenessInput): StaleFlag[] {
  const { repoRoot, config, spec, now } = input;
  if (spec === null || !spec.found) return [];
  return spec.files.flatMap((file, index) => {
    const reviewed = file.reviewed ?? null;
    const path = columnDir(repoRoot, config.planning_root, file.file);
    const flag = (reason: string): StaleFlag[] => [
      { kind: "unreviewed-spec", path, line: null, id: null, reason },
    ];
    if (reviewed === null)
      return index === 0 ? flag("No `reviewed` date in the frontmatter.") : [];
    const age = daysSince(reviewed, now);
    if (age === null)
      return flag(`The \`reviewed\` date "${reviewed}" is not a date.`);
    if (age <= config.review_after_days) return [];
    return flag(
      `Reviewed ${reviewed}, ${plural(age, "day")} ago (review_after_days: ${config.review_after_days}).`,
    );
  });
}

/** One flag per missing code path, at its line in the task file. */
export function missingPathFlags(input: StalenessInput): StaleFlag[] {
  const { repoRoot, config, columns, missingPaths } = input;
  const idOf = (column: string, fileName: string) =>
    columns
      .find((candidate) => candidate.name === column)
      ?.tasks.find((task) => task.file_name === fileName)?.id ?? null;
  return missingPaths.map((missing) => ({
    kind: "missing-path",
    path: `${columnDir(repoRoot, config.planning_root, missing.column)}/${missing.file_name}`,
    line: missing.line,
    id: idOf(missing.column, missing.file_name),
    reason: `Mentions \`${missing.path}\` (line ${missing.line}), which does not exist in the repository.`,
  }));
}

/**
 * Every staleness flag of the project (`S-staleness`): stale tasks in the ready column, spec
 * files due for review, then code paths in tasks that do not exist. Pure; the board, the
 * editor, the spec view and the Stale view all read this one list.
 */
export function stalenessFlags(input: StalenessInput): StaleFlag[] {
  return [
    ...staleTaskFlags(input),
    ...unreviewedSpecFlags(input),
    ...missingPathFlags(input),
  ];
}

/** The flags grouped by the absolute path of their file, each group in list order. */
export function flagsByPath(flags: StaleFlag[]): Map<string, StaleFlag[]> {
  const byPath = new Map<string, StaleFlag[]>();
  for (const flag of flags)
    byPath.set(flag.path, [...(byPath.get(flag.path) ?? []), flag]);
  return byPath;
}

/** A marker for one kind of flag on a card or file header. */
export interface StaleBadge {
  kind: StaleKind;
  /** Short text, such as "Stale" or "2 missing paths". */
  label: string;
  /** Every reason of that kind, one per line, for the hover text. */
  reasons: string;
}

/** The markers for the flags of one file: one per kind, in the order of `StaleKind`. */
export function badgesOf(flags: StaleFlag[]): StaleBadge[] {
  const kinds: StaleKind[] = ["stale-task", "unreviewed-spec", "missing-path"];
  return kinds.flatMap((kind) => {
    const ofKind = flags.filter((flag) => flag.kind === kind);
    if (ofKind.length === 0) return [];
    const label =
      kind === "stale-task"
        ? "Stale"
        : kind === "unreviewed-spec"
          ? "Review due"
          : ofKind.length === 1
            ? "Missing path"
            : `${ofKind.length} missing paths`;
    return [
      {
        kind,
        label,
        reasons: ofKind.map((flag) => flag.reason).join("\n"),
      },
    ];
  });
}

/** `path` relative to the repository root, for display; unchanged when it lies outside. */
export function repoRelative(repoRoot: string, path: string): string {
  const root = `${repoRoot.replace(/[\\/]+$/, "")}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
}
