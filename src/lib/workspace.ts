/**
 * The workspace (`S-multi-project`): the repositories open as tabs, the active one, and the
 * recent projects of the start screen. Pure functions; the store keeps them in the app settings.
 */

/** How many recent projects the start screen lists. */
export const RECENT_LIMIT = 10;

/** The open projects by repository root, in tab order, and the one shown. */
export interface Workspace {
  tabs: string[];
  /** One of `tabs`, or `null` when none is open (the start screen). */
  active: string | null;
}

export const EMPTY_WORKSPACE: Workspace = { tabs: [], active: null };

/** The workspace with `repoRoot` open and shown; a new tab goes to the end. */
export function withTab(workspace: Workspace, repoRoot: string): Workspace {
  const tabs = workspace.tabs.includes(repoRoot)
    ? workspace.tabs
    : [...workspace.tabs, repoRoot];
  return { tabs, active: repoRoot };
}

/**
 * The workspace without the tab of `repoRoot`. Closing the shown tab shows the one to its
 * right, or else the one to its left; closing another tab keeps the shown one.
 */
export function withoutTab(workspace: Workspace, repoRoot: string): Workspace {
  const index = workspace.tabs.indexOf(repoRoot);
  if (index === -1) return workspace;
  const tabs = workspace.tabs.filter((tab) => tab !== repoRoot);
  if (workspace.active !== repoRoot) return { tabs, active: workspace.active };
  return { tabs, active: tabs[Math.min(index, tabs.length - 1)] ?? null };
}

/** The tab `step` places after (or, negative, before) the shown one, wrapping around. */
export function neighbourTab(
  workspace: Workspace,
  step: number,
): string | null {
  const { tabs, active } = workspace;
  if (tabs.length === 0) return null;
  const index = active === null ? 0 : tabs.indexOf(active);
  const next = (((index + step) % tabs.length) + tabs.length) % tabs.length;
  return tabs[next];
}

/** The recent projects with `repoRoot` first, each once, at most `limit`. */
export function withRecent(
  recent: readonly string[],
  repoRoot: string,
  limit: number = RECENT_LIMIT,
): string[] {
  return [repoRoot, ...recent.filter((root) => root !== repoRoot)].slice(
    0,
    limit,
  );
}

/** The recent projects that have no open tab, most recent first. */
export function closedRecent(
  recent: readonly string[],
  tabs: readonly string[],
): string[] {
  return recent.filter((root) => !tabs.includes(root));
}

const isRoots = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string" && item !== "");

/**
 * The workspace kept in the settings, checked: tabs are distinct non-empty paths and the
 * shown one is a tab. Without a saved workspace, the repository the app remembered before
 * there were tabs (`legacyRoot`) is the one tab.
 */
export function workspaceFromSettings(
  saved: unknown,
  legacyRoot: unknown,
): Workspace {
  if (typeof saved === "object" && saved !== null && "tabs" in saved) {
    const { tabs, active } = saved as { tabs: unknown; active?: unknown };
    if (!isRoots(tabs)) return EMPTY_WORKSPACE;
    const unique = [...new Set(tabs)];
    const shown =
      typeof active === "string" && unique.includes(active)
        ? active
        : (unique[0] ?? null);
    return { tabs: unique, active: shown };
  }
  if (typeof legacyRoot === "string" && legacyRoot !== "")
    return { tabs: [legacyRoot], active: legacyRoot };
  return EMPTY_WORKSPACE;
}

/** The recent projects kept in the settings, checked; seeded with the open tabs when missing. */
export function recentFromSettings(
  saved: unknown,
  workspace: Workspace,
): string[] {
  const recent = isRoots(saved) ? saved : [...workspace.tabs];
  return [...new Set(recent)].slice(0, RECENT_LIMIT);
}

/** The path split into its folder names, for either separator. */
function segmentsOf(repoRoot: string): string[] {
  return repoRoot.split(/[\\/]+/).filter((segment) => segment !== "");
}

/**
 * Tab labels by repository root: the folder name, or as many parent folders as needed to
 * tell two tabs with the same folder name apart.
 */
export function tabLabels(tabs: readonly string[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const root of tabs) {
    const segments = segmentsOf(root);
    let depth = 1;
    const label = (path: string[], count: number) =>
      path.slice(-count).join("/");
    while (
      depth < segments.length &&
      tabs.some(
        (other) =>
          other !== root &&
          label(segmentsOf(other), depth) === label(segments, depth),
      )
    )
      depth += 1;
    labels[root] = label(segments, depth) || root;
  }
  return labels;
}

/** Where a change on disk for `repoRoot` goes (`S-multi-project`). */
export type ChangeRoute = "active" | "queued" | "ignored";

/**
 * A change of the shown project is applied at once; one of another loaded tab waits until
 * that tab is shown again; anything else (a tab closed meanwhile) is dropped.
 */
export function routeOf(
  repoRoot: string,
  active: string | null,
  loaded: (repoRoot: string) => boolean,
): ChangeRoute {
  if (repoRoot === active) return "active";
  return loaded(repoRoot) ? "queued" : "ignored";
}
