import type { Parent, PhrasingContent, Root, RootContent, Text } from "mdast";
import type { GlossaryTerm } from "@/bindings";

/** A glossary term as the marking needs it. */
export type GlossaryEntry = Pick<GlossaryTerm, "term" | "definition">;

/** A glossary term found in the text, rendered as `<abbr>` with the definition as title. */
export interface GlossaryTermNode extends Parent {
  type: "glossaryTerm";
  children: Text[];
}

declare module "mdast" {
  interface PhrasingContentMap {
    glossaryTerm: GlossaryTermNode;
  }
  interface RootContentMap {
    glossaryTerm: GlossaryTermNode;
  }
}

/** The terms in one regular expression, longer terms first, and their entries by key. */
interface Matcher {
  pattern: RegExp;
  entries: Map<string, GlossaryEntry>;
}

/** Case insensitive and with any run of whitespace between words. */
function keyOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `null` when there are no terms. The first definition of a term wins. */
export function glossaryMatcher(
  terms: readonly GlossaryEntry[],
): Matcher | null {
  const entries = new Map<string, GlossaryEntry>();
  for (const entry of terms) {
    const key = keyOf(entry.term);
    if (key !== "" && !entries.has(key)) entries.set(key, entry);
  }
  if (entries.size === 0) return null;
  // At one position the alternation takes the first alternative that matches, so longer
  // terms go first: "Terminal column" wins over "Column".
  const alternatives = [...entries.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.split(" ").map(escapeRegExp).join("\\s+"));
  // Whole words: no letter, digit or underscore right before or after.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return { pattern, entries };
}

/** Nodes whose text is not marked: code, links and terms already marked. */
const SKIPPED = new Set(["link", "linkReference", "glossaryTerm"]);

/** Blocks inside which each term is marked once. Headings are left alone. */
const BLOCKS = new Set(["paragraph", "tableCell"]);

/**
 * Marks the first case insensitive whole word occurrence of each glossary term per
 * paragraph (and table cell), outside code and links (`S-glossary`).
 */
export function markGlossaryTerms(
  tree: Root,
  terms: readonly GlossaryEntry[],
): void {
  const matcher = glossaryMatcher(terms);
  if (matcher === null) return;
  const visit = (node: Root | RootContent) => {
    if (!("children" in node)) return;
    if (BLOCKS.has(node.type)) {
      markPhrasing(node as Parent, matcher, new Set());
      return;
    }
    if (node.type === "heading") return;
    for (const child of node.children) visit(child);
  };
  visit(tree);
}

function markPhrasing(parent: Parent, matcher: Matcher, marked: Set<string>) {
  const children: RootContent[] = [];
  for (const child of parent.children) {
    if (child.type === "text")
      children.push(...splitText(child, matcher, marked));
    else {
      if ("children" in child && !SKIPPED.has(child.type))
        markPhrasing(child, matcher, marked);
      children.push(child);
    }
  }
  parent.children = children;
}

/** The text with the terms not yet marked in this block cut out as term nodes. */
function splitText(
  node: Text,
  { pattern, entries }: Matcher,
  marked: Set<string>,
): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  for (const match of node.value.matchAll(pattern)) {
    const key = keyOf(match[0]);
    const entry = entries.get(key);
    if (entry === undefined || marked.has(key)) continue;
    marked.add(key);
    const start = match.index;
    if (start > last)
      parts.push({ type: "text", value: node.value.slice(last, start) });
    parts.push(termNode(match[0], entry));
    last = start + match[0].length;
  }
  if (parts.length === 0) return [node];
  if (last < node.value.length)
    parts.push({ type: "text", value: node.value.slice(last) });
  return parts;
}

function termNode(text: string, entry: GlossaryEntry): GlossaryTermNode {
  return {
    type: "glossaryTerm",
    children: [{ type: "text", value: text }],
    data: {
      hName: "abbr",
      hProperties: {
        title: `${entry.term}: ${entry.definition}`,
        className: ["glossary-term"],
      },
    },
  };
}

/** Remark plugin for read mode: glossary terms show their definition on hover. */
export function remarkGlossary(options: {
  terms: readonly GlossaryEntry[];
}): (tree: Root) => void {
  return (tree) => markGlossaryTerms(tree, options.terms);
}
