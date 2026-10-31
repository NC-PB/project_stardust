import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();

vi.mock("@/bindings", () => ({
  commands: { search: (...args: unknown[]) => search(...args) },
}));

import { SEARCH_DEBOUNCE_MS, SEARCH_LIMIT } from "@/lib/search";
import { useSearchStore } from "./search-store";

const hit = (path: string) => ({ path, title: path, snippet: "", line: 1 });

describe("useSearchStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    search.mockReset();
    useSearchStore.getState().reset("/repo");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches once typing stops", async () => {
    search.mockResolvedValue({ status: "ok", data: [hit("a.md")] });
    useSearchStore.getState().setQuery("b");
    useSearchStore.getState().setQuery("bo");
    useSearchStore.getState().setQuery("board");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("/repo", "board", SEARCH_LIMIT);
    expect(useSearchStore.getState().hits).toEqual([hit("a.md")]);
  });

  it("drops an answer that arrives after a newer query", async () => {
    let answerOld: (value: unknown) => void = () => {};
    search.mockImplementationOnce(
      () => new Promise((resolve) => (answerOld = resolve)),
    );
    search.mockResolvedValueOnce({ status: "ok", data: [hit("new.md")] });
    useSearchStore.getState().setQuery("old");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    useSearchStore.getState().setQuery("new");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    answerOld({ status: "ok", data: [hit("old.md")] });
    await vi.runAllTimersAsync();
    expect(useSearchStore.getState().hits).toEqual([hit("new.md")]);
  });

  it("clears the results with an empty query", async () => {
    search.mockResolvedValue({ status: "ok", data: [hit("a.md")] });
    useSearchStore.getState().setQuery("a");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    useSearchStore.getState().setQuery("  ");
    expect(useSearchStore.getState().hits).toEqual([]);
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
