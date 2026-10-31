import { cn } from "cn";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { commandOf, type PaletteEntry, paletteEntries } from "@/lib/commands";
import { isMac } from "@/lib/editor";
import { formatShortcut } from "@/lib/palette";
import {
  commandContext,
  handleShortcut,
  runCommand,
} from "@/stores/command-store";
import { useMenuStore } from "@/stores/menu-store";

/**
 * The command palette (`S-palette`): every available command, filtered by what is typed, with
 * its shortcut. Arrow keys choose, Enter runs, Escape or a click outside closes. Also holds the
 * window key handler that runs the registered shortcuts.
 */
export function CommandPalette() {
  const open = useMenuStore((state) => state.palette);
  const setPalette = useMenuStore((state) => state.setPalette);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) =>
      void handleShortcut(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return <PaletteDialog close={() => setPalette(false)} />;
}

/** Opens the palette from the header and names its shortcut. */
export function PaletteButton() {
  const shortcut = commandOf("palette.open").shortcut;
  return (
    <button
      type="button"
      onClick={() => runCommand("palette.open")}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.8rem] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      Commands
      {shortcut && (
        <kbd className="code-id rounded-sm border bg-card px-1 text-muted-foreground">
          {formatShortcut(shortcut, isMac)}
        </kbd>
      )}
    </button>
  );
}

function PaletteDialog({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  // The context is read on every render; the stores do not change while the palette has focus.
  const entries = paletteEntries(commandContext(), query);
  const active = entries[Math.min(chosen, entries.length - 1)];

  // The focus goes back where it was when the palette closes.
  useEffect(() => {
    const before = document.activeElement;
    input.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  const run = (entry: PaletteEntry) => {
    close();
    runCommand(entry.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") close();
    else if (event.key === "Enter" && active) run(active);
    else if (event.key === "ArrowDown")
      setChosen((index) => Math.min(index + 1, entries.length - 1));
    else if (event.key === "ArrowUp")
      setChosen((index) => Math.max(index - 1, 0));
    else return;
    event.preventDefault();
  };

  return (
    // A click outside takes the focus from the input, and its blur closes the palette.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex max-h-[60vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
      >
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setChosen(0);
            setQuery(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={close}
          placeholder="Type a command"
          className="border-b bg-background px-3 py-2 text-sm outline-none"
        />
        <div
          id={listId}
          role="listbox"
          aria-label="Commands"
          className="overflow-y-auto py-1"
        >
          {entries.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground">
              No matching command
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              id={`${listId}-${entry.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={entry === active}
              // Chosen with the mouse before the input loses focus, so the blur does not close first.
              onMouseDown={(event) => {
                event.preventDefault();
                run(entry);
              }}
              onMouseMove={() => setChosen(entries.indexOf(entry))}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 px-3 py-1.5 text-sm",
                entry === active && "bg-muted",
              )}
            >
              <span>
                <MatchedName name={entry.name} matched={entry.matched} />
              </span>
              {entry.shortcut && (
                <kbd className="text-xs text-muted-foreground">
                  {formatShortcut(entry.shortcut, isMac)}
                </kbd>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The name with the characters that matched the query in bold. */
function MatchedName({ name, matched }: { name: string; matched: number[] }) {
  const marked = new Set(matched);
  return Array.from(name, (char, index) =>
    marked.has(index) ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: characters of a fixed name
      <b key={index}>{char}</b>
    ) : (
      char
    ),
  );
}
