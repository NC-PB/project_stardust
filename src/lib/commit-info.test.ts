import { describe, expect, it } from "vitest";
import { commitLabel, commitsById } from "./commit-info";

const commits = { id: "20261031-021023-31v3", count: 2, last: "2026-10-31" };

describe("commitsById", () => {
  it("indexes the tasks by id", () => {
    const byId = commitsById({ available: true, tasks: [commits] });
    expect(byId.get("20261031-021023-31v3")).toBe(commits);
    expect(byId.size).toBe(1);
  });

  it("is empty without git, outside a repository or before loading", () => {
    expect(commitsById({ available: false, tasks: [commits] }).size).toBe(0);
    expect(commitsById(null).size).toBe(0);
  });
});

describe("commitLabel", () => {
  it("shows the count and the date of the last commit", () => {
    expect(commitLabel(commits)?.label).toBe("2 commits · 2026-10-31");
    expect(commitLabel({ ...commits, count: 1 })?.label).toBe(
      "1 commit · 2026-10-31",
    );
    expect(commitLabel(commits)?.title).toContain("Information only");
  });

  it("shows nothing without commits", () => {
    expect(commitLabel(undefined)).toBeNull();
    expect(commitLabel({ ...commits, count: 0 })).toBeNull();
  });
});
