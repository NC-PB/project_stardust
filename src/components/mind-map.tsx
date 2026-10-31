import type { Markmap } from "markmap-view";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SourceLine } from "@/bindings";
import {
  MIND_MAP_LABEL,
  mindMapStyle,
  mindMapTree,
  sourceLineOf,
  UNTICKED_COLOR,
} from "@/lib/mind-map";
import { useSpecStore } from "@/stores/spec-store";

/**
 * The Structure as a mind map (`S-mindmap`), redrawn whenever the spec store reads the spec
 * again. Markmap is loaded on first use. Clicking a label calls `onOpen` with where the node
 * starts; clicking a circle folds or unfolds the node.
 */
export function MindMap({ onOpen }: { onOpen: (at: SourceLine) => void }) {
  const spec = useSpecStore((state) => state.spec);
  const tree = useMemo(() => (spec ? mindMapTree(spec) : null), [spec]);
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (tree === null) return;
    let current = true;
    void (async () => {
      try {
        const { Markmap, defaultOptions } = await import("markmap-view");
        const svg = svgRef.current;
        if (!current || svg === null) return;
        setError(undefined);
        const existing = markmapRef.current;
        if (existing) {
          await existing.setData(tree);
          return;
        }
        markmapRef.current = Markmap.create(
          svg,
          {
            duration: 300,
            style: mindMapStyle,
            color: (node) =>
              node.payload?.state === "unticked"
                ? UNTICKED_COLOR
                : defaultOptions.color(node),
          },
          tree,
        );
      } catch (err) {
        if (current) setError(String(err));
      }
    })();
    return () => {
      current = false;
    };
  }, [tree]);

  useEffect(
    () => () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    },
    [],
  );

  const open = (event: MouseEvent<SVGSVGElement>) => {
    if (!(event.target instanceof Element)) return;
    const label = event.target.closest<HTMLElement>(`.${MIND_MAP_LABEL}`);
    const at = label ? sourceLineOf(label.dataset) : null;
    if (at) onOpen(at);
  };

  if (spec === null)
    return <p className="p-4 text-sm text-muted-foreground">No spec read.</p>;
  if (error)
    return <p className="p-4 text-sm text-destructive">Mind map: {error}</p>;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the labels are drawn by Markmap; the spec stays reachable in the editor.
    <svg
      ref={svgRef}
      className="size-full min-h-64"
      role="img"
      aria-label="Mind map of the Structure"
      onClick={open}
    />
  );
}
