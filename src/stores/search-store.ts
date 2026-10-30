import { create } from "zustand";
import { commands, type SearchHit } from "@/bindings";
import { SEARCH_DEBOUNCE_MS, SEARCH_LIMIT } from "@/lib/search";

interface SearchState {
  query: string;
  hits: SearchHit[];
  error: string | null;
  /** Sets the query; results follow once typing stops for `SEARCH_DEBOUNCE_MS`. */
  setQuery: (query: string) => void;
  /** Runs the current query now, for example after files changed on disk. */
  refresh: () => Promise<void>;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Counts queries so an older answer never replaces a newer one. */
let sent = 0;

/** Full text search over the planning root of the open project (`S-search-fulltext`). */
export const useSearchStore = create<SearchState>()((set, get) => ({
  query: "",
  hits: [],
  error: null,

  setQuery: (query) => {
    set({ query });
    clearTimeout(timer);
    if (query.trim() === "") {
      sent += 1;
      set({ hits: [], error: null });
      return;
    }
    timer = setTimeout(() => void get().refresh(), SEARCH_DEBOUNCE_MS);
  },

  refresh: async () => {
    const { query } = get();
    if (query.trim() === "") return;
    sent += 1;
    const mine = sent;
    const result = await commands.search(query, SEARCH_LIMIT);
    if (mine !== sent) return;
    set(
      result.status === "ok"
        ? { hits: result.data, error: null }
        : { hits: [], error: result.error },
    );
  },

  clear: () => {
    clearTimeout(timer);
    sent += 1;
    set({ query: "", hits: [], error: null });
  },
}));
