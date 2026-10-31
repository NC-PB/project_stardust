import { beforeEach, describe, expect, it, vi } from "vitest";

const planGitattributes = vi.fn();
const addGitattributes = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    planGitattributes: (...args: unknown[]) => planGitattributes(...args),
    addGitattributes: (...args: unknown[]) => addGitattributes(...args),
  },
}));

import { useGitattributesStore } from "./gitattributes-store";

const plan = (missing: string[], blockers: string[] = []) => ({
  form: "folder",
  exists: true,
  missing,
  present: [],
  conflicting: [],
  blockers,
});

const lines = [
  "docs/planning/spec/questions.md merge=union",
  "docs/planning/spec/decisions.md merge=union",
];

describe("useGitattributesStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitattributesStore.setState({
      repoRoot: null,
      plan: null,
      report: null,
      error: null,
    });
  });

  it("previews, then writes exactly the previewed lines", async () => {
    planGitattributes.mockResolvedValue(plan(lines));
    addGitattributes.mockResolvedValue({
      status: "ok",
      data: { added: lines, created: false },
    });

    await useGitattributesStore.getState().preview("/repo");
    expect(planGitattributes).toHaveBeenCalledWith("/repo");
    expect(useGitattributesStore.getState().plan).toEqual(plan(lines));
    expect(addGitattributes).not.toHaveBeenCalled();

    await useGitattributesStore.getState().confirm();
    expect(addGitattributes).toHaveBeenCalledWith("/repo", lines);
    expect(useGitattributesStore.getState().plan).toBeNull();
    expect(useGitattributesStore.getState().report).toEqual({
      added: lines,
      created: false,
    });
  });

  it("writes nothing when the preview has blockers or nothing is missing", async () => {
    planGitattributes.mockResolvedValue(plan(lines, ["not UTF-8"]));
    await useGitattributesStore.getState().preview("/repo");
    await useGitattributesStore.getState().confirm();

    planGitattributes.mockResolvedValue(plan([]));
    await useGitattributesStore.getState().preview("/repo");
    await useGitattributesStore.getState().confirm();

    expect(addGitattributes).not.toHaveBeenCalled();
  });

  it("shows a refusal and drops the preview", async () => {
    planGitattributes.mockResolvedValue(plan(lines));
    addGitattributes.mockResolvedValue({
      status: "error",
      error: "changed since the preview; preview again",
    });
    await useGitattributesStore.getState().preview("/repo");
    await useGitattributesStore.getState().confirm();
    expect(useGitattributesStore.getState().plan).toBeNull();
    expect(useGitattributesStore.getState().error).toBe(
      ".gitattributes not changed: changed since the preview; preview again",
    );
  });

  it("ignores a preview for a repository no longer current", async () => {
    let resolve: (value: unknown) => void = () => {};
    planGitattributes.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = useGitattributesStore.getState().preview("/old");
    planGitattributes.mockResolvedValueOnce(plan(lines));
    await useGitattributesStore.getState().preview("/repo");
    resolve(plan(["old"]));
    await first;
    expect(useGitattributesStore.getState().plan).toEqual(plan(lines));
  });
});
