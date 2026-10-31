import type { ComponentProps } from "react";
import type { ExtraProps } from "react-markdown";
import { Button } from "@/components/ui/button";
import { frontmatterLineCount } from "@/lib/editor";
import { findProposals } from "@/lib/proposals";
import { runCommand } from "@/stores/command-store";
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
 * The way back after Accept or Reject: an Undo button while the text is unchanged since; the
 * command's Ctrl/⌘+Z acts outside text fields, so in source mode the editor keeps its own undo.
 */
export function ProposalUndo() {
  const active = useEditorStore(
    (state) =>
      state.proposalUndo !== null && state.proposalUndo.after === state.text,
  );
  if (!active) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
      <span className="flex-1">Proposal resolved.</span>
      <Button
        variant="outline"
        size="xs"
        onClick={() => runCommand("editor.undo-proposal")}
      >
        Undo
      </Button>
    </div>
  );
}
