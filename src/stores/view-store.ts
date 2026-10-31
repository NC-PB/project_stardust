import { create } from "zustand";
import type { MainView } from "@/lib/spec-view";

interface ViewState {
  /** What the main area beside the editor shows. */
  view: MainView;
  /** Nodes of the Structure tree the user expanded or collapsed, by node key, this session. */
  expanded: Record<string, boolean>;
  /** Whether the spec view shows the Structure as a mind map instead of the tree (`S-mindmap`). */
  mindMap: boolean;
  show: (view: MainView) => void;
  /** Sets whether the node with `key` is expanded. */
  setExpanded: (key: string, expanded: boolean) => void;
  /** Expands or collapses every node with `keys` at once. */
  setAllExpanded: (keys: string[], expanded: boolean) => void;
  toggleMindMap: () => void;
}

/** The view of the main area and the state of the spec view, for the session only. */
export const useViewStore = create<ViewState>()((set) => ({
  view: "board",
  expanded: {},
  mindMap: false,

  show: (view) => set({ view }),

  setExpanded: (key, expanded) =>
    set((state) => ({ expanded: { ...state.expanded, [key]: expanded } })),

  setAllExpanded: (keys, expanded) =>
    set({
      expanded: Object.fromEntries(keys.map((key) => [key, expanded])),
    }),

  toggleMindMap: () => set((state) => ({ mindMap: !state.mindMap })),
}));
