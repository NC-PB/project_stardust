import { create } from "zustand";
import { commands, type Prompt, type PromptInput } from "@/bindings";
import { PROMPT_LABELS } from "@/lib/prompts";

/** A notice stays this long. */
export const NOTICE_MS = 2500;

interface Notice {
  text: string;
  error: boolean;
}

interface PromptState {
  notice: Notice | null;
  /** Fills `prompt` for the repository at `repoRoot` and copies it to the clipboard. */
  copy: (repoRoot: string, prompt: Prompt, input: PromptInput) => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Writes `text` to the clipboard once it resolves. WebKit (macOS, Linux) only allows a write
 * during the click, so the write starts at once with a `ClipboardItem` holding the promise;
 * where that is missing or refused, `writeText` follows.
 */
async function writeClipboard(text: Promise<string>): Promise<void> {
  const { clipboard } = navigator;
  if (
    typeof ClipboardItem !== "undefined" &&
    typeof clipboard.write === "function"
  ) {
    const blob = text.then(
      (value) => new Blob([value], { type: "text/plain" }),
    );
    try {
      await clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // Falls through to `writeText`, which also reports a fill error from `text`.
    }
  }
  await clipboard.writeText(await text);
}

/** Prompt buttons and the notice that confirms a copy (`S-prompts`). */
export const usePromptStore = create<PromptState>()((set) => {
  const show = (notice: Notice) => {
    clearTimeout(timer);
    set({ notice });
    timer = setTimeout(() => set({ notice: null }), NOTICE_MS);
  };

  return {
    notice: null,

    copy: async (repoRoot, prompt, input) => {
      const label = PROMPT_LABELS[prompt];
      // Started before the first `await`, so the clipboard write still counts as part of the click.
      const filled = commands.fillPrompt(repoRoot, prompt, input);
      const text = filled.then((result) =>
        result.status === "ok" ? result.data : Promise.reject(result.error),
      );
      try {
        await writeClipboard(text);
        show({ text: `Copied "${label}" to the clipboard`, error: false });
      } catch (err) {
        const result = await filled;
        const reason = result.status === "error" ? result.error : String(err);
        show({ text: `Not copied: ${reason}`, error: true });
      }
    },
  };
});
