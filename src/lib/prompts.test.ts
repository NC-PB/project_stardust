import { describe, expect, it } from "vitest";
import { taskPathOf } from "./prompts";

const columns = ["inbox", "next", "done"];

describe("taskPathOf", () => {
  it("gives the path of a task file relative to the repository", () => {
    expect(
      taskPathOf(
        "/repo/docs/planning/next/a.md",
        "/repo/",
        "docs/planning",
        columns,
      ),
    ).toBe("docs/planning/next/a.md");
    expect(
      taskPathOf("C:\\repo\\plan\\done\\b.md", "C:\\repo", "plan/", columns),
    ).toBe("plan/done/b.md");
  });

  it("is null for files that are not tasks", () => {
    for (const path of [
      "/repo/docs/planning/braindump.md",
      "/repo/docs/planning/spec.md",
      "/repo/docs/planning/notes/phases.md",
      "/repo/docs/planning/done/2026-10/a.md",
      "/repo/docs/planning/next/image.png",
      "/other/docs/planning/next/a.md",
    ])
      expect(taskPathOf(path, "/repo", "docs/planning", columns)).toBeNull();
  });
});
