import { beforeEach, describe, expect, it, vi } from "vitest";

const planArchive = vi.fn();
const archiveTasks = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    planArchive: (...args: unknown[]) => planArchive(...args),
    archiveTasks: (...args: unknown[]) => archiveTasks(...args),
  },
}));

import { useArchiveStore } from "./archive-store";

const move = (file_name: string) => ({
  file_name,
  id: null,
  title: file_name,
  completed: "2026-09-01",
  month: "2026-09",
  from: `docs/planning/done/${file_name}`,
  to: `docs/planning/done/2026-09/${file_name}`,
});

const plan = (files: string[], blockers: string[] = []) => ({
  column: "docs/planning/done",
  current_month: "2026-10",
  moves: files.map(move),
  kept: 0,
  skipped: [],
  blockers,
});

describe("useArchiveStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useArchiveStore.setState({
      repoRoot: null,
      plan: null,
      report: null,
      error: null,
    });
  });

  it("previews, then moves exactly the previewed tasks", async () => {
    planArchive.mockResolvedValue(plan(["a.md", "b.md"]));
    archiveTasks.mockResolvedValue({
      status: "ok",
      data: { moved: [move("a.md"), move("b.md")], failed: [] },
    });

    await useArchiveStore.getState().preview("/repo");
    expect(planArchive).toHaveBeenCalledWith("/repo");
    expect(useArchiveStore.getState().plan).toEqual(plan(["a.md", "b.md"]));
    expect(archiveTasks).not.toHaveBeenCalled();

    await useArchiveStore.getState().confirm();
    expect(archiveTasks).toHaveBeenCalledWith("/repo", ["a.md", "b.md"]);
    expect(useArchiveStore.getState().plan).toBeNull();
    expect(useArchiveStore.getState().report?.moved).toHaveLength(2);
  });

  it("moves nothing when the preview has blockers or nothing to move", async () => {
    planArchive.mockResolvedValue(plan(["a.md"], ["Cannot read the column"]));
    await useArchiveStore.getState().preview("/repo");
    await useArchiveStore.getState().confirm();

    planArchive.mockResolvedValue(plan([]));
    await useArchiveStore.getState().preview("/repo");
    await useArchiveStore.getState().confirm();

    expect(archiveTasks).not.toHaveBeenCalled();
  });

  it("shows a refusal and drops the preview", async () => {
    planArchive.mockResolvedValue(plan(["a.md"]));
    archiveTasks.mockResolvedValue({
      status: "error",
      error: "changed since the preview; preview again",
    });
    await useArchiveStore.getState().preview("/repo");
    await useArchiveStore.getState().confirm();
    expect(useArchiveStore.getState().plan).toBeNull();
    expect(useArchiveStore.getState().error).toBe(
      "Nothing archived: changed since the preview; preview again",
    );
  });

  it("ignores a preview for a repository no longer current", async () => {
    let resolve: (value: unknown) => void = () => {};
    planArchive.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = useArchiveStore.getState().preview("/old");
    planArchive.mockResolvedValueOnce(plan(["a.md"]));
    await useArchiveStore.getState().preview("/repo");
    resolve(plan(["old.md"]));
    await first;
    expect(useArchiveStore.getState().plan).toEqual(plan(["a.md"]));
  });
});
