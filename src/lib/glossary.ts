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

/**
 * The terms and their plural forms in one regular expression, longer forms first, the
 * entries by key and the key of every form.
 */
interface Matcher {
  pattern: RegExp;
  entries: Map<string, GlossaryEntry>;
  forms: Map<string, string>;
}

/** Case insensitive and with any run of whitespace between words. */
function keyOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The simple English plural of a key, made on its last word: "ies" for a consonant and
 * "y", "es" after s, x, z, ch and sh, else "s". `null` when the last word does not end
 * in a letter. No stemming: irregular plurals are not known.
 */
export function pluralOf(key: string): string | null {
  if (!/\p{L}$/u.test(key)) return null;
  if (/[^aeiou]y$/.test(key)) return `${key.slice(0, -1)}ies`;
  if (/(?:[sxz]|ch|sh)$/.test(key)) return `${key}es`;
  return `${key}s`;
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
  const forms = new Map<string, string>();
  for (const key of entries.keys()) forms.set(key, key);
  // A plural that is itself a term stays that term.
  for (const key of entries.keys()) {
    const plural = pluralOf(key);
    if (plural !== null && !forms.has(plural)) forms.set(plural, key);
  }
  // At one position the alternation takes the first alternative that matches, so longer
  // forms go first: "Terminal column" wins over "Column", "Tasks" over "Task".
  const alternatives = [...forms.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.split(" ").map(escapeRegExp).join("\\s+"));
  // Whole words: no letter, digit or underscore right before or after.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return { pattern, entries, forms };
}

/** Nodes whose text is not marked: code, links and terms already marked. */
const SKIPPED = new Set(["link", "linkReference", "glossaryTerm"]);

/** Blocks inside which each term is marked once. Headings are left alone. */
const BLOCKS = new Set(["paragraph", "tableCell"]);

/**
 * Marks the first case insensitive whole word occurrence of each glossary term or its
 * simple plural per paragraph (and table cell), outside code and links (`S-glossary`).
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
  { pattern, entries, forms }: Matcher,
  marked: Set<string>,
): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  for (const match of node.value.matchAll(pattern)) {
    const key = forms.get(keyOf(match[0]));
    const entry = key === undefined ? undefined : entries.get(key);
    if (key === undefined || entry === undefined || marked.has(key)) continue;
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

/**
 * The title gives the native hover tooltip. Keyboard focus shows the same text from
 * `data-definition` as a CSS tooltip (`.glossary-term` in `src/index.css`).
 */
function termNode(text: string, entry: GlossaryEntry): GlossaryTermNode {
  const definition = `${entry.term}: ${entry.definition}`;
  return {
    type: "glossaryTerm",
    children: [{ type: "text", value: text }],
    data: {
      hName: "abbr",
      hProperties: {
        title: definition,
        className: ["glossary-term"],
        tabIndex: 0,
        dataDefinition: definition,
      },
    },
  };
}

/** Remark plugin for read mode: glossary terms show their definition on hover and focus. */
export function remarkGlossary(options: {
  terms: readonly GlossaryEntry[];
}): (tree: Root) => void {
  return (tree) => markGlossaryTerms(tree, options.terms);
}
