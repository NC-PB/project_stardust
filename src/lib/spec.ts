import type { ChangeBatch } from "@/bindings";

/**
 * Whether a batch touched the spec (`S-spec-file`): `spec.md`, the `spec/` folder or a file in
 * it, or a folder that holds them. Paths are relative to the repository root.
 */
export function specTouched(batch: ChangeBatch, planningRoot: string): boolean {
  const root = planningRoot.replace(/\/+$/, "");
  const file = `${root}/spec.md`;
  const folder = `${root}/spec`;
  const touches = (path: string) => {
    const trimmed = path.replace(/\/+$/, "");
    return (
      trimmed === file ||
      trimmed === folder ||
      trimmed.startsWith(`${folder}/`) ||
      file.startsWith(`${trimmed}/`)
    );
  };
  return batch.changes.some((change) =>
    change.kind === "moved"
      ? touches(change.from) || touches(change.to)
      : touches(change.path),
  );
}
