import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";
import { useProposalStore } from "@/stores/proposal-store";

/**
 * Every open proposal across the planning root (`S-proposals`), read again each time the
 * list opens; an entry opens its file in read mode.
 */
export function ProposalList() {
  const repoRoot = useProjectStore((state) => state.repoRoot);
  const { proposals, load, open } = useProposalStore();
  const [shown, setShown] = useState(false);

  if (repoRoot === null) return null;
  const toggle = () => {
    if (!shown) void load(repoRoot);
    setShown(!shown);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={toggle}
        aria-expanded={shown}
      >
        Proposals
      </Button>
      {shown && (
        <div className="absolute top-full left-0 z-10 mt-1 max-h-96 w-96 overflow-y-auto rounded-md border bg-background shadow-md">
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
                  className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span className="text-sm">{proposal.text || "(empty)"}</span>
                  <span className="text-muted-foreground">
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
