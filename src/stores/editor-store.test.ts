import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const writeText = vi.fn();
const createText = vi.fn();

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
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
