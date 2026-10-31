import { Button } from "@/components/ui/button";
import type { MainView } from "@/lib/spec-view";
import { runCommand } from "@/stores/command-store";
import { useSpecStore } from "@/stores/spec-store";
import { useViewStore } from "@/stores/view-store";

const VIEWS: { view: MainView; label: string }[] = [
  { view: "board", label: "Board" },
  { view: "spec", label: "Spec" },
  { view: "stale", label: "Stale" },
];

/** Switches the main area between the board, the spec view and the Stale view; shown once a project is open. */
export function ViewSwitch() {
  const view = useViewStore((state) => state.view);
  const ready = useSpecStore((state) => state.spec !== null);
  if (!ready) return null;
  return (
    <div role="tablist" aria-label="Main view" className="flex gap-1">
      {VIEWS.map((option) => (
        <Button
          key={option.view}
          role="tab"
          aria-selected={view === option.view}
          variant={view === option.view ? "secondary" : "ghost"}
          size="sm"
          onClick={() => runCommand(`view.${option.view}`)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
