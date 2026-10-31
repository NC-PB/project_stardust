import type { StoreApi } from "zustand";

/** The states of the project stores of one hidden tab, by store. */
export type Snapshot = Map<unknown, object>;

/**
 * The tabs loaded this session but not shown, by repository root, with their stores' states
 * (`S-multi-project`). Kept by `useWorkspaceStore`; a tab's entry exists from when it is hidden
 * until it is shown again, and is removed in the same step as its states are put back.
 */
export const snapshots = new Map<string, Snapshot>();

type Update<S> = Partial<S> | ((state: S) => Partial<S>);

/**
 * Writes the answer of work started in the tab of `repoRoot` into that tab's state of `store`,
 * whether the tab is shown (the live store) or hidden (its snapshot), so an answer arriving
 * after a switch is shown when the tab is shown again (D-20261031-063321-ns0a). A state counts
 * as the tab's only while its own `repoRoot` is `repoRoot`. Returns whether the answer landed;
 * not when the tab was closed or the store has moved on to another project.
 */
export function settleInTab<S extends { repoRoot: string | null }>(
  store: StoreApi<S>,
  repoRoot: string,
  update: Update<S>,
): boolean {
  let landed = false;
  const snapshot = snapshots.get(repoRoot);
  const kept = snapshot?.get(store) as S | undefined;
  if (snapshot !== undefined && kept?.repoRoot === repoRoot) {
    const partial = typeof update === "function" ? update(kept) : update;
    snapshot.set(store, { ...kept, ...partial });
    landed = true;
  }
  // While a tab is being hidden its states are both kept and live; both get the answer.
  if (store.getState().repoRoot === repoRoot) {
    store.setState(update);
    landed = true;
  }
  return landed;
}
