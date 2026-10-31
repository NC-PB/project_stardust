import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;
const { doctor, listeners, unlistened, listenTo } = vi.hoisted(() => {
  const listeners: Record<string, Listener[]> = {};
  const unlistened: string[] = [];
  const listenTo = (name: string) => (callback: Listener) => {
    listeners[name] = [...(listeners[name] ?? []), callback];
    return Promise.resolve(() => {
      unlistened.push(name);
      listeners[name] = (listeners[name] ?? []).filter((cb) => cb !== callback);
    });
  };
  return { doctor: vi.fn(), listeners, unlistened, listenTo };
});

vi.mock("@/bindings", () => ({
  commands: { doctor: (...args: unknown[]) => doctor(...args) },
  events: {
    planningChanged: { listen: listenTo("planning") },
    repositoryChanged: { listen: listenTo("repository") },
  },
}));

import { RECHECK_DELAY_MS, useStaleViewStore } from "./stale-view-store";

const report = (count: number) => ({
  findings: Array.from({ length: count }, (_, i) => ({
    kind: "broken_link" as const,
    file: `docs/planning/next/${i}.md`,
    line: 2,
    message: "m",
    fix: null,
  })),
  task_files: 3,
  problems: [],
});

const emit = (name: string, payload: unknown) => {
  for (const callback of listeners[name] ?? []) callback({ payload });
};

/** Lets the pending promises settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("useStaleViewStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    doctor.mockReset();
    doctor.mockImplementation(async () => report(1));
    for (const name of Object.keys(listeners)) delete listeners[name];
    unlistened.length = 0;
    useStaleViewStore.setState({
      repoRoot: null,
      report: null,
      checking: false,
      checkedAt: null,
    });
  });

  afterEach(() => vi.useRealTimers());

  it("checks when following starts", async () => {
    const stop = useStaleViewStore.getState().follow("/repo");
    await settle();
    expect(doctor).toHaveBeenCalledWith("/repo");
    const state = useStaleViewStore.getState();
    expect(state.report?.findings).toHaveLength(1);
    expect(state.checking).toBe(false);
    expect(state.checkedAt).not.toBeNull();
    stop();
  });

  it("checks again once after a burst of planning batches", async () => {
    const stop = useStaleViewStore.getState().follow("/repo");
    await settle();
    doctor.mockImplementation(async () => report(3));
    emit("planning", {});
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS / 2);
    emit("planning", {});
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS / 2);
    expect(doctor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS);
    expect(doctor).toHaveBeenCalledTimes(2);
    expect(useStaleViewStore.getState().report?.findings).toHaveLength(3);
    stop();
  });

  it("checks again after outside changes to markdown files only", async () => {
    const stop = useStaleViewStore.getState().follow("/repo");
    await settle();
    emit("repository", {
      change: { files_added_or_removed: true, markdown: false },
    });
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS * 2);
    expect(doctor).toHaveBeenCalledTimes(1);
    emit("repository", {
      change: { files_added_or_removed: false, markdown: true },
    });
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS * 2);
    expect(doctor).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops listening and drops a pending check when stopped", async () => {
    const stop = useStaleViewStore.getState().follow("/repo");
    await settle();
    emit("planning", {});
    stop();
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS * 2);
    expect(doctor).toHaveBeenCalledTimes(1);
    expect(unlistened.sort()).toEqual(["planning", "repository"]);
  });

  it("keeps the newest answer and forgets another repository's report", async () => {
    let first: (value: unknown) => void = () => {};
    doctor.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    doctor.mockResolvedValueOnce(report(2));
    const older = useStaleViewStore.getState().check("/repo");
    await useStaleViewStore.getState().check("/repo");
    first(report(5));
    await older;
    expect(useStaleViewStore.getState().report?.findings).toHaveLength(2);

    doctor.mockReturnValueOnce(new Promise(() => {}));
    void useStaleViewStore.getState().check("/other");
    expect(useStaleViewStore.getState().repoRoot).toBe("/other");
    expect(useStaleViewStore.getState().report).toBeNull();
    expect(useStaleViewStore.getState().checking).toBe(true);
  });
});
