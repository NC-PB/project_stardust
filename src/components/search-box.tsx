import { cn } from "cn";
import { type KeyboardEvent, useState } from "react";
import type { SearchHit } from "@/bindings";
import { highlight, hitLocation } from "@/lib/search";
import { useEditorStore } from "@/stores/editor-store";
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
    <div className="relative w-full max-w-xl">
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setChosen(0);
          setQuery(event.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search planning files"
        aria-label="Search planning files"
        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
      />
      {query.trim() !== "" && (
        <div className="absolute top-full z-10 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-background shadow-md">
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
                    "flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-xs",
                    index === chosen && "bg-muted",
                  )}
                >
                  <span className="font-medium text-sm">{hit.title}</span>
                  <span className="text-muted-foreground">
                    {hit.path}:{hit.line}
                  </span>
                  <span>
                    {highlight(hit.snippet, query).map((segment, at) =>
                      segment.match ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder.
                        <mark key={at} className="rounded bg-primary/20">
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
