import { describe, expect, it } from "vitest";
import type { Task_Serialize } from "@/bindings";
import {
  bodyOf,
  clampLine,
  FORM_FIELDS,
  type FormField,
  fieldValueOf,
  fileNameOf,
  followFile,
  formValue,
  frontmatterLineCount,
  resolveLink,
} from "./editor";

const field = (key: string): FormField =>
  FORM_FIELDS.find((candidate) => candidate.key === key) as FormField;

describe("frontmatter", () => {
  const text = "---\nid: x\ntitle: A\n---\n\n## Description\n";

  it("is left out of the body read mode renders", () => {
    expect(bodyOf(text)).toBe("\n## Description\n");
    expect(bodyOf("---\r\ntitle: A\r\n---\r\nbody")).toBe("body");
    expect(bodyOf("no frontmatter\n---\n")).toBe("no frontmatter\n---\n");
  });

  it("counts its lines with both fences", () => {
    expect(frontmatterLineCount(text)).toBe(4);
    expect(frontmatterLineCount("---\n---\n")).toBe(2);
    expect(frontmatterLineCount("---\nid: x\n---")).toBe(3);
    expect(frontmatterLineCount("# Title\n")).toBe(0);
    expect(frontmatterLineCount("---\nnever closed\n")).toBe(0);
  });
});

describe("form fields", () => {
  const task = {
    title: "A",
    tags: ["x", "y"],
    priority: 2,
    completed: null,
  } as unknown as Task_Serialize;

  it("show lists comma separated and missing values empty", () => {
    expect(formValue(task, field("tags"))).toBe("x, y");
    expect(formValue(task, field("priority"))).toBe("2");
    expect(formValue(task, field("completed"))).toBe("");
  });

  it("turn input into field values", () => {
    expect(fieldValueOf(field("tags"), " a, b ,, ")).toEqual({
      value: { List: ["a", "b"] },
    });
    expect(fieldValueOf(field("tags"), "")).toEqual({ value: { List: [] } });
    expect(fieldValueOf(field("title"), " New ")).toEqual({
      value: { Text: "New" },
    });
    expect(fieldValueOf(field("priority"), "3")).toEqual({
      value: { Number: 3 },
    });
    expect(fieldValueOf(field("completed"), "")).toEqual({ value: null });
  });

  it("refuse input the task reader would report", () => {
    expect(fieldValueOf(field("title"), " ")).toHaveProperty("error");
    expect(fieldValueOf(field("priority"), "6")).toHaveProperty("error");
    expect(fieldValueOf(field("priority"), "1.5")).toHaveProperty("error");
    expect(fieldValueOf(field("created"), "30.10.2026")).toHaveProperty(
      "error",
    );
  });
});

describe("followFile", () => {
  const path = "/repo/docs/planning/next/a.md";

  it("follows a move and notices a removal", () => {
    expect(
      followFile(path, "/repo", {
        config_changed: false,
        changes: [
          {
            kind: "moved",
            id: "a",
            from: "docs/planning/next/a.md",
            to: "docs/planning/done/a.md",
          },
        ],
      }),
    ).toBe("/repo/docs/planning/done/a.md");
    expect(
      followFile(path, "/repo/", {
        config_changed: false,
        changes: [{ kind: "removed", path: "docs/planning/next/a.md" }],
      }),
    ).toBeNull();
  });

  it("ignores changes to other files", () => {
    expect(
      followFile(path, "/repo", {
        config_changed: false,
        changes: [{ kind: "modified", path: "docs/planning/next/a.md" }],
      }),
    ).toBeUndefined();
  });
});

describe("resolveLink", () => {
  const from = "/repo/docs/planning/next/a.md";

  it("resolves relative links to markdown files", () => {
    expect(resolveLink(from, "../spec.md#structure")).toBe(
      "/repo/docs/planning/spec.md",
    );
    expect(resolveLink(from, "./b%20c.md")).toBe(
      "/repo/docs/planning/next/b c.md",
    );
    expect(resolveLink("C:\\repo\\a.md", "b.md")).toBe("C:/repo/b.md");
  });

  it("leaves anchors, URLs and other files alone", () => {
    for (const href of [
      "#top",
      "https://example.com/a.md",
      "/abs.md",
      "img.png",
    ])
      expect(resolveLink(from, href)).toBeNull();
  });

  it("names files by their last path part", () => {
    expect(fileNameOf("C:\\repo\\a.md")).toBe("a.md");
    expect(fileNameOf("/repo/b.md")).toBe("b.md");
  });
});

describe("clampLine", () => {
  it("keeps a line inside the text", () => {
    expect(clampLine(3, 10)).toBe(3);
    expect(clampLine(0, 10)).toBe(1);
    expect(clampLine(12, 10)).toBe(10);
    expect(clampLine(5, 0)).toBe(1);
  });
});
