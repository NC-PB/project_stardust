import { Button } from "@/components/ui/button";
import type { MainView } from "@/lib/spec-view";
import { useSpecStore } from "@/stores/spec-store";
import { useViewStore } from "@/stores/view-store";

const VIEWS: { view: MainView; label: string }[] = [
  { view: "board", label: "Board" },
  { view: "spec", label: "Spec" },
];

/** Switches the main area between the board and the spec view; shown once a project is open. */
export function ViewSwitch() {
  const { view, show } = useViewStore();
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
          onClick={() => show(option.view)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
