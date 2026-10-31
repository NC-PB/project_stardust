import { describe, expect, it } from "vitest";
import {
  formatShortcut,
  fuzzyMatch,
  matchesShortcut,
  parseShortcut,
  rankByName,
} from "./palette";

const keys = (key: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("fuzzyMatch", () => {
  it("matches characters in order, ignoring case and spaces of the query", () => {
    expect(fuzzyMatch("otm", "Open terminal")?.indices).toEqual([0, 5, 8]);
    expect(fuzzyMatch("OP TERM", "Open terminal")).not.toBeNull();
    expect(fuzzyMatch("mto", "Open terminal")).toBeNull();
    expect(fuzzyMatch("x", "Open terminal")).toBeNull();
  });

  it("matches everything with an empty query", () => {
    expect(fuzzyMatch("  ", "Save file")).toEqual({ score: 0, indices: [] });
  });

  it("marks a query found in one piece, preferring a word start", () => {
    expect(fuzzyMatch("term", "Open terminal")?.indices).toEqual([5, 6, 7, 8]);
    expect(fuzzyMatch("ark", "Mark and archive")?.indices).toEqual([1, 2, 3]);
    expect(fuzzyMatch("ar", "Mark and archive")?.indices).toEqual([9, 10]);
  });

  it("puts characters on word starts when it can", () => {
    // Of two word starts the one closer to the next character wins.
    expect(fuzzyMatch("sv", "Show spec view")?.indices).toEqual([5, 10]);
    // The "p" after "s" in "spec" is not a word start, but continues the run.
    expect(fuzzyMatch("spv", "Show spec view")?.indices).toEqual([5, 6, 10]);
    expect(fuzzyMatch("ssv", "Show spec view")?.indices).toEqual([0, 5, 10]);
  });

  it("scores word starts and runs above scattered characters", () => {
    const words = fuzzyMatch("sf", "Save file")?.score ?? 0;
    const scattered = fuzzyMatch("sf", "Asterisk of")?.score ?? 0;
    expect(words).toBeGreaterThan(scattered);
    const piece = fuzzyMatch("save", "Save file")?.score ?? 0;
    expect(piece).toBeGreaterThan(words);
  });
});

describe("rankByName", () => {
  const items = [
    { name: "Show board" },
    { name: "Show spec view" },
    { name: "Save file" },
  ];

  it("keeps the order given without a query", () => {
    expect(rankByName(items, "").map(({ item }) => item.name)).toEqual([
      "Show board",
      "Show spec view",
      "Save file",
    ]);
  });

  it("drops what does not match and puts the best match first", () => {
    expect(rankByName(items, "spec").map(({ item }) => item.name)).toEqual([
      "Show spec view",
    ]);
    expect(rankByName(items, "sf")[0].item.name).toBe("Save file");
  });
});

describe("shortcuts", () => {
  it("reads Mod with a key, optionally with Shift", () => {
    expect(parseShortcut("Mod+K")).toEqual({ shift: false, key: "k" });
    expect(parseShortcut("Mod+Shift+P")).toEqual({ shift: true, key: "p" });
    expect(parseShortcut("K")).toBeNull();
    expect(parseShortcut("Ctrl+K")).toBeNull();
    expect(parseShortcut("Mod+Alt+K")).toBeNull();
    expect(parseShortcut("Mod+Shift+Shift+K")).toBeNull();
    expect(parseShortcut("Mod+Enter")).toBeNull();
  });

  it("matches ⌘ on macOS and Ctrl elsewhere, with exactly the modifiers given", () => {
    expect(matchesShortcut(keys("k", { metaKey: true }), "Mod+K", true)).toBe(
      true,
    );
    expect(matchesShortcut(keys("k", { ctrlKey: true }), "Mod+K", true)).toBe(
      false,
    );
    expect(matchesShortcut(keys("K", { ctrlKey: true }), "Mod+K", false)).toBe(
      true,
    );
    expect(
      matchesShortcut(
        keys("k", { ctrlKey: true, shiftKey: true }),
        "Mod+K",
        false,
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        keys("P", { metaKey: true, shiftKey: true }),
        "Mod+Shift+P",
        true,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        keys("k", { ctrlKey: true, altKey: true }),
        "Mod+K",
        false,
      ),
    ).toBe(false);
  });

  it("is shown in the platform's form", () => {
    expect(formatShortcut("Mod+K", true)).toBe("⌘K");
    expect(formatShortcut("Mod+Shift+P", true)).toBe("⇧⌘P");
    expect(formatShortcut("Mod+K", false)).toBe("Ctrl+K");
    expect(formatShortcut("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
  });
});
