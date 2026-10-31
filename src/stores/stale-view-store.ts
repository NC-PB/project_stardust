import { create } from "zustand";
import { commands, type DoctorReport_Serialize, events } from "@/bindings";

/** Changes arrive in bursts; the doctor runs once this long after the last one. */
export const RECHECK_DELAY_MS = 1000;

interface StaleViewState {
  repoRoot: string | null;
  /** The doctor's last report for the Stale view; `null` until the first check is back. */
  report: DoctorReport_Serialize | null;
  /** Whether a check is running. */
  checking: boolean;
  /** When the last report was taken. */
  checkedAt: number | null;
  /** Runs the doctor for the Stale view (`S-staleness`); a newer check wins over an older one. */
  check: (repoRoot: string) => Promise<void>;
  /**
   * Checks now, then again after every planning batch and every outside change to markdown
   * files, while the view is shown. Returns the function that stops following.
   */
  follow: (repoRoot: string) => () => void;
}

/** Counts checks so an older answer never replaces a newer one. */
let sent = 0;

/**
 * The doctor's findings for the Stale view. Kept apart from the doctor panel's snapshot
 * (`useDoctorStore`): this one follows changes on disk while the view is open.
 */
export const useStaleViewStore = create<StaleViewState>()((set, get) => ({
  repoRoot: null,
  report: null,
  checking: false,
  checkedAt: null,

  check: async (repoRoot) => {
    sent += 1;
    const mine = sent;
    if (get().repoRoot !== repoRoot)
      set({ repoRoot, report: null, checkedAt: null });
    set({ checking: true });
    const report = await commands.doctor(repoRoot);
    if (mine === sent && get().repoRoot === repoRoot)
      set({ report, checking: false, checkedAt: Date.now() });
  },

  follow: (repoRoot) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => {
      if (stopped) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!stopped) void get().check(repoRoot);
      }, RECHECK_DELAY_MS);
    };
    const unlisten = [
      events.planningChanged.listen((event) => {
        if (event.payload.repo_root === repoRoot) later();
      }),
      events.repositoryChanged.listen((event) => {
        if (
          event.payload.repo_root === repoRoot &&
          event.payload.change.markdown
        )
          later();
      }),
    ];
    void get().check(repoRoot);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      for (const stop of unlisten) void stop.then((fn) => fn());
    };
  },
}));
