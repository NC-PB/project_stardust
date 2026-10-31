import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import type { AppendOnlyViolation_Serialize } from "@/bindings";
import {
  protectedLinesField,
  protectedLinesOf,
  setProtectedLines,
} from "./protected-lines";

const violation = (now: number | null): AppendOnlyViolation_Serialize => ({
  id: null,
  at: { file: "spec.md", line: 1 },
  now,
  message: "x",
});

/** The 1-based lines marked in `state`. */
const marked = (state: EditorState): number[] => {
  const lines: number[] = [];
  const cursor = state.field(protectedLinesField).iter();
  while (cursor.value !== null) {
    lines.push(state.doc.lineAt(cursor.from).number);
    cursor.next();
  }
  return lines;
};

describe("protectedLinesOf", () => {
  it("lists the lines after the edit, sorted and each once", () => {
    expect(
      protectedLinesOf([violation(7), violation(null), violation(2)]),
    ).toEqual([2, 7]);
    expect(protectedLinesOf([violation(3), violation(3)])).toEqual([3]);
    expect(protectedLinesOf([])).toEqual([]);
  });
});

describe("protectedLinesField", () => {
  const start = () =>
    EditorState.create({
      doc: "a\nb\nc\nd",
      extensions: [protectedLinesField],
    });

  it("marks nothing until lines are set", () => {
    expect(marked(start())).toEqual([]);
  });

  it("marks the set lines and skips lines past the end", () => {
    const state = start().update({
      effects: setProtectedLines.of([2, 4, 9, 0]),
    }).state;
    expect(marked(state)).toEqual([2, 4]);
  });

  it("clears the marks with an empty list", () => {
    const state = start()
      .update({ effects: setProtectedLines.of([2]) })
      .state.update({ effects: setProtectedLines.of([]) }).state;
    expect(marked(state)).toEqual([]);
  });

  it("keeps the marks on their lines while typing above them", () => {
    const state = start()
      .update({ effects: setProtectedLines.of([3]) })
      .state.update({ changes: { from: 0, insert: "new\n" } }).state;
    expect(marked(state)).toEqual([4]);
    expect(state.doc.line(4).text).toBe("c");
  });
});
