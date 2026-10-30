import { cn } from "cn";
import { usePromptStore } from "@/stores/prompt-store";

/** Confirms a copied prompt, or says why it was not copied (`S-prompts`); clears itself. */
export function PromptNotice() {
  const notice = usePromptStore((state) => state.notice);
  if (notice === null) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed right-4 bottom-4 rounded-md border bg-background px-3 py-2 text-sm shadow-md",
        notice.error && "border-destructive/50 text-destructive",
      )}
    >
      {notice.text}
    </div>
  );
}
