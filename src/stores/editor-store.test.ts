import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const writeText = vi.fn();
const createText = vi.fn();
const makeTask = vi.fn();
const checkAppendOnly = vi.fn();
const trashed: string[] = [];

vi.mock("@/bindings", () => ({
  commands: {
    readText: async (path: string) =>
      files.has(path)
        ? { status: "ok", data: files.get(path) }
        : { status: "error", error: "not found" },
    saveText: async (path: string, expected: string, text: string) => {
      if (!files.has(path))
        return { status: "error", error: "the file no longer exists" };
      const disk = files.get(path);
      if (disk === text) return { status: "ok", data: { kind: "saved" } };
      if (disk !== expected)
        return { status: "ok", data: { kind: "changed_on_disk", text: disk } };
      return writeText(path, text);
    },
    createText: (...args: [string, string]) => createText(...args),
    makeTask: (...args: [string, string, string]) => makeTask(...args),
    checkAppendOnly: (...args: [string, string, string, string]) =>
      checkAppendOnly(...args),
    trashFile: async (_repoRoot: string, path: string) => {
      if (!files.has(path))
        return { status: "error", error: "the file no longer exists" };
      trashed.push(files.get(path) as string);
      files.delete(path);
      return { status: "ok", data: null };
    },
    parseTaskText: async (fileName: string, text: string) => ({
      file_name: fileName,
      title: text.match(/title: (.*)/)?.[1] ?? "",
    }),
    setFieldInText: async (text: string, key: string, value: unknown) => ({
      status: "ok",
      data: text.replace(
        new RegExp(`${key}: .*`),
        `${key}: ${(value as { Text: string }).Text}`,
      ),
    }),
    removeFieldInText: async (text: string) => ({ status: "ok", data: text }),
  },
}));

import { AUTOSAVE_MS, FORM_FIELDS } from "@/lib/editor";
import { useEditorStore } from "./editor-store";

const A = "/repo/docs/planning/next/a.md";
const B = "/repo/docs/planning/next/b.md";
const title = FORM_FIELDS[0];

