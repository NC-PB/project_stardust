import { Button } from "@/components/ui/button";
import { runCommand } from "@/stores/command-store";
import { useMenuStore } from "@/stores/menu-store";
import { useProjectStore } from "@/stores/project-store";
import { useProposalStore } from "@/stores/proposal-store";

/**
 * Every open proposal across the planning root (`S-proposals`), with the count on the
 * button. The list follows changes on disk; an entry opens its file in read mode.
 */
export function ProposalList() {
  const repoRoot = useProjectStore((state) => state.repoRoot);
  const { proposals, open } = useProposalStore();
  const { proposals: shown, setProposals: setShown } = useMenuStore();

  if (repoRoot === null) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => runCommand("proposals.toggle")}
        aria-expanded={shown}
        title="Open proposals in the planning files"
      >
        Proposals
        <span
          className={
            proposals.length > 0
              ? "code-id rounded-sm bg-primary px-1 text-primary-foreground"
              : "code-id text-muted-foreground"
          }
        >
          {proposals.length}
        </span>
      </Button>
      {shown && (
        <div className="absolute top-full right-0 z-30 mt-1 max-h-[70vh] w-[28rem] max-w-[90vw] overflow-y-auto rounded-md border bg-popover p-1 shadow-[0_8px_24px_-12px_rgb(30_39_51/0.35)]">
          {proposals.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">
              No open proposals
            </p>
          )}
          <ul>
            {proposals.map((proposal) => (
              <li key={`${proposal.path}:${proposal.line}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShown(false);
                    void open(repoRoot, proposal);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <span className="text-sm">{proposal.text || "(empty)"}</span>
                  <span className="code-id text-muted-foreground">
                    {proposal.path}:{proposal.line}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
