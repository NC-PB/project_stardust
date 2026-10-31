import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { Backlink, LinkCandidate_Serialize } from "@/bindings";
import { frontmatterLineCount } from "@/lib/editor";

/** At most this many files are offered while typing a link. */
export const LINK_OFFER_LIMIT = 50;

/**
 * The files a link can be typed to: the files of the search index (`inside`, the planning
 * root) and the markdown files outside the planning root (`outside`), sorted by path, each
 * path once.
 */
export function mergeCandidates(
  inside: LinkCandidate_Serialize[],
  outside: LinkCandidate_Serialize[],
): LinkCandidate_Serialize[] {
  const byPath = new Map<string, LinkCandidate_Serialize>();
  for (const candidate of [...outside, ...inside])
    byPath.set(candidate.path, candidate);
  return [...byPath.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

/**
 * Where a link is being typed in the source (`S-links`):
 * - `target`: after `](`, the target typed so far is replaced by the relative path.
 * - `new`: after `[[`, the `[[` and what follows up to the cursor (and a `]]` the editor
 *   closed after it) are replaced by a whole `[title](path)` link. `[[` is only a trigger;
 *   the file never keeps it (`R-plain-markdown`).
 */
export interface LinkQuery {
  kind: "target" | "new";
  /** What was typed to find the file. */
  query: string;
  /** The offsets in the text that the chosen link replaces. */
  from: number;
  to: number;
}

const TARGET = /\]\(([^()\s<>]*)$/;
const NEW = /\[\[([^[\]]*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The link being typed at offset `pos` of `text`, or `null` when there is none or the cursor
 * is in the frontmatter, a code fence or a code span, where links are not links.
 */
export function linkQueryAt(text: string, pos: number): LinkQuery | null {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  let lineEnd = text.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = text.length;
  const before = text.slice(lineStart, pos);
  const after = text.slice(pos, lineEnd);
  const target = TARGET.exec(before);
  const fresh = target ? null : NEW.exec(before);
  if (!target && !fresh) return null;
  if (inLiteral(text, lineStart) || (before.match(/`/g)?.length ?? 0) % 2 === 1)
    return null;
  if (target)
    return {
      kind: "target",
      query: target[1],
      from: pos - target[1].length,
      to: pos,
    };
  const match = fresh as RegExpExecArray;
  return {
    kind: "new",
    query: match[1],
    from: pos - match[0].length,
    to: pos + (after.startsWith("]]") ? 2 : 0),
  };
}

/** Whether the line starting at `lineStart` is in the frontmatter or a code fence. */
function inLiteral(text: string, lineStart: number): boolean {
  const lines = text.slice(0, lineStart).split("\n");
  // The text before the line ends with its line break, so the last part is empty.
  const index = lines.length - 1;
  if (index < frontmatterLineCount(text)) return true;
  let fence: string | null = null;
  for (const line of lines.slice(frontmatterLineCount(text), index)) {
    const mark = FENCE.exec(line)?.[1];
    if (mark === undefined) continue;
    if (fence === null) fence = mark;
    else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null;
  }
  return fence !== null;
}

/**
 * The files matching `query`, best first, leaving out `current` (the open file, relative to
 * the repository root). Every word of the query must be in the title, id or path, ignoring
 * case. An id or title starting with the query comes first, then by title and path.
 */
export function matchCandidates(
  candidates: LinkCandidate_Serialize[],
  query: string,
  current: string | null,
  limit = LINK_OFFER_LIMIT,
): LinkCandidate_Serialize[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const start = query.trim().toLowerCase();
  const rank = (candidate: LinkCandidate_Serialize) =>
    start !== "" &&
    ((candidate.id ?? "").startsWith(start) ||
      candidate.title.toLowerCase().startsWith(start))
      ? 0
      : 1;
  return candidates
    .filter((candidate) => candidate.path !== current)
    .filter((candidate) => {
      const haystack =
        `${candidate.title}\n${candidate.id ?? ""}\n${candidate.path}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.title.localeCompare(b.title) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, limit);
}

/**
 * The relative link from the file `from` to the file `to`, both relative to the repository
 * root with `/`. Characters a bare link target cannot hold are percent escaped, as the link
 * rewriting in Rust writes them.
 */
export function relativeLink(from: string, to: string): string {
  const dir = from.split("/").filter(Boolean).slice(0, -1);
  const target = to.split("/").filter(Boolean);
  let common = 0;
  while (
    common < dir.length &&
    common < target.length - 1 &&
    dir[common] === target[common]
  )
    common += 1;
  const parts = [
    ...Array<string>(dir.length - common).fill(".."),
    ...target.slice(common),
  ];
  return parts
    .join("/")
    .replace(/%/g, "%25")
    .replace(/ /g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

/** What choosing `candidate` for `query` inserts in the file `current`. */
export function linkInsertion(
  query: LinkQuery,
  candidate: LinkCandidate_Serialize,
  current: string,
): string {
  const target = relativeLink(current, candidate.path);
  if (query.kind === "target") return target;
  const title = candidate.title.replace(/[[\]\\]/g, (c) => `\\${c}`);
  return `[${title}](${target})`;
}

/** `path` relative to `repoRoot`, with `/`, or `null` when it is outside. */
export function repoRelative(repoRoot: string, path: string): string | null {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = path.replace(/\\/g, "/");
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : null;
}

/** The heading of the backlinks list for `count` files. */
export function backlinksLabel(count: number): string {
  if (count === 0) return "No files link here";
  return `Linked from ${count} ${count === 1 ? "file" : "files"}`;
}

/** The absolute path of `backlink` in the repository at `repoRoot`. */
export function backlinkPath(repoRoot: string, backlink: Backlink): string {
  return `${repoRoot.replace(/[\\/]+$/, "")}/${backlink.file}`;
}

/**
 * A CodeMirror completion source offering files while a link is typed (`S-links`).
 * `files` gives the candidates and `current` the open file relative to the repository
 * root, both read at each keystroke.
 */
export function linkCompletion(
  files: () => LinkCandidate_Serialize[],
  current: () => string | null,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const file = current();
    if (file === null) return null;
    const query = linkQueryAt(context.state.doc.toString(), context.pos);
    if (query === null) return null;
    const matches = matchCandidates(files(), query.query, file);
    if (matches.length === 0) return null;
    return {
      from: query.from,
      to: query.to,
      filter: false,
      options: matches.map((candidate) => ({
        label: candidate.title,
        detail: candidate.id ?? candidate.path,
        info: candidate.path,
        type: "file",
        apply: linkInsertion(query, candidate, file),
      })),
    };
  };
}
