import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const writeText = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    readText: async (path: string) =>
      files.has(path)
        ? { status: "ok", data: files.get(path) }
        : { status: "error", error: "not found" },
    writeText: (...args: [string, string]) => writeText(...args),
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
      return { status: "ok", data: null };
    });
    useEditorStore.setState({
      path: null,
      repoRoot: null,
      text: "",
      saved: "",
      task: null,
      modes: {},
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
    expect(useEditorStore.getState().error).toContain("removed");
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
});
