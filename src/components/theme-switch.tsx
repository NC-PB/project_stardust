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
    <fieldset className="flex w-fit rounded-md border bg-background p-0.5 text-xs">
      <legend className="sr-only">Theme</legend>
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={choice === option}
          onClick={() => runCommand(`theme.${option}`)}
          className={cn(
            "rounded-sm px-2.5 py-1",
            choice === option
              ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[option]}
        </button>
      ))}
    </fieldset>
  );
}
