import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { settleInTab, snapshots } from "./tab-snapshots";

interface Panel {
  repoRoot: string | null;
  checking: boolean;
  count: number;
}

const panel = createStore<Panel>()(() => ({
  repoRoot: null,
  checking: false,
  count: 0,
}));

describe("settleInTab", () => {
  beforeEach(() => {
    snapshots.clear();
    panel.setState({ repoRoot: null, checking: false, count: 0 });
  });

  it("writes into the live store while its tab is shown", () => {
    panel.setState({ repoRoot: "/a", checking: true });
    expect(settleInTab(panel, "/a", { checking: false })).toBe(true);
    expect(panel.getState().checking).toBe(false);
  });

  it("writes into the hidden tab's snapshot and leaves the shown tab alone", () => {
    const kept = { repoRoot: "/a", checking: true, count: 1 };
    snapshots.set("/a", new Map([[panel, kept]]));
    panel.setState({ repoRoot: "/b", checking: true, count: 5 });

    expect(
      settleInTab(panel, "/a", (state) => ({
        checking: false,
        count: state.count + 1,
      })),
    ).toBe(true);
    expect(snapshots.get("/a")?.get(panel)).toEqual({
      repoRoot: "/a",
      checking: false,
      count: 2,
    });
    expect(panel.getState()).toEqual({
      repoRoot: "/b",
      checking: true,
      count: 5,
    });
  });

  it("writes into both while a tab is being hidden", () => {
    const state = { repoRoot: "/a", checking: true, count: 0 };
    panel.setState(state, true);
    snapshots.set("/a", new Map([[panel, state]]));
    settleInTab(panel, "/a", { checking: false });
    expect(panel.getState().checking).toBe(false);
    expect(snapshots.get("/a")?.get(panel)).toMatchObject({ checking: false });
  });

  it("drops the answer of a closed tab or a store that moved on to another project", () => {
    panel.setState({ repoRoot: "/b" });
    expect(settleInTab(panel, "/a", { checking: false })).toBe(false);
    snapshots.set(
      "/a",
      new Map([[panel, { repoRoot: null, checking: true, count: 0 }]]),
    );
    expect(settleInTab(panel, "/a", { checking: false })).toBe(false);
    expect(snapshots.get("/a")?.get(panel)).toMatchObject({ checking: true });
  });
});