describe("useEditorStore", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    files.clear();
    files.set(A, "---\ntitle: A\n---\nbody\n");
    files.set(B, "---\ntitle: B\n---\n");
    writeText.mockReset();
    writeText.mockImplementation(async (path: string, text: string) => {
      if (!files.has(path))
        return { status: "error", error: "the file no longer exists" };
      files.set(path, text);
      return { status: "ok", data: { kind: "saved" } };
    });
    createText.mockReset();
    createText.mockImplementation(async (path: string, text: string) => {
      files.set(path, text);
      return { status: "ok", data: null };
    });
    useEditorStore.setState({
      path: null,
      repoRoot: null,
      text: "",
      saved: "",
      task: null,
      modes: {},
      conflict: null,
      replaced: null,
      selection: "",
      error: null,
      reveal: null,
      violations: [],
    });
    checkAppendOnly.mockReset();
    checkAppendOnly.mockResolvedValue([]);
    makeTask.mockReset();
    trashed.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a file at a line in source mode, also when it is open already", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().toggleMode();
    expect(useEditorStore.getState().modes[A]).toBe("read");
    await useEditorStore.getState().open("/repo", A, 4);
    expect(useEditorStore.getState().reveal).toBe(4);
    expect(useEditorStore.getState().modes[A]).toBe("source");
    useEditorStore.getState().revealed();
    expect(useEditorStore.getState().reveal).toBeNull();
    await useEditorStore.getState().open("/repo", B, 2);
    expect(useEditorStore.getState().path).toBe(B);
    expect(useEditorStore.getState().reveal).toBe(2);
  });

  it("does not reveal a line of a file it could not open", async () => {
    await useEditorStore.getState().open("/repo", "/repo/missing.md", 3);
    expect(useEditorStore.getState().path).toBeNull();
    expect(useEditorStore.getState().reveal).toBeNull();
  });

  it("opens a file without a line and nothing to reveal", async () => {
    await useEditorStore.getState().open("/repo", A);
    expect(useEditorStore.getState().reveal).toBeNull();
  });

  it("opens a file and parses it for the form", async () => {
    await useEditorStore.getState().open("/repo", A);
    const state = useEditorStore.getState();
    expect(state.path).toBe(A);
    expect(state.text).toBe(state.saved);
    expect(state.task?.title).toBe("A");
  });

  it("saves once typing stops", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().edit("x");
    useEditorStore.getState().edit("xy");
    expect(writeText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(files.get(A)).toBe("xy");
    expect(useEditorStore.getState().saved).toBe("xy");
  });

  it("refuses to save edits that change a question or decision, keeping them", async () => {
    await useEditorStore.getState().open("/repo", A);
    const violation = {
      id: "D-20261030-100000-cccc",
      at: { file: "spec.md", line: 5 },
      now: 5,
      message: "D-20261030-100000-cccc: a line was changed or added",
    };
    checkAppendOnly.mockResolvedValue([violation]);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().close();
    let state = useEditorStore.getState();
    expect(checkAppendOnly).toHaveBeenCalledWith(
      "/repo",
      A,
      "---\ntitle: A\n---\nbody\n",
      "edited",
    );
    expect(writeText).not.toHaveBeenCalled();
    expect(state.path).toBe(A);
    expect(state.text).toBe("edited");
    expect(state.violations).toEqual([violation]);
    // Fixed by hand: saved, and the explanation goes away.
    checkAppendOnly.mockResolvedValue([]);
    state.edit("edited again");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    state = useEditorStore.getState();
    expect(files.get(A)).toBe("edited again");
    expect(state.violations).toEqual([]);
  });

  it("brings refused edits back after they were undone by a reload", async () => {
    await useEditorStore.getState().open("/repo", A);
    checkAppendOnly.mockResolvedValue([
      { id: null, at: { file: "spec.md", line: 1 }, now: null, message: "x" },
    ]);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().save();
    await useEditorStore.getState().reload();
    const state = useEditorStore.getState();
    expect(state.text).toBe(files.get(A));
    expect(state.violations).toEqual([]);
    expect(state.replaced).toBe("edited");
  });

  it("saves the open file before opening another or closing", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().open("/repo", B);
    expect(files.get(A)).toBe("edited");
    expect(useEditorStore.getState().path).toBe(B);
    useEditorStore.getState().edit("b edited");
    await useEditorStore.getState().close();
    expect(files.get(B)).toBe("b edited");
    expect(useEditorStore.getState().path).toBeNull();
  });

  it("keeps a file open when its edits cannot be saved", async () => {
    await useEditorStore.getState().open("/repo", A);
    files.delete(A);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().close();
    const state = useEditorStore.getState();
    expect(state.path).toBe(A);
    expect(state.text).toBe("edited");
    expect(state.error).toContain("no longer exists");
  });

  it("follows a moved file and saves the edits there", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().toggleMode();
    const done = "/repo/docs/planning/done/a.md";
    // The move happened on disk before the edit was saved.
    files.set(done, files.get(A) as string);
    files.delete(A);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().save();
    await useEditorStore.getState().apply({
      config_changed: false,
      changes: [
        {
          kind: "moved",
          id: "a",
          from: "docs/planning/next/a.md",
          to: "docs/planning/done/a.md",
        },
      ],
    });
    const state = useEditorStore.getState();
    expect(state.path).toBe(done);
    expect(state.modes[done]).toBe("read");
    expect(files.get(done)).toBe("edited");
    expect(files.has(A)).toBe(false);
    expect(state.error).toBeNull();
  });

  it("closes a removed file without edits, keeps one with edits", async () => {
    const removed = {
      config_changed: false,
      changes: [{ kind: "removed" as const, path: "docs/planning/next/a.md" }],
    };
    await useEditorStore.getState().open("/repo", A);
    await useEditorStore.getState().apply(removed);
    expect(useEditorStore.getState().path).toBeNull();

    await useEditorStore.getState().open("/repo", A);
    files.delete(A);
    useEditorStore.getState().edit("edited");
    await useEditorStore.getState().apply(removed);
    expect(useEditorStore.getState().path).toBe(A);
    expect(useEditorStore.getState().conflict).toEqual({ kind: "removed" });
  });

  it("writes form fields into the text, refusing invalid input", async () => {
    await useEditorStore.getState().open("/repo", A);
    expect(await useEditorStore.getState().setField(title, "")).toContain(
      "title",
    );
    expect(await useEditorStore.getState().setField(title, "New")).toBeNull();
    expect(useEditorStore.getState().text).toBe("---\ntitle: New\n---\nbody\n");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(files.get(A)).toBe("---\ntitle: New\n---\nbody\n");
  });

  it("toggles the mode per file", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().toggleMode();
    await useEditorStore.getState().open("/repo", B);
    expect(useEditorStore.getState().modes).toEqual({ [A]: "read" });
  });

  it("makes a task from the selection and opens it", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().setSelection("  ");
    await useEditorStore.getState().makeTask();
    expect(makeTask).not.toHaveBeenCalled();

    makeTask.mockImplementation(async () => {
      files.set(B, "---\ntitle: idea\n---\n");
      return { status: "ok", data: B };
    });
    useEditorStore.getState().setSelection("- idea");
    await useEditorStore.getState().makeTask();
    expect(makeTask).toHaveBeenCalledWith("/repo", A, "- idea");
    expect(useEditorStore.getState().path).toBe(B);
    expect(useEditorStore.getState().selection).toBe("");
  });

  it("keeps the file and the selection when no task can be made", async () => {
    await useEditorStore.getState().open("/repo", A);
    makeTask.mockResolvedValue({ status: "error", error: "no columns" });
    useEditorStore.getState().setSelection("idea");
    await useEditorStore.getState().makeTask();
    const state = useEditorStore.getState();
    expect(state.path).toBe(A);
    expect(state.selection).toBe("idea");
    expect(state.error).toContain("no columns");
  });

  it("saves edits before moving the file to the trash, then closes it", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().edit("last words");
    await useEditorStore.getState().trash();
    expect(trashed).toEqual(["last words"]);
    expect(files.has(A)).toBe(false);
    expect(useEditorStore.getState().path).toBeNull();
  });

  it("does not delete while the file changed on disk", async () => {
    await useEditorStore.getState().open("/repo", A);
    useEditorStore.getState().edit("mine");
    files.set(A, "agent");
    await useEditorStore.getState().save();
    await useEditorStore.getState().trash();
    expect(trashed).toEqual([]);
    expect(files.get(A)).toBe("agent");
    expect(useEditorStore.getState().error).toContain("Resolve");
  });

  it("keeps the file open when the trash refuses", async () => {
    await useEditorStore.getState().open("/repo", A);
    files.delete(A);
    await useEditorStore.getState().trash();
    expect(useEditorStore.getState().path).toBe(A);
    expect(useEditorStore.getState().error).toContain("Not deleted");
  });

  describe("changes on disk", () => {
    const modified = {
      config_changed: false,
      changes: [{ kind: "modified" as const, path: "docs/planning/next/a.md" }],
    };

    it("reload a file without unsaved edits silently", async () => {
      await useEditorStore.getState().open("/repo", A);
      files.set(A, "---\ntitle: Agent\n---\n");
      await useEditorStore.getState().apply(modified);
      const state = useEditorStore.getState();
      expect(state.text).toBe("---\ntitle: Agent\n---\n");
      expect(state.saved).toBe(state.text);
      expect(state.conflict).toBeNull();
      await vi.waitFor(() =>
        expect(useEditorStore.getState().task?.title).toBe("Agent"),
      );
    });

    it("ignore the echo of the editor's own save", async () => {
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("mine");
      await useEditorStore.getState().save();
      useEditorStore.getState().edit("mine, more");
      await useEditorStore.getState().apply(modified);
      const state = useEditorStore.getState();
      expect(state.text).toBe("mine, more");
      expect(state.conflict).toBeNull();
    });

    it("keep unsaved edits and stop saving until the user chooses", async () => {
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("mine");
      files.set(A, "agent");
      await useEditorStore.getState().apply(modified);
      expect(useEditorStore.getState().conflict).toEqual({
        kind: "changed",
        disk: "agent",
      });
      expect(useEditorStore.getState().text).toBe("mine");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 3);
      await useEditorStore.getState().close();
      expect(files.get(A)).toBe("agent");
      expect(useEditorStore.getState().path).toBe(A);
    });

    it("find a change the watcher has not reported yet when saving", async () => {
      await useEditorStore.getState().open("/repo", A);
      files.set(A, "agent");
      useEditorStore.getState().edit("mine");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(files.get(A)).toBe("agent");
      expect(useEditorStore.getState().conflict?.kind).toBe("changed");
    });

    it("reload on request and keep the replaced edits until dismissed", async () => {
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("mine");
      files.set(A, "agent");
      await useEditorStore.getState().apply(modified);
      await useEditorStore.getState().reload();
      let state = useEditorStore.getState();
      expect(state.text).toBe("agent");
      expect(state.conflict).toBeNull();
      expect(state.replaced).toBe("mine");
      state.restoreReplaced();
      state = useEditorStore.getState();
      expect(state.text).toBe("mine");
      expect(state.replaced).toBeNull();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(files.get(A)).toBe("mine");
    });

    it("save the edits over the disk when the user keeps them", async () => {
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("mine");
      files.set(A, "agent");
      await useEditorStore.getState().apply(modified);
      await useEditorStore.getState().keepMine();
      expect(files.get(A)).toBe("mine");
      expect(useEditorStore.getState().conflict).toBeNull();
      expect(useEditorStore.getState().saved).toBe("mine");
    });

    it("count a disk change equal to the edits as saved", async () => {
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("same");
      files.set(A, "same");
      await useEditorStore.getState().apply(modified);
      expect(useEditorStore.getState().conflict).toBeNull();
      expect(useEditorStore.getState().saved).toBe("same");
    });

    it("restore or discard a removed file with edits", async () => {
      const removed = {
        config_changed: false,
        changes: [
          { kind: "removed" as const, path: "docs/planning/next/a.md" },
        ],
      };
      await useEditorStore.getState().open("/repo", A);
      useEditorStore.getState().edit("mine");
      files.delete(A);
      await useEditorStore.getState().apply(removed);
      await useEditorStore.getState().restoreFile();
      expect(files.get(A)).toBe("mine");
      expect(useEditorStore.getState().conflict).toBeNull();

      useEditorStore.getState().edit("mine again");
      files.delete(A);
      await useEditorStore.getState().apply(removed);
      useEditorStore.getState().discard();
      expect(useEditorStore.getState().path).toBeNull();
      expect(files.has(A)).toBe(false);
    });

    it("reload a moved file whose move changed it", async () => {
      await useEditorStore.getState().open("/repo", A);
      const done = "/repo/docs/planning/done/a.md";
      files.set(done, "---\ntitle: A\ncompleted: 2026-10-30\n---\nbody\n");
      files.delete(A);
      await useEditorStore.getState().apply({
        config_changed: false,
        changes: [
          {
            kind: "moved",
            id: "a",
            from: "docs/planning/next/a.md",
            to: "docs/planning/done/a.md",
          },
        ],
      });
      expect(useEditorStore.getState().text).toContain("completed");
    });
  });

  describe("proposals", () => {
    const text = "---\ntitle: A\n---\nIntro.\n\n> **Proposal:** New.\n\nEnd.\n";

    it("accepts as one edit that is saved like typing and can be undone", async () => {
      files.set(A, text);
      await useEditorStore.getState().open("/repo", A);
      expect(useEditorStore.getState().resolveProposal(6, "accept")).toBe(true);
      const accepted = "---\ntitle: A\n---\nIntro.\n\nNew.\n\nEnd.\n";
      expect(useEditorStore.getState().text).toBe(accepted);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(files.get(A)).toBe(accepted);
      useEditorStore.getState().undoProposal();
      expect(useEditorStore.getState().text).toBe(text);
      expect(useEditorStore.getState().proposalUndo).toBeNull();
    });

    it("rejects; undo is dropped once the text was edited again", async () => {
      files.set(A, text);
      await useEditorStore.getState().open("/repo", A);
      expect(useEditorStore.getState().resolveProposal(6, "reject")).toBe(true);
      expect(useEditorStore.getState().text).toBe(
        "---\ntitle: A\n---\nIntro.\n\nEnd.\n",
      );
      useEditorStore.getState().edit("typed");
      useEditorStore.getState().undoProposal();
      expect(useEditorStore.getState().text).toBe("typed");
    });

    it("does nothing where no proposal starts", async () => {
      files.set(A, text);
      await useEditorStore.getState().open("/repo", A);
      expect(useEditorStore.getState().resolveProposal(4, "reject")).toBe(
        false,
      );
      expect(useEditorStore.getState().text).toBe(text);
    });
  });
});
