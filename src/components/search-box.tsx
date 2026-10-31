import { cn } from "cn";
import { Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/bindings";
import { highlight, hitLocation } from "@/lib/search";
import { useEditorStore } from "@/stores/editor-store";
import { useMenuStore } from "@/stores/menu-store";
import { useProjectStore } from "@/stores/project-store";
import { useSearchStore } from "@/stores/search-store";

/**
 * Full text search over the planning root (`S-search-fulltext`): results while typing, a
 * result opens in the editor in source mode at its matching line. Arrow keys choose, Enter
 * opens, Escape clears.
 */
export function SearchBox() {
  const repoRoot = useProjectStore((state) => state.repoRoot);
  const { query, hits, error, setQuery, clear } = useSearchStore();
  const openFile = useEditorStore((state) => state.open);
  const [chosen, setChosen] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const searchFocus = useMenuStore((state) => state.searchFocus);

  // "Search planning files" from the palette puts the focus here (`S-palette`).
  useEffect(() => {
    if (searchFocus > 0) input.current?.focus();
  }, [searchFocus]);

  if (repoRoot === null) return null;
  const open = (hit: SearchHit) => {
    const { path, line } = hitLocation(repoRoot, hit);
    void openFile(repoRoot, path, line);
    clear();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") clear();
    else if (event.key === "Enter" && hits[chosen]) open(hits[chosen]);
    else if (event.key === "ArrowDown")
      setChosen((index) => Math.min(index + 1, hits.length - 1));
    else if (event.key === "ArrowUp")
      setChosen((index) => Math.max(index - 1, 0));
    else return;
    event.preventDefault();
  };

  return (
    <div className="relative w-64 max-w-[30vw] shrink">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(event) => {
          setChosen(0);
          setQuery(event.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search"
        aria-label="Search planning files"
        className="h-7 w-full rounded-md border bg-card pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      />
      {query.trim() !== "" && (
        <div className="absolute top-full right-0 z-30 mt-1 max-h-[70vh] w-[32rem] max-w-[90vw] overflow-y-auto rounded-md border bg-popover p-1 shadow-[0_8px_24px_-12px_rgb(30_39_51/0.35)]">
          {error && <p className="p-2 text-xs text-destructive">{error}</p>}
          {!error && hits.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No matches</p>
          )}
          <ul>
            {hits.map((hit, index) => (
              <li key={hit.path}>
                <button
                  type="button"
                  onClick={() => open(hit)}
                  onMouseEnter={() => setChosen(index)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-xs",
                    index === chosen && "bg-accent",
                  )}
                >
                  <span className="font-medium text-sm">{hit.title}</span>
                  <span className="code-id text-muted-foreground">
                    {hit.path}:{hit.line}
                  </span>
                  <span>
                    {highlight(hit.snippet, query).map((segment, at) =>
                      segment.match ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder.
                        <mark key={at} className="rounded-sm bg-primary/15">
                          {segment.text}
                        </mark>
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder.
                        <span key={at}>{segment.text}</span>
                      ),
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
