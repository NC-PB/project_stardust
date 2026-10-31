import { create } from "zustand";
import {
  type AppendOnlyViolation_Serialize,
  type ChangeBatch,
  commands,
  type Task_Serialize,
} from "@/bindings";
import {
  AUTOSAVE_MS,
  type EditorMode,
  type FormField,
  fieldValueOf,
  fileNameOf,
  followFile,
  touchesFile,
} from "@/lib/editor";
import {
  applyInsertion,
  dropFailures,
  dropInsertion,
  fileBase64,
} from "@/lib/images";
import { type ProposalAction, resolveProposal } from "@/lib/proposals";

/** Why the open file and the disk disagree while there are unsaved edits (`S-conflicts`). */
export type Conflict =
  /** Another program changed the file; `disk` is its text now. */
  | { kind: "changed"; disk: string }
  /** The file is gone from disk. */
  | { kind: "removed" };

interface EditorState {
  repoRoot: string | null;
  /** The open file, absolute; `null` when no file is open. */
  path: string | null;
  /** The text in the editor, saved or not. */
  text: string;
  /** The text as last read from or written to disk; `text` differs while edits are unsaved. */
  saved: string;
  /** The task parsed from `text`, for the frontmatter form (`S-editor-core`). */
  task: Task_Serialize | null;
  /** Source or read mode of each file opened this session (`S-editor-layout`). */
  modes: Record<string, EditorMode>;
  /** Set while unsaved edits meet a change on disk; nothing is saved until it is resolved. */
  conflict: Conflict | null;
  /** The edits a reload replaced, kept so they can be brought back until dismissed. */
  replaced: string | null;
  /** The text selected in the open file, in either mode; empty without a selection. */
  selection: string;
  /** Why the file could not be read or saved; cleared by the next successful save. */
  error: string | null;
  /**
   * A line the source view should scroll to and put the cursor on, 1-based; set by `open` with
   * a line, cleared by the editor once shown with `revealed`.
   */
  reveal: number | null;
  /**
   * Opens the file at `path` of the repository at `repoRoot`, saving the open file first. With
   * `line`, the file shows in source mode scrolled to that line, also when it is open already.
   */
  open: (repoRoot: string, path: string, line?: number) => Promise<void>;
  /** Called by the editor once it has shown `reveal`. */
  revealed: () => void;
  /**
   * The questions and decisions the unsaved edits change or remove (`S-decisions`,
   * `R-append-only`). While there are any, nothing is saved; the edits stay in the editor.
   */
  violations: AppendOnlyViolation_Serialize[];
  /** Saves and closes the open file; stays open when the edits cannot be saved. */
  close: () => Promise<void>;
  /** Replaces the text; it is saved once typing stops for `AUTOSAVE_MS`. */
  edit: (text: string) => void;
  /** Sets a frontmatter field from what was typed into the form; returns why it cannot. */
  setField: (field: FormField, input: string) => Promise<string | null>;
  /** Writes unsaved edits now, unless the file changed on disk meanwhile. */
  save: () => Promise<void>;
  toggleMode: () => void;
  /** Follows, reloads or flags the open file after a batch of changes on disk. */
  apply: (batch: ChangeBatch) => Promise<void>;
  /** Takes the text on disk; the edits it replaces stay in `replaced`. */
  reload: () => Promise<void>;
  /** Saves the edits over the change on disk. */
  keepMine: () => Promise<void>;
  /** Writes the edits of a removed file back to its place. */
  restoreFile: () => Promise<void>;
  /** Closes a removed file without its edits. */
  discard: () => void;
  /** Brings back the edits the last reload replaced. */
  restoreReplaced: () => void;
  dismissReplaced: () => void;
  setSelection: (selection: string) => void;
  /**
   * Moves the open file to the OS trash and closes it (`S-trash`). Unsaved edits are saved
   * first, so the trash holds the latest text; refused while a conflict is open.
   */
  trash: () => Promise<void>;
  /** Creates a task in the first column from the selection and opens it (`S-make-task`). */
  makeTask: () => Promise<void>;
  /**
   * Copies the dropped files `paths` into the image root and inserts their links at offset
   * `at` of the text, or at the end for `null` (`S-images`). Files that are not added are
   * named in `error`.
   */
  dropImages: (paths: string[], at: number | null) => Promise<void>;
  /**
   * Writes images pasted from the clipboard into the image root and inserts their links like
   * a drop: at offset `at`, or at the end when `null` (`S-images`).
   */
  pasteImages: (files: File[], at: number | null) => Promise<void>;
  /** The text before and after the last Accept or Reject, so it can be undone (`S-proposals`). */
  proposalUndo: { before: string; after: string } | null;
  /**
   * Accepts or rejects the proposal starting at 1-based line `start` of the text as one edit,
   * saved like typing; returns whether a proposal was there.
   */
  resolveProposal: (start: number, action: ProposalAction) => boolean;
  /** Restores the text before the last Accept or Reject, unless it was edited since. */
  undoProposal: () => void;
}

