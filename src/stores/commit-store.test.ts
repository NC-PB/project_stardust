import { beforeEach, describe, expect, it, vi } from "vitest";

const commitInfo = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    commitInfo: (...args: [string]) => commitInfo(...args),
  },
}));

import { useCommitStore } from "./commit-store";

const commits = { id: "20261031-021023-31v3", count: 2, last: "2026-10-31" };
const info = { available: true, reason: null, tasks: [commits] };

describe("useCommitStore", () => {
  beforeEach(() => {
    commitInfo.mockReset();
    useCommitStore.getState().clear();
  });

  it("loads the commit info by id; a newer load wins over an older one", async () => {
    let first: (value: unknown) => void = () => {};
    commitInfo.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    commitInfo.mockResolvedValueOnce(info);
    const older = useCommitStore.getState().load("/repo");
    await useCommitStore.getState().load("/repo");
    first({ available: true, reason: null, tasks: [] });
    await older;
    expect(useCommitStore.getState().byId.get(commits.id)).toEqual(commits);
  });

  it("shows nothing when git cannot be read", async () => {
    commitInfo.mockResolvedValue({
      available: false,
      reason: "not a git repository",
      tasks: [],
    });
    await useCommitStore.getState().load("/repo");
    expect(useCommitStore.getState().byId.size).toBe(0);
  });

  it("reads again on window focus while a project is open, and stops when asked", async () => {
    commitInfo.mockResolvedValue(info);
    const target = new EventTarget();
    const stop = useCommitStore.getState().refreshOnFocus(target);
    target.dispatchEvent(new Event("focus"));
    expect(commitInfo).not.toHaveBeenCalled();

    await useCommitStore.getState().load("/repo");
    target.dispatchEvent(new Event("focus"));
    expect(commitInfo).toHaveBeenCalledTimes(2);
    expect(commitInfo).toHaveBeenLastCalledWith("/repo");

    stop();
    target.dispatchEvent(new Event("focus"));
    expect(commitInfo).toHaveBeenCalledTimes(2);
  });

  it("drops an answer that arrives after a clear", async () => {
    let answer: (value: unknown) => void = () => {};
    commitInfo.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const loading = useCommitStore.getState().load("/repo");
    useCommitStore.getState().clear();
    answer(info);
    await loading;
    expect(useCommitStore.getState().byId.size).toBe(0);
  });
});
