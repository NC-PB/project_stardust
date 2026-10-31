import { backlinksLabel } from "@/lib/links";
import { useEditorStore } from "@/stores/editor-store";
import { useLinkStore } from "@/stores/link-store";

/**
 * The files linking to the open file, under the editor; each opens at its first link
 * (`S-links`).
 */
export function Backlinks() {
  const path = useEditorStore((state) => state.path);
  const { backlinksOf, backlinks, open } = useLinkStore();
  if (path === null || backlinksOf !== path) return null;
  return (
    <footer className="flex max-h-32 flex-col gap-1 border-t pt-2 text-xs">
      <h3 className="font-semibold text-muted-foreground">
        {backlinksLabel(backlinks.length)}
      </h3>
      {backlinks.length > 0 && (
        <ul className="flex min-h-0 flex-col overflow-y-auto">
          {backlinks.map((backlink) => (
            <li key={backlink.file}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
                onClick={() => void open(backlink)}
                title={`${backlink.file}, line ${backlink.lines.join(", ")}`}
              >
                <span className="truncate">{backlink.title}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {backlink.file}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
