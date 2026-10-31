import { useMemo, useState } from "react";
import type { SourceLine } from "@/bindings";
import { Button } from "@/components/ui/button";
import { FOG_COUNTS, type FogCount, fog, fogCountLabel } from "@/lib/fog";
import { useSpecStore } from "@/stores/spec-store";

interface FogMeterProps {
  /** Opens the spec in the editor at a node or question. */
  onOpen: (at: SourceLine) => void;
}

/**
 * The fog meter (`S-fog-meter`): ticked versus unticked nodes, `#later` nodes, answered versus
 * open questions. Clicking a count lists the nodes or questions behind it.
 */
export function FogMeter({ onOpen }: FogMeterProps) {
  const spec = useSpecStore((state) => state.spec);
  const counts = useMemo(() => (spec === null ? null : fog(spec)), [spec]);
  const [shown, setShown] = useState<FogCount | null>(null);

  if (counts === null) return null;
  const entries = shown === null ? [] : counts[shown];

  return (
    <section aria-label="Fog meter" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {FOG_COUNTS.map((count) => (
          <Button
            key={count}
            variant={shown === count ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={shown === count}
            onClick={() => setShown(shown === count ? null : count)}
          >
            {fogCountLabel(count)}
            <span className="tabular-nums">{counts[count].length}</span>
          </Button>
        ))}
      </div>
      {shown !== null && (
        <ul className="flex flex-col text-sm">
          {entries.length === 0 && (
            <li className="px-2 text-muted-foreground">None</li>
          )}
          {entries.map((entry) => (
            <li key={`${entry.at.file}:${entry.at.line}`}>
              <button
                type="button"
                className="flex w-full gap-2 rounded-md px-2 py-0.5 text-left hover:bg-muted"
                onClick={() => onOpen(entry.at)}
              >
                {entry.id !== null && (
                  <code className="shrink-0 text-muted-foreground">
                    {entry.id}
                  </code>
                )}
                <span className="truncate">{entry.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
