import { describe, expect, it } from "vitest";
import {
  BRAINDUMP_PROMPTS,
  editorPromptsOf,
  nodeInputOf,
  TASK_PROMPTS,
  taskPathOf,
} from "./prompts";

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

describe("editorPromptsOf", () => {
  it("offers the task prompts for a task, filled with its path", () => {
    expect(
      editorPromptsOf(
        "/repo/docs/planning/next/a.md",
        "/repo",
        "docs/planning",
        columns,
      ),
    ).toEqual({
      prompts: TASK_PROMPTS,
      input: { task_path: "docs/planning/next/a.md", node_id: null },
    });
  });

  it("offers Structure this for the braindump of the planning root", () => {
    expect(
      editorPromptsOf(
        "/repo/docs/planning/braindump.md",
        "/repo",
        "docs/planning",
        columns,
      ),
    ).toEqual({
      prompts: BRAINDUMP_PROMPTS,
      input: { task_path: null, node_id: null },
    });
    expect(
      editorPromptsOf(
        "C:\\repo\\plan\\braindump.md",
        "C:\\repo\\",
        "/plan/",
        columns,
      )?.prompts,
    ).toEqual(["structure-this"]);
  });

  it("offers nothing for other files", () => {
    for (const path of [
      "/repo/docs/planning/spec.md",
      "/repo/docs/planning/notes/braindump.md",
      "/repo/braindump.md",
      "/other/docs/planning/braindump.md",
    ])
      expect(
        editorPromptsOf(path, "/repo", "docs/planning", columns),
      ).toBeNull();
  });
});

describe("nodeInputOf", () => {
  it("fills only the node", () => {
    expect(nodeInputOf("S-board")).toEqual({
      task_path: null,
      node_id: "S-board",
    });
  });
});
