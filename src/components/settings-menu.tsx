import { useEffect, useId, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { isMac } from "@/lib/editor";
import { DEFAULT_HOTKEY } from "@/lib/quick-capture";
import { useMenuStore } from "@/stores/menu-store";
import { useHotkeyStore } from "@/stores/quick-capture-store";
import { useTerminalStore } from "@/stores/terminal-store";

/**
 * App settings, kept in the app data folder, never in a repository (`S-theme`, `S-terminal`,
 * `S-quick-capture`).
 */
export function SettingsMenu() {
  const { terminal, setTerminal } = useTerminalStore();
  const { settings, setSettings } = useMenuStore();
  const [draft, setDraft] = useState(terminal);
  const id = useId();
  const { hotkey, error: hotkeyError, setHotkey } = useHotkeyStore();
  const [hotkeyDraft, setHotkeyDraft] = useState(hotkey);
  const hotkeyId = useId();

  useEffect(() => setDraft(terminal), [terminal]);
  useEffect(() => setHotkeyDraft(hotkey), [hotkey]);

  return (
    <div className="flex items-center gap-2">
      <ThemeSwitch />
      <details
        className="relative text-xs"
        open={settings}
        onToggle={(event) => setSettings(event.currentTarget.open)}
      >
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
          <label htmlFor={hotkeyId} className="mt-2 font-medium">
            Quick capture hotkey
          </label>
          <input
            id={hotkeyId}
            value={hotkeyDraft}
            onChange={(event) => setHotkeyDraft(event.target.value)}
            onBlur={() => {
              if (hotkeyDraft.trim() !== hotkey) void setHotkey(hotkeyDraft);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void setHotkey(hotkeyDraft);
            }}
            placeholder="off"
            className="rounded border bg-background px-1.5 py-0.5"
          />
          {hotkeyError !== null && (
            <p className="text-destructive">{hotkeyError}</p>
          )}
          <p className="text-muted-foreground">
            Opens a small window that adds a line to a project's braindump, also
            while another app is in front. Works only while stardust runs. Such
            as {DEFAULT_HOTKEY} (the default) or Alt+KeyN; empty turns it off.
          </p>
        </div>
      </details>
    </div>
  );
}
