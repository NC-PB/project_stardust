/** Images dropped into the editor and shown in read mode (`S-images`). */

import { bodyOf } from "@/lib/editor";

/** Text to insert into the editor text: `insert` at offset `from`. */
export type Insertion = { from: number; insert: string };

/**
 * Where the image links `snippets` go in `text`: each on its own line at offset `at`, or as a
 * paragraph of their own at the end when `at` is `null` (a drop in read mode). A position in
 * the frontmatter moves to the start of the body, so the frontmatter stays valid.
 */
export function dropInsertion(
  text: string,
  at: number | null,
  snippets: string[],
): Insertion {
  const links = snippets.join("\n");
  if (at === null) {
    const before =
      text === "" || text.endsWith("\n\n")
        ? ""
        : text.endsWith("\n")
          ? "\n"
          : "\n\n";
    return { from: text.length, insert: `${before}${links}\n` };
  }
  const bodyStart = text.length - bodyOf(text).length;
  const from = Math.max(bodyStart, Math.min(at, text.length));
  const before = from > 0 && text[from - 1] !== "\n" ? "\n" : "";
  const after = from < text.length && text[from] !== "\n" ? "\n" : "";
  return { from, insert: `${before}${links}${after}` };
}

/** `text` with `insertion` applied; nothing of `text` is removed. */
export function applyInsertion(text: string, { from, insert }: Insertion) {
  return text.slice(0, from) + insert + text.slice(from);
}

/**
 * The CSS pixel point of a drop position, which Tauri reports in physical pixels relative to
 * the webview.
 */
export function dropPoint(
  position: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  const factor = scale > 0 ? scale : 1;
  return { x: position.x / factor, y: position.y / factor };
}

/** What the badge of an image that is not shown says. */
export function imageBadge(
  alt: string | undefined,
  src: string | undefined,
  problem: { kind: "missing" } | { kind: "refused"; reason: string },
): { label: string; title: string } {
  const name = alt?.trim() || src || "image";
  if (problem.kind === "missing")
    return {
      label: `Missing image: ${name}`,
      title: `No file at ${src ?? "?"}. Images are not in git, so it may not be synced to this machine.`,
    };
  return { label: `Image not shown: ${name}`, title: problem.reason };
}

/** The notice for dropped files that could not be added, or `null` when all were. */
export function dropFailures(failures: string[]): string | null {
  if (failures.length === 0) return null;
  return `Not added: ${failures.join("; ")}`;
}
