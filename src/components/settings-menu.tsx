import { useEffect, useId, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { isMac } from "@/lib/editor";
import { useTerminalStore } from "@/stores/terminal-store";

/** App settings, kept in the app data folder, never in a repository (`S-theme`, `S-terminal`). */
export function SettingsMenu() {
  const { terminal, setTerminal } = useTerminalStore();
  const [draft, setDraft] = useState(terminal);
  const id = useId();

  useEffect(() => setDraft(terminal), [terminal]);

  return (
    <div className="flex items-center gap-2">
      <ThemeSwitch />
      <details className="relative text-xs">
        <summary className="cursor-pointer rounded-md border px-2 py-0.5 text-muted-foreground hover:text-foreground">
          Settings
        </summary>
        <div className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-1 rounded-md border bg-background p-2 shadow-md">
          <label htmlFor={id} className="font-medium">
            Terminal
          </label>
          <input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void setTerminal(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void setTerminal(draft);
            }}
            placeholder={isMac ? "Terminal" : "default terminal"}
            className="rounded border bg-background px-1.5 py-0.5"
          />
          <p className="text-muted-foreground">
            {isMac
              ? "An application name, such as iTerm or Ghostty."
              : "A program, such as wt.exe, konsole or /usr/bin/kitty."}{" "}
            Empty uses the default. Only the terminal starts, in the repository
            root.
          </p>
        </div>
      </details>
    </div>
  );
}
