import { nodeInputOf, PROMPT_LABELS } from "@/lib/prompts";
import { usePromptStore } from "@/stores/prompt-store";
import { useSpecStore } from "@/stores/spec-store";

/** Copies Verify area for the node `nodeId` and its subtree (`S-prompts`). */
export function VerifyAreaButton({ nodeId }: { nodeId: string }) {
  const repoRoot = useSpecStore((state) => state.repoRoot);
  const copy = usePromptStore((state) => state.copy);
  if (repoRoot === null) return null;
  return (
    <button
      type="button"
      onClick={() => void copy(repoRoot, "verify-area", nodeInputOf(nodeId))}
      title={`Copy the Verify area prompt for ${nodeId}`}
      className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {PROMPT_LABELS["verify-area"]}
    </button>
  );
}
