import { Settings2 } from "lucide-react";
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
    <details
      className="relative text-xs"
      open={settings}
      onToggle={(event) => setSettings(event.currentTarget.open)}
    >
      <summary
        aria-label="Settings"
        title="Settings"
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <Settings2 aria-hidden className="size-4" strokeWidth={1.75} />
      </summary>
      <div className="absolute right-0 z-30 mt-1 flex w-80 flex-col gap-1.5 rounded-md border bg-popover p-3 text-popover-foreground shadow-[0_8px_24px_-12px_rgb(30_39_51/0.35)]">
        <p className="font-medium">Theme</p>
        <ThemeSwitch />
        <label htmlFor={id} className="mt-3 font-medium">
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
          className="h-7 rounded-md border bg-card px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <p className="text-muted-foreground">
          {isMac
            ? "An application name, such as iTerm or Ghostty."
            : "A program, such as wt.exe, konsole or /usr/bin/kitty."}{" "}
          Empty uses the default. Only the terminal starts, in the repository
          root.
        </p>
        <label htmlFor={hotkeyId} className="mt-3 font-medium">
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
          className="h-7 rounded-md border bg-card px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        {hotkeyError !== null && (
          <p className="text-destructive">{hotkeyError}</p>
        )}
        <p className="text-muted-foreground">
          Opens a small window that adds a line to a project's braindump, also
          while another app is in front. Works only while stardust runs. Such as{" "}
          {DEFAULT_HOTKEY} (the default) or Alt+KeyN; empty turns it off.
        </p>
      </div>
    </details>
  );
}
