import { describe, expect, it } from "vitest";
import {
  applyInsertion,
  dropFailures,
  dropInsertion,
  dropPoint,
  imageBadge,
} from "./images";

const drop = (text: string, at: number | null, snippets: string[]) =>
  applyInsertion(text, dropInsertion(text, at, snippets));

describe("dropInsertion", () => {
  it("puts each link on its own line at the drop position", () => {
    expect(drop("ab", 1, ["![x](x.png)"])).toBe("a\n![x](x.png)\nb");
    expect(drop("a\nb", 2, ["![x](x.png)", "![y](y.png)"])).toBe(
      "a\n![x](x.png)\n![y](y.png)\nb",
    );
    expect(drop("a\n", 2, ["![x](x.png)"])).toBe("a\n![x](x.png)");
    expect(drop("", 0, ["![x](x.png)"])).toBe("![x](x.png)");
  });

  it("clamps a position outside the text", () => {
    expect(drop("ab", 99, ["![x](x.png)"])).toBe("ab\n![x](x.png)");
    expect(drop("ab", -3, ["![x](x.png)"])).toBe("![x](x.png)\nab");
  });

  it("never inserts into the frontmatter", () => {
    const text = "---\ntitle: A\n---\nbody\n";
    expect(drop(text, 0, ["![x](x.png)"])).toBe(
      "---\ntitle: A\n---\n![x](x.png)\nbody\n",
    );
    expect(drop(text, 6, ["![x](x.png)"])).toBe(
      "---\ntitle: A\n---\n![x](x.png)\nbody\n",
    );
  });

  it("appends a paragraph at the end in read mode, keeping the text", () => {
    expect(drop("a", null, ["![x](x.png)"])).toBe("a\n\n![x](x.png)\n");
    expect(drop("a\n", null, ["![x](x.png)"])).toBe("a\n\n![x](x.png)\n");
    expect(drop("a\n\n\n", null, ["![x](x.png)"])).toBe("a\n\n\n![x](x.png)\n");
    expect(drop("", null, ["![x](x.png)"])).toBe("![x](x.png)\n");
  });
});

describe("dropPoint", () => {
  it("turns physical pixels into CSS pixels", () => {
    expect(dropPoint({ x: 200, y: 100 }, 2)).toEqual({ x: 100, y: 50 });
    expect(dropPoint({ x: 200, y: 100 }, 0)).toEqual({ x: 200, y: 100 });
  });
});

describe("imageBadge", () => {
  it("names a missing image by its alt text, else its source", () => {
    expect(imageBadge("Shot", "../images/s.png", { kind: "missing" })).toEqual({
      label: "Missing image: Shot",
      title:
        "No file at ../images/s.png. Images are not in git, so it may not be synced to this machine.",
    });
    expect(imageBadge(" ", "s.png", { kind: "missing" }).label).toBe(
      "Missing image: s.png",
    );
  });

  it("gives the reason for a refused image", () => {
    expect(
      imageBadge(undefined, "https://x/a.png", {
        kind: "refused",
        reason: "not a local image",
      }),
    ).toEqual({
      label: "Image not shown: https://x/a.png",
      title: "not a local image",
    });
  });
});

describe("dropFailures", () => {
  it("lists failures, or nothing", () => {
    expect(dropFailures([])).toBeNull();
    expect(dropFailures(["`a.txt` is not an image", "`b` not found"])).toBe(
      "Not added: `a.txt` is not an image; `b` not found",
    );
  });
});
