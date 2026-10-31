import { beforeEach, describe, expect, it, vi } from "vitest";

const answerQuestion = vi.fn();
const save = vi.fn();
const editor = {
  path: null as string | null,
  text: "",
  saved: "",
  conflict: null as unknown,
  save,
};
const specState = {
  repoRoot: "/repo" as string | null,
  config: { planning_root: "docs/planning" },
  spec: {
    questions: [{ id: "Q-1", at: { file: "spec/questions.md", line: 5 } }],
  },
};

vi.mock("@/bindings", () => ({
  commands: {
    answerQuestion: (...args: unknown[]) => answerQuestion(...args),
  },
}));
vi.mock("./editor-store", () => ({
  useEditorStore: { getState: () => editor },
}));
vi.mock("./spec-store", () => ({
  useSpecStore: { getState: () => specState, subscribe: () => () => {} },
}));

import { useQuestionsStore } from "./questions-store";

const PATH = "/repo/docs/planning/spec/questions.md";

describe("useQuestionsStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(editor, { path: null, text: "", saved: "", conflict: null });
    useQuestionsStore.getState().clear();
  });

  it("saves the answer and hides the question until the spec is read again", async () => {
    answerQuestion.mockResolvedValue({
      status: "ok",
      data: { id: "Q-1", at: { file: "spec/questions.md", line: 9 } },
    });
    useQuestionsStore.getState().setDraft("Q-1", "Blue.");
    await useQuestionsStore.getState().save("Q-1");
    expect(answerQuestion).toHaveBeenCalledWith("/repo", "Q-1", "Blue.");
    const state = useQuestionsStore.getState();
    expect(state.drafts).toEqual({});
    expect(state.answered).toEqual(["Q-1"]);
    expect(state.saving).toBeNull();
  });

  it("keeps the draft and shows why Rust refused", async () => {
    answerQuestion.mockResolvedValue({
      status: "error",
      error: "Q-1 is answered already",
    });
    useQuestionsStore.getState().setDraft("Q-1", "Blue.");
    await useQuestionsStore.getState().save("Q-1");
    const state = useQuestionsStore.getState();
    expect(state.drafts).toEqual({ "Q-1": "Blue." });
    expect(state.errors["Q-1"]).toBe("Not saved: Q-1 is answered already");
  });

  it("does not send an empty answer", async () => {
    await useQuestionsStore.getState().save("Q-1");
    expect(answerQuestion).not.toHaveBeenCalled();
    expect(useQuestionsStore.getState().errors["Q-1"]).toBeDefined();
  });

  it("saves the spec file open in the editor first", async () => {
    Object.assign(editor, { path: PATH, text: "edited", saved: "old" });
    save.mockImplementation(async () => {
      editor.saved = editor.text;
    });
    answerQuestion.mockResolvedValue({ status: "ok", data: {} });
    useQuestionsStore.getState().setDraft("Q-1", "Blue.");
    await useQuestionsStore.getState().save("Q-1");
    expect(save).toHaveBeenCalled();
    expect(answerQuestion).toHaveBeenCalled();
  });

  it("refuses while the open spec file has edits that cannot be saved or a conflict", async () => {
    Object.assign(editor, { path: PATH, text: "edited", saved: "old" });
    useQuestionsStore.getState().setDraft("Q-1", "Blue.");
    await useQuestionsStore.getState().save("Q-1");
    expect(answerQuestion).not.toHaveBeenCalled();
    expect(useQuestionsStore.getState().errors["Q-1"]).toMatch(/fix them/);

    editor.conflict = { kind: "removed" };
    await useQuestionsStore.getState().save("Q-1");
    expect(save).toHaveBeenCalledTimes(1);
    expect(useQuestionsStore.getState().errors["Q-1"]).toMatch(/Resolve/);
  });
});
