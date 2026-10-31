import { describe, expect, it } from "vitest";
import {
  closedRecent,
  EMPTY_WORKSPACE,
  neighbourTab,
  RECENT_LIMIT,
  recentFromSettings,
  routeOf,
  tabLabels,
  withoutTab,
  withRecent,
  withTab,
  workspaceFromSettings,
} from "./workspace";

describe("tabs", () => {
  it("adds a new tab at the end and shows an open one again", () => {
    const one = withTab(EMPTY_WORKSPACE, "/a");
    const two = withTab(one, "/b");
    expect(two).toEqual({ tabs: ["/a", "/b"], active: "/b" });
    expect(withTab(two, "/a")).toEqual({ tabs: ["/a", "/b"], active: "/a" });
  });

  it("shows the tab to the right of a closed shown tab, else the one to the left", () => {
    const workspace = { tabs: ["/a", "/b", "/c"], active: "/b" };
    expect(withoutTab(workspace, "/b")).toEqual({
      tabs: ["/a", "/c"],
      active: "/c",
    });
    expect(withoutTab({ ...workspace, active: "/c" }, "/c")).toEqual({
      tabs: ["/a", "/b"],
      active: "/b",
    });
    expect(withoutTab({ tabs: ["/a"], active: "/a" }, "/a")).toEqual(
      EMPTY_WORKSPACE,
    );
  });

  it("keeps the shown tab when another one closes", () => {
    expect(withoutTab({ tabs: ["/a", "/b"], active: "/b" }, "/a")).toEqual({
      tabs: ["/b"],
      active: "/b",
    });
    const unchanged = { tabs: ["/a"], active: "/a" };
    expect(withoutTab(unchanged, "/x")).toBe(unchanged);
  });

  it("steps to the next or previous tab, wrapping around", () => {
    const workspace = { tabs: ["/a", "/b", "/c"], active: "/c" };
    expect(neighbourTab(workspace, 1)).toBe("/a");
    expect(neighbourTab(workspace, -1)).toBe("/b");
    expect(neighbourTab({ tabs: ["/a"], active: "/a" }, 1)).toBe("/a");
    expect(neighbourTab(EMPTY_WORKSPACE, 1)).toBeNull();
  });
});

describe("recent projects", () => {
  it("puts the latest first, each once, at most the limit", () => {
    expect(withRecent(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => `/p${i}`);
    const recent = withRecent(many, "/new");
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe("/new");
    expect(recent).not.toContain(`/p${RECENT_LIMIT - 1}`);
  });

  it("lists only the recent projects without a tab", () => {
    expect(closedRecent(["/c", "/b", "/a"], ["/a", "/b"])).toEqual(["/c"]);
  });
});

describe("settings", () => {
  it("reads a saved workspace and drops what does not fit", () => {
    expect(
      workspaceFromSettings({ tabs: ["/a", "/b", "/a"], active: "/b" }, null),
    ).toEqual({ tabs: ["/a", "/b"], active: "/b" });
    expect(
      workspaceFromSettings({ tabs: ["/a"], active: "/gone" }, null),
    ).toEqual({ tabs: ["/a"], active: "/a" });
    expect(workspaceFromSettings({ tabs: [3] }, "/old")).toEqual(
      EMPTY_WORKSPACE,
    );
    expect(workspaceFromSettings({ tabs: [], active: null }, "/old")).toEqual(
      EMPTY_WORKSPACE,
    );
  });

  it("makes the repository remembered before tabs the one tab", () => {
    expect(workspaceFromSettings(undefined, "/old")).toEqual({
      tabs: ["/old"],
      active: "/old",
    });
    expect(workspaceFromSettings(undefined, undefined)).toEqual(
      EMPTY_WORKSPACE,
    );
  });

  it("seeds the recent projects with the open tabs when none are saved", () => {
    const workspace = { tabs: ["/a", "/b"], active: "/a" };
    expect(recentFromSettings(undefined, workspace)).toEqual(["/a", "/b"]);
    expect(recentFromSettings(["/c", "/c"], workspace)).toEqual(["/c"]);
  });
});

describe("tabLabels", () => {
  it("names a tab by its folder, with parents only to tell equal names apart", () => {
    expect(
      tabLabels([
        "/home/me/stardust",
        "/home/me/work/api",
        "/home/me/play/api",
        "C:\\code\\tool\\",
      ]),
    ).toEqual({
      "/home/me/stardust": "stardust",
      "/home/me/work/api": "work/api",
      "/home/me/play/api": "play/api",
      "C:\\code\\tool\\": "tool",
    });
    expect(tabLabels(["/"])).toEqual({ "/": "/" });
  });
});

describe("routeOf", () => {
  it("applies the shown project's changes, queues a loaded tab's and drops others", () => {
    const loaded = (root: string) => root === "/b";
    expect(routeOf("/a", "/a", loaded)).toBe("active");
    expect(routeOf("/b", "/a", loaded)).toBe("queued");
    expect(routeOf("/c", "/a", loaded)).toBe("ignored");
  });
});
