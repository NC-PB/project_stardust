import { ChevronRight } from "lucide-react";
import { backlinksLabel } from "@/lib/links";
import { useEditorStore } from "@/stores/editor-store";
import { useLinkStore } from "@/stores/link-store";

/**
 * The files linking to the open file, under the editor, folded to one line until opened; each
 * opens at its first link (`S-links`, `S-window-layout`).
 */
export function Backlinks() {
  const path = useEditorStore((state) => state.path);
  const { backlinksOf, backlinks, open } = useLinkStore();
  if (path === null || backlinksOf !== path) return null;
  return (
    <details className="group shrink-0 border-t text-xs">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 px-4 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform group-open:rotate-90"
        />
        {backlinksLabel(backlinks.length)}
      </summary>
      {backlinks.length > 0 && (
        <ul className="flex max-h-40 min-h-0 flex-col overflow-y-auto px-2 pb-2">
          {backlinks.map((backlink) => (
            <li key={backlink.file}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left hover:bg-accent"
                onClick={() => void open(backlink)}
                title={`${backlink.file}, line ${backlink.lines.join(", ")}`}
              >
                <span className="truncate">{backlink.title}</span>
                <span className="code-id min-w-0 flex-1 truncate text-muted-foreground">
                  {backlink.file}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
