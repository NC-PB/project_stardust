import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import {
  parseThemeChoice,
  resolveTheme,
  THEME_SETTING,
  type Theme,
  type ThemeChoice,
} from "@/lib/theme";
import { readSetting, writeSetting } from "./settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Set once the user chose this session, so a late read of the stored setting cannot undo it. */
let chosen = false;

interface ThemeState {
  choice: ThemeChoice;
  systemDark: boolean;
  /** The theme shown, from `choice` and the system. */
  theme: Theme;
  /** Reads the stored choice and follows system changes; returns the function that stops. */
  start: () => () => void;
  /** Shows `choice` and keeps it in the app settings. */
  choose: (choice: ThemeChoice) => Promise<void>;
}

/** Shows `theme` in the page and, for `choice` other than system, in the window frame. */
function show(theme: Theme, choice: ThemeChoice) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  // The frame follows the system by itself; a failure leaves only the frame unthemed.
  void getCurrentWindow()
    .setTheme(choice === "system" ? null : choice)
    .catch(() => {});
}

/** Light and dark theme, following the system by default (`S-theme`). */
export const useThemeStore = create<ThemeState>()((set, get) => {
  const update = (choice: ThemeChoice, systemDark: boolean) => {
    const theme = resolveTheme(choice, systemDark);
    set({ choice, systemDark, theme });
    show(theme, choice);
  };

  return {
    choice: "system",
    systemDark: false,
    theme: "light",

    start: () => {
      const media = window.matchMedia(DARK_QUERY);
      // Shown at once from the system, so the page does not flash while the setting loads.
      update(get().choice, media.matches);
      const onChange = (event: MediaQueryListEvent) =>
        update(get().choice, event.matches);
      media.addEventListener("change", onChange);
      void readSetting<unknown>(THEME_SETTING).then((stored) => {
        if (!chosen) update(parseThemeChoice(stored), get().systemDark);
      });
      return () => media.removeEventListener("change", onChange);
    },

    choose: async (choice) => {
      chosen = true;
      update(choice, get().systemDark);
      await writeSetting(THEME_SETTING, choice);
    },
  };
});
