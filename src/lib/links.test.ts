import { describe, expect, it } from "vitest";
import type { LinkCandidate_Serialize } from "@/bindings";
import {
  backlinkPath,
  backlinksLabel,
  linkInsertion,
  linkQueryAt,
  matchCandidates,
  mergeCandidates,
  relativeLink,
  repoRelative,
} from "./links";

/** `text` with `|` marking the cursor, and the query found there. */
function at(marked: string) {
  const pos = marked.indexOf("|");
  return linkQueryAt(marked.replace("|", ""), pos);
}

const TASK: LinkCandidate_Serialize = {
  path: "docs/planning/next/20261031-000001-aaaa-board-sort.md",
  title: "Board sort",
  id: "20261031-000001-aaaa",
};
const SPEC: LinkCandidate_Serialize = {
  path: "docs/planning/spec.md",
  title: "Specification",
  id: null,
};
const NOTE: LinkCandidate_Serialize = {
  path: "docs/planning/notes/my notes (draft).md",
  title: "Sorting [notes]",
  id: null,
};

describe("linkQueryAt", () => {
  it("finds a target after `](`", () => {
    expect(at("See [the spec](sp|)")).toEqual({
      kind: "target",
      query: "sp",
      from: 15,
      to: 17,
    });
    expect(at("See [x](|")).toMatchObject({ kind: "target", query: "" });
  });

  it("finds a new link after `[[`, taking a closed `]]` with it", () => {
    expect(at("Do [[board s|]] next")).toEqual({
      kind: "new",
      query: "board s",
      from: 3,
      to: 14,
    });
    expect(at("[[|")).toEqual({ kind: "new", query: "", from: 0, to: 2 });
  });

  it("finds nothing outside links", () => {
    expect(at("plain text|")).toBeNull();
    expect(at("[x](done.md) and more|")).toBeNull();
    expect(at("- [ ] task|")).toBeNull();
    expect(at("[x](a b|")).toBeNull();
  });

  it("finds nothing in frontmatter, fences or code spans", () => {
    expect(at("---\ntitle: [[x|\n---\n")).toBeNull();
    expect(at("---\ntitle: a\n---\n\n```\n[[x|\n```\n")).toBeNull();
    expect(at("`[[x|`")).toBeNull();
    expect(at("```\ncode\n```\n[[x|")).toMatchObject({ kind: "new" });
    expect(at("`a` [[x|")).toMatchObject({ kind: "new" });
  });
});

describe("matchCandidates", () => {
  const all = [SPEC, NOTE, TASK];

  it("matches every word in title, id or path, ignoring case", () => {
    expect(matchCandidates(all, "SORT board", null)).toEqual([TASK]);
    expect(matchCandidates(all, "20261031-000001", null)).toEqual([TASK]);
    expect(matchCandidates(all, "notes/", null)).toEqual([NOTE]);
  });

  it("puts ids and titles starting with the query first, then by title", () => {
    expect(matchCandidates(all, "sort", null)).toEqual([NOTE, TASK]);
    expect(matchCandidates(all, "", null)).toEqual([TASK, NOTE, SPEC]);
  });

  it("leaves out the open file and keeps to the limit", () => {
    expect(matchCandidates(all, "", SPEC.path)).toEqual([TASK, NOTE]);
    expect(matchCandidates(all, "", null, 1)).toEqual([TASK]);
  });
});

describe("relativeLink", () => {
  it("climbs out of the file's folder as needed", () => {
    expect(relativeLink("docs/planning/inbox/a.md", TASK.path)).toBe(
      "../next/20261031-000001-aaaa-board-sort.md",
    );
    expect(relativeLink("docs/planning/braindump.md", SPEC.path)).toBe(
      "spec.md",
    );
    expect(relativeLink("README.md", SPEC.path)).toBe("docs/planning/spec.md");
    expect(relativeLink(SPEC.path, "README.md")).toBe("../../README.md");
    expect(relativeLink("docs/planning/spec.md", "docs/planning.md")).toBe(
      "../planning.md",
    );
  });

  it("escapes what a bare target cannot hold", () => {
    expect(relativeLink("docs/planning/spec.md", NOTE.path)).toBe(
      "notes/my%20notes%20%28draft%29.md",
    );
  });
});

describe("linkInsertion", () => {
  it("inserts the path for a target and a whole link for `[[`", () => {
    const from = "docs/planning/spec.md";
    expect(
      linkInsertion({ kind: "target", query: "", from: 0, to: 0 }, TASK, from),
    ).toBe("next/20261031-000001-aaaa-board-sort.md");
    expect(
      linkInsertion({ kind: "new", query: "", from: 0, to: 0 }, NOTE, from),
    ).toBe("[Sorting \\[notes\\]](notes/my%20notes%20%28draft%29.md)");
  });
});

describe("paths and labels", () => {
  it("makes paths relative to the repository and back", () => {
    expect(repoRelative("/repo/", "/repo/docs/a.md")).toBe("docs/a.md");
    expect(repoRelative("C:\\repo", "C:\\repo\\docs\\a.md")).toBe("docs/a.md");
    expect(repoRelative("/repo", "/other/a.md")).toBeNull();
    expect(
      backlinkPath("/repo/", { file: "docs/a.md", title: "A", lines: [3] }),
    ).toBe("/repo/docs/a.md");
  });

  it("counts the files", () => {
    expect(backlinksLabel(0)).toBe("No files link here");
    expect(backlinksLabel(1)).toBe("Linked from 1 file");
    expect(backlinksLabel(2)).toBe("Linked from 2 files");
  });
});

describe("mergeCandidates", () => {
  it("sorts the files inside and outside the planning root by path, each once", () => {
    const readme = { path: "README.md", title: "README", id: null };
    const spec = { path: "docs/planning/spec.md", title: "Spec", id: null };
    const guide = { path: "docs/guide.md", title: "Guide", id: null };
    const stale = { ...spec, title: "Old" };
    expect(mergeCandidates([spec], [guide, readme, stale])).toEqual([
      readme,
      guide,
      spec,
    ]);
  });
});