let autosave: ReturnType<typeof setTimeout> | undefined;
/** Disk work in progress; saves and checks run one after another so an older text never wins. */
let queue: Promise<void> = Promise.resolve();

function cancelAutosave() {
  clearTimeout(autosave);
  autosave = undefined;
}

function enqueue(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work, work);
  return queue;
}

const CLOSED = {
  repoRoot: null,
  path: null,
  text: "",
  saved: "",
  task: null,
  conflict: null,
  replaced: null,
  selection: "",
  error: null,
  reveal: null,
  violations: [] as AppendOnlyViolation_Serialize[],
  proposalUndo: null,
};

/** The file open in the editor (`S-editor-core`, `S-editor-layout`, `S-conflicts`). */
export const useEditorStore = create<EditorState>()((set, get) => {
  /** Parses `text` for the form, unless the text changed again meanwhile. */
  const parse = async (path: string, text: string) => {
    const task = await commands.parseTaskText(fileNameOf(path), text);
    if (get().path === path && get().text === text) set({ task });
  };

  /** Shows `text`, read from disk, as the saved state of the open file. */
  const load = (path: string, text: string) => {
    set({ text, saved: text, conflict: null, violations: [] });
    void parse(path, text);
  };

  const writeNow = async () => {
    cancelAutosave();
    const { repoRoot, path, text, saved, conflict } = get();
    // Edits undone by hand leave nothing refused.
    if (text === saved) set({ violations: [] });
    if (path === null || text === saved || conflict !== null) return;
    // Questions and Decisions only grow; an edit that changes an entry is not written.
    if (repoRoot !== null) {
      const violations = await commands.checkAppendOnly(
        repoRoot,
        path,
        saved,
        text,
      );
      if (get().path !== path) return;
      set({ violations });
      if (violations.length > 0) return;
    }
    const result = await commands.saveText(path, saved, text);
    if (get().path !== path) return;
    if (result.status === "error") {
      set({ error: `Not saved: ${result.error}` });
    } else if (result.data.kind === "saved") {
      set({ saved: text, error: null });
    } else {
      set({ conflict: { kind: "changed", disk: result.data.text } });
    }
  };

  /** Compares the open file with the disk: reloads it silently, or flags a conflict. */
  const checkNow = async () => {
    const { path } = get();
    if (path === null) return;
    const result = await commands.readText(path);
    if (get().path !== path || result.status === "error") return;
    const disk = result.data;
    const { text, saved } = get();
    if (disk === saved) return;
    if (text === saved) load(path, disk);
    else if (disk === text) set({ saved: disk, conflict: null });
    else set({ conflict: { kind: "changed", disk } });
  };

  return {
    ...CLOSED,
    modes: {},

    open: async (repoRoot, path, line) => {
      if (get().path !== path) {
        await get().save();
        if (get().text !== get().saved) return;
        const result = await commands.readText(path);
        if (result.status === "error") {
          set({ error: `Cannot open ${fileNameOf(path)}: ${result.error}` });
          return;
        }
        set({
          ...CLOSED,
          repoRoot,
          path,
          text: result.data,
          saved: result.data,
        });
        await parse(path, result.data);
      }
      if (line !== undefined)
        set({
          reveal: line,
          modes: { ...get().modes, [path]: "source" },
          selection: "",
        });
    },

    revealed: () => set({ reveal: null }),

    close: async () => {
      await get().save();
      if (get().text !== get().saved) return;
      set(CLOSED);
    },

    edit: (text) => {
      const { path } = get();
      if (path === null || text === get().text) return;
      set({ text });
      cancelAutosave();
      autosave = setTimeout(() => void get().save(), AUTOSAVE_MS);
      void parse(path, text);
    },

    setField: async (field, input) => {
      const { text } = get();
      const parsed = fieldValueOf(field, input);
      if ("error" in parsed) return parsed.error;
      const result =
        parsed.value === null
          ? await commands.removeFieldInText(text, field.key)
          : await commands.setFieldInText(text, field.key, parsed.value);
      if (result.status === "error") return result.error;
      // Typing in the source while the command ran wins over the form.
      if (get().text === text) get().edit(result.data);
      return null;
    },

    save: () => enqueue(writeNow),

    toggleMode: () => {
      const { path, modes } = get();
      if (path === null) return;
      const mode = modes[path] === "read" ? "source" : "read";
      set({ modes: { ...modes, [path]: mode }, selection: "" });
    },

    apply: async (batch) => {
      const { path, repoRoot, text, saved } = get();
      if (path === null || repoRoot === null) return;
      const next = followFile(path, repoRoot, batch);
      if (next === null) {
        cancelAutosave();
        if (text === saved) set(CLOSED);
        else set({ conflict: { kind: "removed" } });
        return;
      }
      if (next !== undefined) {
        const modes = { ...get().modes, [next]: get().modes[path] ?? "source" };
        set({ path: next, modes, error: null });
      }
      const current = next ?? path;
      if (next === undefined && !touchesFile(current, repoRoot, batch)) return;
      await enqueue(checkNow);
      // Edits that could not be saved while the file was moving are written to its new place.
      if (get().text !== get().saved) await get().save();
    },

    reload: async () => {
      const { path, conflict, text, saved } = get();
      if (path === null) return;
      cancelAutosave();
      let disk = conflict?.kind === "changed" ? conflict.disk : null;
      if (disk === null) {
        const result = await commands.readText(path);
        if (result.status === "error") {
          set({ error: `Cannot reload: ${result.error}` });
          return;
        }
        disk = result.data;
      }
      set({ replaced: text !== saved ? text : get().replaced });
      load(path, disk);
    },

    keepMine: async () => {
      const { conflict } = get();
      if (conflict?.kind !== "changed") return;
      // The disk text becomes the expected one, so the save goes through unless it changes again.
      set({ saved: conflict.disk, conflict: null });
      await get().save();
    },

    restoreFile: async () => {
      const { path, text, conflict } = get();
      if (path === null || conflict?.kind !== "removed") return;
      const result = await commands.createText(path, text);
      if (get().path !== path) return;
      if (result.status === "error")
        set({ error: `Not restored: ${result.error}` });
      else set({ saved: text, conflict: null, error: null });
    },

    discard: () => {
      if (get().conflict?.kind === "removed") set(CLOSED);
    },

    restoreReplaced: () => {
      const { replaced } = get();
      if (replaced === null) return;
      set({ replaced: null });
      get().edit(replaced);
    },

    dismissReplaced: () => set({ replaced: null }),

    setSelection: (selection) => set({ selection }),

    trash: async () => {
      const { repoRoot, path } = get();
      if (repoRoot === null || path === null) return;
      if (get().conflict !== null) {
        set({ error: "Resolve the change on disk before deleting" });
        return;
      }
      await get().save();
      if (get().path !== path || get().text !== get().saved) return;
      const result = await commands.trashFile(repoRoot, path);
      if (get().path !== path) return;
      if (result.status === "error")
        set({ error: `Not deleted: ${result.error}` });
      else set(CLOSED);
    },

    makeTask: async () => {
      const { repoRoot, path, selection } = get();
      if (repoRoot === null || path === null || selection.trim() === "") return;
      const result = await commands.makeTask(repoRoot, path, selection);
      if (result.status === "error") {
        set({ error: `Task not made: ${result.error}` });
        return;
      }
      set({ selection: "" });
      await get().open(repoRoot, result.data);
    },

    dropImages: async (paths, at) => {
      const { repoRoot, path } = get();
      if (repoRoot === null || path === null || paths.length === 0) return;
      const snippets: string[] = [];
      const failures: string[] = [];
      // One after another, so two files with the same name get suffixes in drop order.
      for (const source of paths) {
        const result = await commands.importImage(repoRoot, path, source);
        if (result.status === "ok") snippets.push(result.data.markdown);
        else failures.push(result.error);
      }
      if (get().path !== path) return;
      set({ error: dropFailures(failures) });
      if (snippets.length === 0) return;
      const { text } = get();
      get().edit(applyInsertion(text, dropInsertion(text, at, snippets)));
    },

    pasteImages: async (files, at) => {
      const { repoRoot, path } = get();
      if (repoRoot === null || path === null || files.length === 0) return;
      const snippets: string[] = [];
      const failures: string[] = [];
      // One after another, so two images pasted in the same second get suffixes in order.
      for (const file of files) {
        const result = await fileBase64(file).then(
          (data) => commands.pasteImage(repoRoot, path, file.type, data),
          () =>
            ({
              status: "error",
              error: `\`${file.name}\` could not be read`,
            }) as const,
        );
        if (result.status === "ok") snippets.push(result.data.markdown);
        else failures.push(result.error);
      }
      if (get().path !== path) return;
      set({ error: dropFailures(failures) });
      if (snippets.length === 0) return;
      const { text } = get();
      get().edit(applyInsertion(text, dropInsertion(text, at, snippets)));
    },

    resolveProposal: (start, action) => {
      const { path, text } = get();
      if (path === null) return false;
      const after = resolveProposal(text, start, action);
      if (after === null) return false;
      get().edit(after);
      set({ proposalUndo: { before: text, after } });
      return true;
    },

    undoProposal: () => {
      const { proposalUndo, text } = get();
      set({ proposalUndo: null });
      if (proposalUndo !== null && proposalUndo.after === text)
        get().edit(proposalUndo.before);
    },
  };
});
