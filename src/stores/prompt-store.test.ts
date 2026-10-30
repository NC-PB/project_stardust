import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fillPrompt = vi.fn();
const writeText = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    fillPrompt: (...args: unknown[]) => fillPrompt(...args),
  },
}));

import { NOTICE_MS, usePromptStore } from "./prompt-store";

const input = { task_path: "docs/planning/next/a.md", node_id: null };

describe("usePromptStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fillPrompt.mockReset();
    writeText.mockReset();
    usePromptStore.setState({ notice: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("copies the filled prompt and confirms it for a while", async () => {
    fillPrompt.mockResolvedValue({ status: "ok", data: "Work on a.md" });
    writeText.mockResolvedValue(undefined);
    await usePromptStore.getState().copy("/repo", "work-on-task", input);
    expect(fillPrompt).toHaveBeenCalledWith("/repo", "work-on-task", input);
    expect(writeText).toHaveBeenCalledWith("Work on a.md");
    expect(usePromptStore.getState().notice).toEqual({
      text: 'Copied "Work on task" to the clipboard',
      error: false,
    });
    vi.advanceTimersByTime(NOTICE_MS);
    expect(usePromptStore.getState().notice).toBeNull();
  });

  it("starts a ClipboardItem write within the click where the webview has one", async () => {
    const write = vi.fn(async (items: { text: Promise<Blob> }[]) => {
      await items[0].text;
    });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        text: Promise<Blob>;
        constructor(data: Record<string, Promise<Blob>>) {
          this.text = data["text/plain"];
        }
      },
    );
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    fillPrompt.mockResolvedValue({ status: "ok", data: "x" });
    const copied = usePromptStore.getState().copy("/repo", "handoff", input);
    expect(write).toHaveBeenCalledTimes(1);
    await copied;
    expect(writeText).not.toHaveBeenCalled();
    expect(usePromptStore.getState().notice?.error).toBe(false);
  });

  it("copies nothing when the prompt cannot be filled", async () => {
    fillPrompt.mockResolvedValue({ status: "error", error: "needs a task" });
    await usePromptStore.getState().copy("/repo", "handoff", input);
    expect(writeText).not.toHaveBeenCalled();
    expect(usePromptStore.getState().notice?.error).toBe(true);
  });

  it("says when the clipboard refuses", async () => {
    fillPrompt.mockResolvedValue({ status: "ok", data: "x" });
    writeText.mockRejectedValue(new Error("denied"));
    await usePromptStore.getState().copy("/repo", "verify-task", input);
    expect(usePromptStore.getState().notice).toEqual({
      text: "Not copied: Error: denied",
      error: true,
    });
  });
});
