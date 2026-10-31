import { beforeEach, describe, expect, it } from "vitest";
import { useViewStore } from "./view-store";

describe("useViewStore", () => {
  beforeEach(() =>
    useViewStore.setState({ view: "board", expanded: {}, mindMap: false }),
  );

  it("switches the main view", () => {
    useViewStore.getState().show("spec");
    expect(useViewStore.getState().view).toBe("spec");
  });

  it("remembers expanded nodes and sets all at once", () => {
    useViewStore.getState().setExpanded("S-a", true);
    expect(useViewStore.getState().expanded).toEqual({ "S-a": true });
    useViewStore.getState().setAllExpanded(["S-a", "S-b"], false);
    expect(useViewStore.getState().expanded).toEqual({
      "S-a": false,
      "S-b": false,
    });
  });

  it("toggles the mind map", () => {
    useViewStore.getState().toggleMindMap();
    expect(useViewStore.getState().mindMap).toBe(true);
    useViewStore.getState().toggleMindMap();
    expect(useViewStore.getState().mindMap).toBe(false);
  });
});
