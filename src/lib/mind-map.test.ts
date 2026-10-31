import { describe, expect, it } from "vitest";
import type { Node, Spec } from "@/bindings";
import {
  escapeHtml,
  MIND_MAP_LABEL,
  mindMapStyle,
  mindMapTree,
  nodeState,
  sourceLineOf,
} from "./mind-map";

const node = (fields: Partial<Node> & { line: number }): Node => ({
  id: null,
  title: "",
  ticked: null,
  later: false,
  blocking_question: null,
  criteria: [],
  rules: [],
  children: [],
  at: { file: "spec.md", line: fields.line },
  end_line: fields.line,
  ...fields,
});

const spec = (structure: Node[], withSection = true): Spec =>
  ({
    sections: withSection
      ? [
          {
            kind: "structure",
            heading: "Structure",
            at: { file: "spec/structure.md", line: 1 },
            end_line: 20,
          },
        ]
      : [],
    structure,
  }) as unknown as Spec;

describe("mindMapTree", () => {
  it("puts the areas under a root named after the Structure section", () => {
    const tree = mindMapTree(
      spec([
        node({ title: "Planning", line: 3 }),
        node({ title: "Files", line: 9 }),
      ]),
    );
    expect(tree.payload).toEqual({
      id: null,
      state: "area",
      later: false,
      at: { file: "spec/structure.md", line: 1 },
    });
    expect(tree.content).toContain("Structure");
    expect(tree.children.map((child) => child.payload.at?.line)).toEqual([
      3, 9,
    ]);
  });

  it("labels nodes with title and id and keeps where they start", () => {
    const tree = mindMapTree(
      spec([
        node({
          title: "Planning",
          line: 3,
          children: [
            node({ title: "Board ", id: "S-board", ticked: true, line: 4 }),
          ],
        }),
      ]),
    );
    const board = tree.children[0]?.children[0];
    expect(board?.payload).toEqual({
      id: "S-board",
      state: "ticked",
      later: false,
      at: { file: "spec.md", line: 4 },
    });
    expect(board?.content).toBe(
      `<span class="${MIND_MAP_LABEL} mind-map-ticked" data-file="spec.md" data-line="4">Board <code>S-board</code></span>`,
    );
  });

  it("marks unticked and #later nodes", () => {
    const tree = mindMapTree(
      spec([
        node({
          title: "Ideation",
          line: 3,
          children: [
            node({ title: "Gate", id: "S-gate", ticked: false, line: 4 }),
            node({
              title: "Sync",
              id: "S-sync",
              ticked: false,
              later: true,
              line: 5,
            }),
          ],
        }),
      ]),
    );
    const [gate, sync] = tree.children[0]?.children ?? [];
    expect(gate?.payload.state).toBe("unticked");
    expect(gate?.content).toContain("mind-map-unticked");
    expect(sync?.payload.later).toBe(true);
    expect(sync?.content).toContain("mind-map-later");
    expect(sync?.content).toContain("#later");
  });

  it("escapes text from the spec", () => {
    const tree = mindMapTree(
      spec([node({ title: `<b>"x" & 'y'</b>`, line: 3 })]),
    );
    expect(tree.children[0]?.content).toContain(
      "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
    );
    expect(tree.children[0]?.content).not.toContain("<b>");
  });

  it("works without a Structure section", () => {
    const tree = mindMapTree(spec([], false));
    expect(tree.payload.at).toBeNull();
    expect(tree.content).not.toContain("data-line");
    expect(tree.children).toEqual([]);
  });
});

describe("nodeState", () => {
  it("shows top-level nodes as areas unless unticked", () => {
    expect(nodeState(node({ line: 1 }), 0)).toBe("area");
    expect(nodeState(node({ ticked: true, line: 1 }), 0)).toBe("area");
    expect(nodeState(node({ ticked: false, line: 1 }), 0)).toBe("unticked");
  });

  it("counts deeper nodes without a tick as unticked", () => {
    expect(nodeState(node({ ticked: true, line: 1 }), 1)).toBe("ticked");
    expect(nodeState(node({ ticked: false, line: 1 }), 1)).toBe("unticked");
    expect(nodeState(node({ ticked: null, line: 1 }), 2)).toBe("unticked");
  });
});

describe("sourceLineOf", () => {
  it("reads file and line", () => {
    expect(sourceLineOf({ file: "spec.md", line: "12" })).toEqual({
      file: "spec.md",
      line: 12,
    });
  });

  it("returns null without a valid spot", () => {
    expect(sourceLineOf({})).toBeNull();
    expect(sourceLineOf({ file: "spec.md" })).toBeNull();
    expect(sourceLineOf({ file: "spec.md", line: "x" })).toBeNull();
    expect(sourceLineOf({ file: "spec.md", line: "0" })).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("leaves plain text alone", () => {
    expect(escapeHtml("Board: columns")).toBe("Board: columns");
  });
});

describe("mindMapStyle", () => {
  it("is scoped to the Markmap id and greys out unticked labels", () => {
    const css = mindMapStyle("mm-1");
    expect(css).toContain(".mm-1{");
    expect(css).toContain(".mm-1 .mind-map-unticked{");
    expect(css).toContain("var(--foreground)");
  });
});
