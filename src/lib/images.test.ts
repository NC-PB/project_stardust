import { describe, expect, it } from "vitest";
import {
  applyInsertion,
  dropFailures,
  dropInsertion,
  dropPoint,
  fileBase64,
  imageBadge,
  pastedFiles,
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

describe("pastedFiles", () => {
  const png = new File([new Uint8Array([1, 2])], "image.png", {
    type: "image/png",
  });
  const clipboard = (text: string, files: File[]) => ({
    getData: (format: string) => (format === "text/plain" ? text : ""),
    files,
  });

  it("takes the files of a paste without plain text", () => {
    expect(pastedFiles(clipboard("", [png]))).toEqual([png]);
    expect(pastedFiles(clipboard("", []))).toEqual([]);
  });

  it("leaves a paste with plain text to the text", () => {
    expect(pastedFiles(clipboard("a caption", [png]))).toEqual([]);
  });
});

describe("fileBase64", () => {
  it("encodes the bytes of a file", async () => {
    expect(await fileBase64(new Blob(["foobar"]))).toBe("Zm9vYmFy");
    expect(await fileBase64(new Blob([]))).toBe("");
  });

  it("encodes files larger than one chunk", async () => {
    const bytes = new Uint8Array(0x8000 * 2 + 3).map((_, i) => i % 256);
    const decoded = atob(await fileBase64(new Blob([bytes])));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0x8000 + 1)).toBe((0x8000 + 1) % 256);
  });
});
