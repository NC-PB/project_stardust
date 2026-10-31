import { describe, expect, it } from "vitest";
import {
  clampPaneWidth,
  PANE_DEFAULT_WIDTH,
  PANE_MIN_WIDTH,
  PANE_STEP,
  paneContent,
  paneWidthForKey,
  paneWidthFromSetting,
} from "./layout";

describe("clampPaneWidth", () => {
  it("keeps the pane between the minimum and 70 % of the window", () => {
    expect(clampPaneWidth(100, 1400)).toBe(PANE_MIN_WIDTH);
    expect(clampPaneWidth(600, 1400)).toBe(600);
    expect(clampPaneWidth(1300, 1400)).toBe(980);
  });

  it("never goes under the minimum in a narrow window", () => {
    expect(clampPaneWidth(500, 300)).toBe(PANE_MIN_WIDTH);
  });
});

describe("paneWidthFromSetting", () => {
  it("takes a positive number and falls back to the default otherwise", () => {
    expect(paneWidthFromSetting(612.4)).toBe(612);
    expect(paneWidthFromSetting(undefined)).toBe(PANE_DEFAULT_WIDTH);
    expect(paneWidthFromSetting("600")).toBe(PANE_DEFAULT_WIDTH);
    expect(paneWidthFromSetting(-5)).toBe(PANE_DEFAULT_WIDTH);
    expect(paneWidthFromSetting(Number.NaN)).toBe(PANE_DEFAULT_WIDTH);
  });
});

describe("paneWidthForKey", () => {
  it("widens with left, narrows with right, jumps with Home and End", () => {
    expect(paneWidthForKey("ArrowLeft", 500, 1400)).toBe(500 + PANE_STEP);
    expect(paneWidthForKey("ArrowRight", 500, 1400)).toBe(500 - PANE_STEP);
    expect(paneWidthForKey("Home", 500, 1400)).toBe(980);
    expect(paneWidthForKey("End", 500, 1400)).toBe(PANE_MIN_WIDTH);
    expect(paneWidthForKey("a", 500, 1400)).toBeNull();
  });
});

describe("paneContent", () => {
  const base = {
    filePath: null,
    repoRoot: "/repo",
    hiddenFor: null,
    over: false,
  };

  it("shows the session brief while no file is open", () => {
    expect(paneContent(base)).toBe("session");
  });

  it("shows nothing when the brief is hidden for this project and no file is open", () => {
    expect(paneContent({ ...base, hiddenFor: "/repo" })).toBe("none");
    expect(paneContent({ ...base, hiddenFor: "/other" })).toBe("session");
  });

  it("shows the open file, or the brief when it was asked for over it", () => {
    expect(paneContent({ ...base, filePath: "/repo/a.md" })).toBe("editor");
    expect(paneContent({ ...base, filePath: "/repo/a.md", over: true })).toBe(
      "session",
    );
    expect(
      paneContent({
        ...base,
        filePath: "/repo/a.md",
        hiddenFor: "/repo",
        over: true,
      }),
    ).toBe("session");
  });

  it("has no brief without a project", () => {
    expect(paneContent({ ...base, repoRoot: null })).toBe("none");
    expect(paneContent({ ...base, repoRoot: null, filePath: "/a.md" })).toBe(
      "editor",
    );
  });
});
