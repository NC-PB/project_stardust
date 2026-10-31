import { Button } from "@/components/ui/button";
import { PROMPT_LABELS, SPEC_PROMPTS } from "@/lib/prompts";
import { runCommand } from "@/stores/command-store";
import { useSpecStore } from "@/stores/spec-store";

/** Interview me, Integrate answers and Generate tasks for the spec view header (`S-prompts`). */
export function SpecPrompts() {
  const repoRoot = useSpecStore((state) => state.repoRoot);
  if (repoRoot === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">Copy prompt</span>
      {SPEC_PROMPTS.map((prompt) => (
        <Button
          key={prompt}
          variant="secondary"
          size="xs"
          onClick={() => runCommand(`prompt.${prompt}`)}
        >
          {PROMPT_LABELS[prompt]}
        </Button>
      ))}
    </div>
  );
}
