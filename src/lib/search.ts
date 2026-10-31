import type { SearchHit } from "@/bindings";

/** Results ask for this many files at most (`S-search-fulltext`). */
export const SEARCH_LIMIT = 30;
/** A query is sent this long after typing stops. */
export const SEARCH_DEBOUNCE_MS = 120;

/** Where a search result opens in the editor: the absolute file and the 1-based matching line. */
export interface HitLocation {
  path: string;
  line: number;
}

/** The file of `hit` under `repoRoot` and the line of its first match (`S-search-fulltext`). */
export function hitLocation(repoRoot: string, hit: SearchHit): HitLocation {
  const root = repoRoot.replace(/[\\/]+$/, "");
  return { path: `${root}/${hit.path}`, line: Math.max(1, hit.line) };
}

/** A piece of a snippet; `match` pieces contain a word of the query. */
export interface Segment {
  text: string;
  match: boolean;
}

/** `text` split into pieces so every occurrence of a query word, in any case, can be marked. */
export function highlight(text: string, query: string): Segment[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "")
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0 || text === "")
    return text ? [{ text, match: false }] : [];
  const lower = text.toLowerCase();
  // Only where lowercasing keeps the length are positions in `lower` positions in `text`.
  if (lower.length !== text.length) return [{ text, match: false }];
  const segments: Segment[] = [];
  let plain = 0;
  let at = 0;
  while (at < text.length) {
    const term = terms.find((candidate) => lower.startsWith(candidate, at));
    if (term === undefined) {
      at += 1;
      continue;
    }
    if (at > plain)
      segments.push({ text: text.slice(plain, at), match: false });
    segments.push({ text: text.slice(at, at + term.length), match: true });
    at += term.length;
    plain = at;
  }
  if (plain < text.length)
    segments.push({ text: text.slice(plain), match: false });
  return segments;
}
