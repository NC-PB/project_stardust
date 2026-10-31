import { resolveLink } from "@/lib/editor";
import { specPathOf } from "@/lib/spec-view";

/**
 * The micromark constructs that start blocks, raw HTML and images. Turned off, their markup
 * stays text: a line `- sub` under a criterion keeps its dash instead of becoming a list.
 */
export const BLOCK_CONSTRUCTS = [
  "blockQuote",
  "codeFenced",
  "codeIndented",
  "definition",
  "headingAtx",
  "setextUnderline",
  "thematicBreak",
  "list",
  "htmlFlow",
  "htmlText",
  "labelStartImage",
] as const;

/** The elements inline markdown renders; anything else is unwrapped to its text. */
export const INLINE_ELEMENTS = ["code", "em", "strong", "a"] as const;

/** The part of a unified processor the plugin needs; its data holds the parser extensions. */
interface ProcessorData {
  data(): object;
}

/**
 * Remark plugin for one-line texts such as node titles and criteria: only inline code,
 * emphasis and links are markup, every block construct is read as plain text.
 */
export function remarkInlineOnly(this: ProcessorData): void {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  data.micromarkExtensions = [
    ...(data.micromarkExtensions ?? []),
    { disable: { null: [...BLOCK_CONSTRUCTS] } },
  ];
}

/**
 * The file a link in a spec text opens: a relative `.md` link resolved from the spec file the
 * text is in (`file` relative to the planning root, as in `SourceLine`). `null` for anything
 * else, such as web links and anchors.
 */
export function specLinkTarget(
  repoRoot: string,
  planningRoot: string,
  file: string,
  href: string,
): string | null {
  return resolveLink(specPathOf(repoRoot, planningRoot, file), href);
}
