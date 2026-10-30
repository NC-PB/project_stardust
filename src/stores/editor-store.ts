import { create } from "zustand";
import { type ChangeBatch, commands, type Task_Serialize } from "@/bindings";
import {
  AUTOSAVE_MS,
  type EditorMode,
  type FormField,
  fieldValueOf,
  fileNameOf,
  followFile,
} from "@/lib/editor";

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
  /** Why the file could not be read or saved; cleared by the next successful save. */
  error: string | null;
  /** Opens the file at `path` of the repository at `repoRoot`, saving the open file first. */
  open: (repoRoot: string, path: string) => Promise<void>;
  /** Saves and closes the open file. */
  close: () => Promise<void>;
  /** Replaces the text; it is saved once typing stops for `AUTOSAVE_MS`. */
  edit: (text: string) => void;
  /** Sets a frontmatter field from what was typed into the form; returns why it cannot. */
  setField: (field: FormField, input: string) => Promise<string | null>;
  /** Writes unsaved edits now. */
  save: () => Promise<void>;
  toggleMode: () => void;
  /** Follows the open file when a batch of changes on disk moved or removed it. */
  apply: (batch: ChangeBatch) => Promise<void>;
}

let autosave: ReturnType<typeof setTimeout> | undefined;
/** The save in progress; saves run one after another so an older text never wins. */
let saving: Promise<void> = Promise.resolve();

function cancelAutosave() {
  clearTimeout(autosave);
  autosave = undefined;
}

/** The file open in the editor (`S-editor-core`, `S-editor-layout`). */
export const useEditorStore = create<EditorState>()((set, get) => {
  /** Parses `text` for the form, unless the text changed again meanwhile. */
  const parse = async (path: string, text: string) => {
    const task = await commands.parseTaskText(fileNameOf(path), text);
    if (get().path === path && get().text === text) set({ task });
  };

  const writeNow = async () => {
    cancelAutosave();
    const { path, text, saved } = get();
    if (path === null || text === saved) return;
    const result = await commands.writeText(path, text);
    if (get().path !== path) return;
    if (result.status === "ok") set({ saved: text, error: null });
    else set({ error: `Not saved: ${result.error}` });
  };

  return {
    repoRoot: null,
    path: null,
    text: "",
    saved: "",
    task: null,
    modes: {},
    error: null,

    open: async (repoRoot, path) => {
      if (get().path === path) return;
      await get().save();
      if (get().text !== get().saved) return;
      const result = await commands.readText(path);
      if (result.status === "error") {
        set({ error: `Cannot open ${fileNameOf(path)}: ${result.error}` });
        return;
      }
      set({
        repoRoot,
        path,
        text: result.data,
        saved: result.data,
        task: null,
        error: null,
      });
      await parse(path, result.data);
    },

    close: async () => {
      await get().save();
      if (get().text !== get().saved) return;
      set({ repoRoot: null, path: null, text: "", saved: "", task: null });
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

    save: () => {
      saving = saving.then(writeNow);
      return saving;
    },

    toggleMode: () => {
      const { path, modes } = get();
      if (path === null) return;
      const mode = modes[path] === "read" ? "source" : "read";
      set({ modes: { ...modes, [path]: mode } });
    },

    apply: async (batch) => {
      const { path, repoRoot, text, saved } = get();
      if (path === null || repoRoot === null) return;
      const next = followFile(path, repoRoot, batch);
      if (next === undefined) return;
      if (next === null) {
        // Unsaved edits stay open so they can be copied; there is nothing left to save to.
        if (text === saved) await get().close();
        else
          set({ error: "The file was removed from disk; edits are not saved" });
        return;
      }
      const modes = { ...get().modes, [next]: get().modes[path] ?? "source" };
      set({ path: next, modes, error: null });
      // An edit that failed to save while the file was moving is written to its new place.
      if (text !== saved) await get().save();
    },
  };
});
