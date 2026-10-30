/** What the user chose (`S-theme`); `system` follows the operating system. */
export type ThemeChoice = "system" | "light" | "dark";
/** The theme actually shown. */
export type Theme = "light" | "dark";

export const THEME_CHOICES: ThemeChoice[] = ["system", "light", "dark"];

/** The app setting the choice is kept under. */
export const THEME_SETTING = "theme";

/** The theme shown for `choice` while the system is dark or not. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/** A stored setting as a choice; anything else, a missing value included, is `system`. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice)
    ? (value as ThemeChoice)
    : "system";
}
