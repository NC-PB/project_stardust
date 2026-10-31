import { create } from "zustand";
import { commands } from "@/bindings";
import { answerProblem } from "@/lib/questions";
import { specPathOf } from "@/lib/spec-view";
import { useEditorStore } from "./editor-store";
import { useSpecStore } from "./spec-store";
import { settleInTab } from "./tab-snapshots";

interface QuestionsState {
  /**
   * The project whose questions these are; follows the spec store. A save's answer lands in
   * this tab's state, shown or hidden (D-20261031-063321-ns0a).
   */
  repoRoot: string | null;
  /** The answer typed for each open question, by `Q-` id, until it is saved. */
  drafts: Record<string, string>;
  /** The question being saved; `null` when none is. */
  saving: string | null;
  /** Why the last save of a question was refused, by `Q-` id. */
  errors: Record<string, string>;
  /**
   * Questions answered this session. The form hides them until the spec store reads the spec
   * again from the watcher batch, which then lists them as answered.
   */
  answered: string[];
  setDraft: (id: string, answer: string) => void;
  /**
   * Answers the question `id` with its draft (`S-questions`, `R-append-only`). When the spec
   * file is open in the editor, its unsaved edits are saved first; refused while they cannot
   * be (a conflict or an append-only violation), so the answer never meets unsaved edits.
   */
  save: (id: string) => Promise<void>;
  clear: () => void;
}

const EMPTY = { drafts: {}, saving: null, errors: {}, answered: [] };

const failed = (id: string, message: string) => (state: QuestionsState) => ({
  saving: null,
  errors: { ...state.errors, [id]: message },
});

/** The answers typed into the Questions form and their saving (`S-questions`). */
export const useQuestionsStore = create<QuestionsState>()((set, get) => {
  const fail = (id: string, message: string) => set(failed(id, message));
  /** A failure after waiting, written into the tab the save started in. */
  const failIn = (repoRoot: string, id: string, message: string) =>
    settleInTab(useQuestionsStore, repoRoot, failed(id, message));

  return {
    repoRoot: null,
    ...EMPTY,

    setDraft: (id, answer) =>
      set((state) => {
        const { [id]: _, ...errors } = state.errors;
        return { drafts: { ...state.drafts, [id]: answer }, errors };
      }),

    save: async (id) => {
      const { repoRoot, config, spec } = useSpecStore.getState();
      const answer = get().drafts[id] ?? "";
      if (repoRoot === null || config === null || spec === null) return;
      if (get().saving !== null) return;
      const problem = answerProblem(answer);
      if (problem !== null) {
        fail(id, problem);
        return;
      }
      const question = spec.questions.find((question) => question.id === id);
      if (question === undefined) {
        fail(id, `${id} is no longer in the spec`);
        return;
      }
      set({ saving: id, repoRoot });

      // The file holding the question may be open with edits that are not on disk yet.
      const path = specPathOf(repoRoot, config.planning_root, question.at.file);
      const editor = useEditorStore.getState();
      if (editor.path === path) {
        if (editor.conflict !== null) {
          fail(id, "Resolve the change on disk in the editor before answering");
          return;
        }
        await editor.save();
        const after = useEditorStore.getState();
        if (after.path === path && after.text !== after.saved) {
          failIn(
            repoRoot,
            id,
            "The spec has edits in the editor that cannot be saved; fix them first",
          );
          return;
        }
      }

      const result = await commands.answerQuestion(repoRoot, id, answer);
      if (result.status === "error") {
        failIn(repoRoot, id, `Not saved: ${result.error}`);
        return;
      }
      settleInTab(useQuestionsStore, repoRoot, (state) => {
        const { [id]: _, ...drafts } = state.drafts;
        return {
          saving: null,
          drafts,
          answered: [...state.answered, id],
        };
      });
    },

    clear: () => set(EMPTY),
  };
});

// Another project's questions start without drafts.
useSpecStore.subscribe((state, previous) => {
  if (state.repoRoot !== previous.repoRoot) {
    useQuestionsStore.getState().clear();
    useQuestionsStore.setState({ repoRoot: state.repoRoot });
  }
});
