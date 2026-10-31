import { frontmatterLineCount } from "@/lib/editor";

/**
 * A proposal (`S-proposals`): a blockquote whose first line starts with `**Proposal:**`.
 * The block is the run of consecutive lines starting with `>` (after any indentation),
 * outside the frontmatter and code fences. Lazy continuation lines without `>` are not part
 * of it. `src-tauri/src/domain/proposals.rs` finds them by the same rules.
 */
export interface Proposal {
  /** 1-based line of the first `>` line in the whole file text. */
  start: number;
  /** 1-based line of the last `>` line, inclusive. */
  end: number;
}

/** What to do with a proposal: Accept unwraps it into plain text, Reject removes it. */
export type ProposalAction = "accept" | "reject";

const LABEL = "**Proposal:**";
const QUOTE = /^([ \t]*)> ?/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** The lines of `text`, each with its line ending; joined they give `text` again. */
function splitLines(text: string): string[] {
  return text === "" ? [] : text.split(/(?<=\n)/);
}

function contentOf(line: string): string {
  return line.replace(/\r?\n$/, "");
}

function endingOf(line: string): string {
  return line.slice(contentOf(line).length);
}

/** The line without its first `>` marker and the one space after it; indentation stays. */
function unquote(line: string): string {
  return contentOf(line).replace(QUOTE, "$1");
}

/** Every proposal in `text`, in file order. */
export function findProposals(text: string): Proposal[] {
  const lines = splitLines(text).map(contentOf);
  const proposals: Proposal[] = [];
  let fence: string | null = null;
  let i = frontmatterLineCount(text);
  while (i < lines.length) {
    const line = lines[i];
    const marker = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length)
        fence = null;
      i += 1;
    } else if (marker !== undefined) {
      fence = marker;
      i += 1;
    } else if (QUOTE.test(line)) {
      let end = i;
      while (end + 1 < lines.length && QUOTE.test(lines[end + 1])) end += 1;
      if (unquote(line).trimStart().startsWith(LABEL))
        proposals.push({ start: i + 1, end: end + 1 });
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return proposals;
}

/**
 * `text` with the proposal starting at 1-based line `start` accepted or rejected, or `null`
 * when no proposal starts there. Only the lines of the block change, plus one blank line
 * for Reject:
 * - Accept drops one `>` marker and the space after it from every line, keeping the
 *   indentation, and drops the `**Proposal:**` label with the spaces after it. A label alone
 *   on its line removes that line, and blank lines that would then open the text.
 * - Reject removes the block and the blank line after it, or the one before it when there is
 *   none after it.
 */
export function resolveProposal(
  text: string,
  start: number,
  action: ProposalAction,
): string | null {
  const proposal = findProposals(text).find((found) => found.start === start);
  if (proposal === undefined) return null;
  const lines = splitLines(text);
  const from = proposal.start - 1;
  const to = proposal.end;
  const isBlank = (index: number) =>
    index >= 0 && index < lines.length && contentOf(lines[index]).trim() === "";

  if (action === "reject") {
    if (isBlank(to))
      return [...lines.slice(0, from), ...lines.slice(to + 1)].join("");
    if (isBlank(from - 1))
      return [...lines.slice(0, from - 1), ...lines.slice(to)].join("");
    return [...lines.slice(0, from), ...lines.slice(to)].join("");
  }

  const unwrapped = lines.slice(from, to).map((line, index) => {
    let content = unquote(line);
    if (index === 0) {
      const indent = /^[ \t]*/.exec(content)?.[0] ?? "";
      content =
        indent +
        content.slice(indent.length + LABEL.length).replace(/^[ \t]+/, "");
    }
    return {
      content: content.trim() === "" ? "" : content,
      ending: endingOf(line),
    };
  });
  while (unwrapped.length > 0 && unwrapped[0].content === "") unwrapped.shift();
  const kept = unwrapped.map(({ content, ending }) => content + ending);
  return [...lines.slice(0, from), ...kept, ...lines.slice(to)].join("");
}
