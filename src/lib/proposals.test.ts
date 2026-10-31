import { describe, expect, it } from "vitest";
import { findProposals, resolveProposal } from "./proposals";

const file = [
  "---",
  "title: A",
  "---",
  "",
  "## Description",
  "Intro.",
  "",
  "> **Proposal:** Rename the board to kanban.",
  "> It reads better.",
  "",
  "> A plain quote.",
  "> **Proposal:** not at the start",
  "",
  "Outro.",
  "",
].join("\n");

describe("findProposals", () => {
  it("finds blockquotes that start with the label", () => {
    expect(findProposals(file)).toEqual([{ start: 8, end: 9 }]);
  });

  it("finds indented proposals under list items and spans blank quote lines", () => {
    const text = "- item\n  > **Proposal:** a\n  >\n  > b\n- next\n";
    expect(findProposals(text)).toEqual([{ start: 2, end: 4 }]);
  });

  it("ignores code fences, the frontmatter and nested quotes", () => {
    const text = [
      "---",
      "> **Proposal:** in frontmatter",
      "---",
      "```md",
      "> **Proposal:** in a fence",
      "```",
      "~~~~",
      "```",
      "> **Proposal:** still in the tilde fence",
      "~~~~",
      "> > **Proposal:** nested",
      "",
      "> **Proposal:** real",
    ].join("\n");
    expect(findProposals(text)).toEqual([{ start: 13, end: 13 }]);
  });

  it("finds nothing in empty text", () => {
    expect(findProposals("")).toEqual([]);
  });
});

describe("resolveProposal", () => {
  it("accept unwraps the quote and drops the label; nothing else changes", () => {
    expect(resolveProposal(file, 8, "accept")).toBe(
      file.replace(
        "> **Proposal:** Rename the board to kanban.\n> It reads better.",
        "Rename the board to kanban.\nIt reads better.",
      ),
    );
  });

  it("reject removes the block and the blank line after it", () => {
    expect(resolveProposal(file, 8, "reject")).toBe(
      file.replace(
        "> **Proposal:** Rename the board to kanban.\n> It reads better.\n\n",
        "",
      ),
    );
  });

  it("reject at the end of the file removes the blank line before it", () => {
    expect(resolveProposal("a\n\n> **Proposal:** x\n", 3, "reject")).toBe(
      "a\n",
    );
    expect(resolveProposal("a\n\n> **Proposal:** x", 3, "reject")).toBe("a\n");
    expect(resolveProposal("a\n> **Proposal:** x\nb", 2, "reject")).toBe(
      "a\nb",
    );
  });

  it("accept keeps indentation, blank quote lines and line endings", () => {
    expect(
      resolveProposal(
        "- item\r\n  > **Proposal:** a\r\n  >\r\n  > b\r\n",
        2,
        "accept",
      ),
    ).toBe("- item\r\n  a\r\n\r\n  b\r\n");
  });

  it("accept drops a label alone on its line and the blank lines after it", () => {
    expect(
      resolveProposal(
        "> **Proposal:**\n>\n> New text.\n> - a list",
        1,
        "accept",
      ),
    ).toBe("New text.\n- a list");
  });

  it("returns null when no proposal starts at the line", () => {
    expect(resolveProposal(file, 9, "accept")).toBeNull();
    expect(resolveProposal(file, 11, "reject")).toBeNull();
  });
});
