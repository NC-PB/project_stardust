import { describe, expect, it } from "vitest";
import type { Finding_Serialize } from "@/bindings";
import {
  findingGroups,
  findingKey,
  findingPath,
  fixLabel,
  fixResult,
  reportSummary,
} from "./doctor";

const finding = (
  kind: Finding_Serialize["kind"],
  file: string,
  line = 1,
): Finding_Serialize => ({ kind, file, line, message: "m", fix: null });

describe("doctor helpers", () => {
  it("groups findings by kind in the report's order", () => {
    const groups = findingGroups([
      finding("duplicate_id", "a.md"),
      finding("duplicate_id", "b.md"),
      finding("broken_link", "a.md", 9),
      finding("dependency_error", "b.md", 5),
      finding("parent_error", "b.md", 6),
      finding("untraced", "c.md"),
    ]);
    expect(groups.map((g) => [g.label, g.findings.length])).toEqual([
      ["Duplicate ids", 2],
      ["Broken links", 1],
      ["Dependency errors", 1],
      ["Parent errors", 1],
      ["Untraced tasks", 1],
    ]);
    expect(findingGroups([])).toEqual([]);
  });

  it("sums up a report", () => {
    expect(reportSummary({ findings: [], task_files: 240, problems: [] })).toBe(
      "No findings in 240 task files and their links.",
    );
    expect(
      reportSummary({
        findings: [finding("untraced", "a.md")],
        task_files: 1,
        problems: [],
      }),
    ).toBe("1 finding in 1 task file and their links.");
  });

  it("says what a fix will do and what it did", () => {
    expect(
      fixLabel({ kind: "set_id", file: "docs/planning/next/a.md", id: "x" }),
    ).toBe("Write id x into the frontmatter of a.md");
    expect(
      fixLabel({
        kind: "rename",
        file: "docs/planning/inbox/loose.md",
        to: "x-loose.md",
        id: "x",
      }),
    ).toContain("Rename loose.md to x-loose.md");
    expect(fixLabel({ kind: "repair_links", file: "README.md" })).toContain(
      "README.md",
    );
    expect(
      fixLabel({
        kind: "remove_dependency",
        file: "docs/planning/next/x-self.md",
        id: "x",
      }),
    ).toBe("Remove x, the task's own id, from depends_on of x-self.md");
    expect(
      fixResult({ file: "a.md", links: { rewritten: [], problems: [] } }),
    ).toBe("Fixed a.md.");
    expect(
      fixResult({
        file: "b.md",
        links: {
          rewritten: [
            {
              file: "c.md",
              changes: [
                { line: 1, old: "a", new: "b" },
                { line: 2, old: "a", new: "b" },
              ],
            },
          ],
          problems: [],
        },
      }),
    ).toBe("Fixed b.md; 2 links in 1 file rewritten.");
  });

  it("builds keys and paths", () => {
    expect(findingKey(finding("untraced", "a.md", 5))).toBe(
      "untraced:a.md:5:m",
    );
    expect(findingPath("/repo/", "docs/a.md")).toBe("/repo/docs/a.md");
  });
});
