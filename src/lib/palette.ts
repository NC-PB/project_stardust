import type { ShortcutKeys } from "@/lib/editor";

/** How a name matched a query: higher scores rank first; `indices` are the matched characters. */
export interface FuzzyMatch {
  score: number;
  indices: number[];
}

const isWordStart = (text: string, index: number) =>
  index === 0 || /[\s\-_:/.(]/.test(text[index - 1]);

/**
 * Whether every character of `query` occurs in `name` in order, ignoring case and the spaces of
 * the query, and how well: characters at word starts and runs of consecutive characters score
 * higher, gaps lower, a query found as one piece highest; the best placement is marked. `null` when it does not match; an
 * empty query matches everything with score 0.
 */
export function fuzzyMatch(query: string, name: string): FuzzyMatch | null {
  const wanted = query.toLowerCase().replace(/\s+/g, "");
  if (wanted === "") return { score: 0, indices: [] };
  const text = name.toLowerCase();

  // A query found as one piece is marked there, preferring a place at a word start.
  let piece = -1;
  for (
    let at = text.indexOf(wanted);
    at !== -1;
    at = text.indexOf(wanted, at + 1)
  ) {
    if (piece === -1) piece = at;
    if (isWordStart(name, at)) {
      piece = at;
      break;
    }
  }
  if (piece !== -1)
    return {
      score: 100 + wanted.length * 2 + (isWordStart(name, piece) ? 20 : 0),
      indices: Array.from(wanted, (_, offset) => piece + offset),
    };

  // Otherwise the best placement of each character, found over all placements: names are
  // short, so trying every earlier position for every character is cheap.
  const n = text.length;
  const best: number[][] = [];
  const from: number[][] = [];
  for (let q = 0; q < wanted.length; q += 1) {
    best.push(new Array<number>(n).fill(Number.NEGATIVE_INFINITY));
    from.push(new Array<number>(n).fill(-1));
    for (let at = 0; at < n; at += 1) {
      if (text[at] !== wanted[q]) continue;
      const own = 1 + (isWordStart(name, at) ? 8 : 0);
      if (q === 0) {
        best[q][at] = own;
        continue;
      }
      for (let before = q - 1; before < at; before += 1) {
        const previous = best[q - 1][before];
        if (previous === Number.NEGATIVE_INFINITY) continue;
        const gap = at - before - 1;
        const score = previous + own + (gap === 0 ? 5 : -Math.min(gap, 10));
        if (score > best[q][at]) {
          best[q][at] = score;
          from[q][at] = before;
        }
      }
    }
  }
  const last = wanted.length - 1;
  let end = -1;
  for (let at = 0; at < n; at += 1)
    if (
      best[last][at] !== Number.NEGATIVE_INFINITY &&
      (end === -1 || best[last][at] > best[last][end])
    )
      end = at;
  if (end === -1) return null;
  const indices: number[] = [];
  for (let q = last, at = end; q >= 0; at = from[q][at], q -= 1)
    indices.unshift(at);
  return { score: best[last][end], indices };
}

/** The items whose name matches `query`, best first; equal scores keep the order given. */
export function rankByName<T extends { name: string }>(
  items: T[],
  query: string,
): { item: T; match: FuzzyMatch }[] {
  return items
    .flatMap((item, order) => {
      const match = fuzzyMatch(query, item.name);
      return match === null ? [] : [{ item, match, order }];
    })
    .sort((a, b) => b.match.score - a.match.score || a.order - b.order)
    .map(({ item, match }) => ({ item, match }));
}

/** A shortcut as written in the registry: `Mod+K`, `Mod+Shift+P`; Mod is ⌘ on macOS, else Ctrl. */
export interface Shortcut {
  shift: boolean;
  key: string;
}

/**
 * Reads a shortcut written as `Mod+<key>` or `Mod+Shift+<key>`, one character key; `null` for
 * anything else. Alt is left out: on macOS it changes the character the key event carries.
 */
export function parseShortcut(text: string): Shortcut | null {
  const parts = text.split("+");
  if (parts.length < 2 || parts[0] !== "Mod") return null;
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(1, -1);
  if (
    key.length !== 1 ||
    modifiers.length > 1 ||
    (modifiers.length === 1 && modifiers[0] !== "Shift")
  )
    return null;
  return { shift: modifiers.length === 1, key: key.toLowerCase() };
}

/** Whether the key event is the shortcut `text` on the platform (`mac` for macOS). */
export function matchesShortcut(
  event: ShortcutKeys,
  text: string,
  mac: boolean,
): boolean {
  const shortcut = parseShortcut(text);
  if (shortcut === null) return false;
  const command = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    command &&
    event.shiftKey === shortcut.shift &&
    !event.altKey &&
    event.key.toLowerCase() === shortcut.key
  );
}

/** The shortcut as shown beside a palette entry: `⌘K` or `⇧⌘P` on macOS, `Ctrl+Shift+P` elsewhere. */
export function formatShortcut(text: string, mac: boolean): string {
  const shortcut = parseShortcut(text);
  if (shortcut === null) return text;
  const key = shortcut.key.toUpperCase();
  if (mac) return `${shortcut.shift ? "⇧" : ""}⌘${key}`;
  return `Ctrl+${shortcut.shift ? "Shift+" : ""}${key}`;
}
