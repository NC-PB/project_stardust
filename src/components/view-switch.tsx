import { KanbanSquare, ListTree, TriangleAlert } from "lucide-react";
import { RailButton } from "@/components/rail-button";
import type { MainView } from "@/lib/spec-view";
import { runCommand } from "@/stores/command-store";
import { useSpecStore } from "@/stores/spec-store";
import { useViewStore } from "@/stores/view-store";

const VIEWS = [
  { view: "board", label: "Board", icon: KanbanSquare },
  { view: "spec", label: "Spec", icon: ListTree },
  { view: "stale", label: "Stale", icon: TriangleAlert },
] as const satisfies readonly {
  view: MainView;
  label: string;
  icon: unknown;
}[];

/**
 * Switches the main area between the board, the spec view and the Stale view, at the top of
 * the rail (`S-window-layout`); shown once a project is open.
 */
export function ViewSwitch() {
  const view = useViewStore((state) => state.view);
  const ready = useSpecStore((state) => state.spec !== null);
  if (!ready) return null;
  return (
    <div
      role="tablist"
      aria-label="Main view"
      aria-orientation="vertical"
      className="flex flex-col items-center gap-1"
    >
      {VIEWS.map((option) => (
        <RailButton
          key={option.view}
          role="tab"
          aria-selected={view === option.view}
          active={view === option.view}
          icon={option.icon}
          label={option.label}
          onClick={() => runCommand(`view.${option.view}`)}
        />
      ))}
    </div>
  );
}
