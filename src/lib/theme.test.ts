import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./theme";

describe("theme", () => {
  it("follows the system unless a theme was chosen", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("reads unknown or missing settings as system", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice(undefined)).toBe("system");
    expect(parseThemeChoice("blue")).toBe("system");
    expect(parseThemeChoice(1)).toBe("system");
  });
});
