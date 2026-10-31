import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { describe, expect, it } from "vitest";
import {
  INLINE_ELEMENTS,
  remarkInlineOnly,
  specLinkTarget,
} from "./inline-markdown";

const render = (markdown: string) =>
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: [remarkInlineOnly],
        allowedElements: INLINE_ELEMENTS,
        unwrapDisallowed: true,
      },
      markdown,
    ),
  );

describe("remarkInlineOnly", () => {
  it("renders inline code, emphasis and links without a paragraph", () => {
    expect(render("Uses `S-gate`, *only* [this](a.md).")).toBe(
      'Uses <code>S-gate</code>, <em>only</em> <a href="a.md">this</a>.',
    );
  });

  it("keeps block markup as text", () => {
    expect(render("# Not a heading")).toBe("# Not a heading");
    expect(render("> not a quote")).toBe("&gt; not a quote");
    expect(render("1. not a list")).toBe("1. not a list");
  });

  it("keeps the lines of a criterion with sub-items", () => {
    expect(render("Checks:\n- one `R-a`\n- two")).toBe(
      "Checks:\n- one <code>R-a</code>\n- two",
    );
  });

  it("shows raw HTML and images as text", () => {
    expect(render("a <b>bold</b> ![alt](x.png)")).toBe(
      'a &lt;b&gt;bold&lt;/b&gt; !<a href="x.png">alt</a>',
    );
  });
});

describe("specLinkTarget", () => {
  it("resolves a relative markdown link from the spec file", () => {
    expect(
      specLinkTarget(
        "/repo",
        "docs/planning",
        "spec.md",
        "done/20261031-a-task.md",
      ),
    ).toBe("/repo/docs/planning/done/20261031-a-task.md");
    expect(
      specLinkTarget("/repo", "docs/planning", "spec/structure.md", "../x.md"),
    ).toBe("/repo/docs/planning/x.md");
  });

  it("is null for web links and anchors", () => {
    expect(
      specLinkTarget("/repo", "docs/planning", "spec.md", "https://a.md"),
    ).toBeNull();
    expect(
      specLinkTarget("/repo", "docs/planning", "spec.md", "#heading"),
    ).toBeNull();
  });
});
