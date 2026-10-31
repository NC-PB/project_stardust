import { cn } from "cn";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { runCommand } from "@/stores/command-store";
import { useThemeStore } from "@/stores/theme-store";

const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Chooses the theme; the choice is kept in the app settings (`S-theme`). */
export function ThemeSwitch() {
  const choice = useThemeStore((state) => state.choice);
  return (
    <fieldset className="flex rounded-md border p-0.5 text-xs">
      <legend className="sr-only">Theme</legend>
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={choice === option}
          onClick={() => runCommand(`theme.${option}`)}
          className={cn(
            "rounded px-2 py-0.5",
            choice === option
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[option]}
        </button>
      ))}
    </fieldset>
  );
}
