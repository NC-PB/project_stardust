import { type ComponentProps, useEffect } from "react";
import type { ExtraProps } from "react-markdown";
import { Button } from "@/components/ui/button";
import { frontmatterLineCount, isShortcut } from "@/lib/editor";
import { findProposals } from "@/lib/proposals";
import { useEditorStore } from "@/stores/editor-store";

/**
 * A blockquote in read mode; a proposal gets Accept and Reject (`S-proposals`). Read mode
 * renders the body without the frontmatter, so its line numbers are shifted by its length.
 */
export function ProposalQuote({
  node,
  children,
  ...props
}: ComponentProps<"blockquote"> & ExtraProps) {
  const text = useEditorStore((state) => state.text);
  const resolve = useEditorStore((state) => state.resolveProposal);
  const bodyLine = node?.position?.start.line;
  const start =
    bodyLine === undefined ? null : bodyLine + frontmatterLineCount(text);
  const isProposal =
    start !== null &&
    findProposals(text).some((proposal) => proposal.start === start);
  if (!isProposal || start === null)
    return <blockquote {...props}>{children}</blockquote>;
  return (
    <blockquote
      {...props}
      className="flex flex-col gap-2 border-primary text-foreground"
    >
      {children}
      <span className="flex gap-2">
        <Button
          size="xs"
          onClick={() => resolve(start, "accept")}
          title="Unwraps the quote into plain text"
        >
          Accept
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => resolve(start, "reject")}
          title="Removes the proposal"
        >
          Reject
        </Button>
      </span>
    </blockquote>
  );
}

/**
 * The way back after Accept or Reject: an Undo button while the text is unchanged since,
 * and Ctrl/⌘+Z in read mode, where no source editor holds the history.
 */
export function ProposalUndo() {
  const { path, text, modes, proposalUndo, undoProposal } = useEditorStore();
  const active = proposalUndo !== null && proposalUndo.after === text;
  const readMode = path !== null && modes[path] === "read";

  useEffect(() => {
    if (!active || !readMode) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (!isShortcut(event, "z")) return;
      event.preventDefault();
      undoProposal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, readMode, undoProposal]);

  if (!active) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
      <span className="flex-1">Proposal resolved.</span>
      <Button variant="outline" size="xs" onClick={undoProposal}>
        Undo
      </Button>
    </div>
  );
}
