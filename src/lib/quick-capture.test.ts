import { describe, expect, it } from "vitest";
import {
  captureChoice,
  DEFAULT_HOTKEY,
  hasCapture,
  hotkeyFromSetting,
} from "./quick-capture";

describe("hotkeyFromSetting", () => {
  it("uses the default until a hotkey is set, and empty for off", () => {
    expect(hotkeyFromSetting(undefined)).toBe(DEFAULT_HOTKEY);
    expect(hotkeyFromSetting(3)).toBe(DEFAULT_HOTKEY);
    expect(hotkeyFromSetting(" Alt+KeyN ")).toBe("Alt+KeyN");
    expect(hotkeyFromSetting("")).toBe("");
  });
});

describe("captureChoice", () => {
  const workspace = { tabs: ["/a/one", "/b/two"], active: "/b/two" };

  it("offers the tabs, then the recent projects without a tab", () => {
    const choice = captureChoice(
      workspace,
      ["/b/two", "/c/three", "/a/one"],
      undefined,
      null,
    );
    expect(choice.projects).toEqual([
      { repoRoot: "/a/one", label: "one" },
      { repoRoot: "/b/two", label: "two" },
      { repoRoot: "/c/three", label: "three" },
    ]);
    expect(choice.chosen).toBe("/b/two");
  });

  it("keeps the project chosen last while it is offered", () => {
    expect(captureChoice(workspace, [], undefined, "/a/one").chosen).toBe(
      "/a/one",
    );
    expect(captureChoice(workspace, [], undefined, "/gone").chosen).toBe(
      "/b/two",
    );
  });

  it("tells projects with the same folder name apart", () => {
    const labels = captureChoice(
      { tabs: ["/x/app", "/y/app"], active: null },
      undefined,
      undefined,
      null,
    ).projects.map((project) => project.label);
    expect(new Set(labels).size).toBe(2);
  });

  it("offers nothing without projects, and the remembered repository before tabs", () => {
    expect(captureChoice(undefined, undefined, undefined, null)).toEqual({
      projects: [],
      chosen: null,
    });
    expect(captureChoice(undefined, undefined, "/old", null)).toEqual({
      projects: [{ repoRoot: "/old", label: "old" }],
      chosen: "/old",
    });
  });
});

describe("hasCapture", () => {
  it("needs more than whitespace", () => {
    expect(hasCapture(" \n ")).toBe(false);
    expect(hasCapture(" idea ")).toBe(true);
  });
});
