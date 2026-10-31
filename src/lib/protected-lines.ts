import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { AppendOnlyViolation_Serialize } from "@/bindings";

/**
 * The lines of refused entries in source mode (`S-decisions`): the first line of each entry
 * after the edit, 1-based, sorted, each once. Removed entries have no line.
 */
export function protectedLinesOf(
  violations: AppendOnlyViolation_Serialize[],
): number[] {
  const lines = violations.flatMap((violation) =>
    violation.now === null ? [] : [violation.now],
  );
  return [...new Set(lines)].sort((a, b) => a - b);
}

/** Replaces the marked lines; an empty list clears them. */
export const setProtectedLines = StateEffect.define<number[]>();

const protectedLine = Decoration.line({ class: "cm-protected" });

/**
 * Marks refused entries in source mode. The marks follow typing until the next check sets
 * them again; lines beyond the end of the text are skipped.
 */
export const protectedLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setProtectedLines)) continue;
      const { doc } = transaction.state;
      next = Decoration.set(
        effect.value
          .filter((line) => line >= 1 && line <= doc.lines)
          .map((line) => protectedLine.range(doc.line(line).from)),
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
