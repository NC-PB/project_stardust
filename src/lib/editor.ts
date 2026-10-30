import type { ChangeBatch, FieldValue, Task_Serialize } from "@/bindings";

/** The two ways to show a file (`S-editor-layout`). */
export type EditorMode = "source" | "read";

/** Edits are written this long after typing stops. */
export const AUTOSAVE_MS = 1000;

/** How a frontmatter field is edited in the form on top of the file (`S-editor-core`). */
export interface FormField {
  key: string;
  label: string;
  kind: "text" | "date" | "list" | "number";
}

/** The task fields of `S-task-format`, in template order; `id` is shown, not edited. */
export const FORM_FIELDS: FormField[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "tags", label: "Tags", kind: "list" },
  { key: "created", label: "Created", kind: "date" },
  { key: "completed", label: "Completed", kind: "date" },
  { key: "priority", label: "Priority", kind: "number" },
  { key: "implements", label: "Implements", kind: "list" },
  { key: "depends_on", label: "Depends on", kind: "list" },
  { key: "parent", label: "Parent", kind: "text" },
];

/** Matches the frontmatter block at the very start of a file, `---` to `---`. */
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** The text after the frontmatter, which read mode renders. */
export function bodyOf(text: string): string {
  return text.replace(FRONTMATTER, "");
}

/** How many lines the frontmatter takes, both `---` lines included; 0 without one. */
export function frontmatterLineCount(text: string): number {
  const match = FRONTMATTER.exec(text);
  if (!match) return 0;
  return match[0].replace(/\r?\n$/, "").split("\n").length;
}

/** The last part of a path, with either separator. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** What the form shows for `field` of `task`. Lists are comma separated. */
export function formValue(task: Task_Serialize, field: FormField): string {
  const value = task[field.key as keyof Task_Serialize];
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * The value to write for what was typed into the form, `null` to remove the field, or an
 * error. Title is required and never removed; checks match those of `read_task`.
 */
export function fieldValueOf(
  field: FormField,
  input: string,
): { value: FieldValue | null } | { error: string } {
  const trimmed = input.trim();
  if (field.kind === "list") {
    const items = trimmed
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    // Empty lists stay as `[]`, as the task template writes them.
    return { value: { List: items } };
  }
  if (trimmed === "") {
    return field.key === "title"
      ? { error: "A task needs a title" }
      : { value: null };
  }
  if (field.kind === "number") {
    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < 1 || number > 5)
      return { error: `${field.label} must be between 1 and 5` };
    return { value: { Number: number } };
  }
  if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
    return { error: `${field.label} must be a date like 2026-10-30` };
  return { value: { Text: trimmed } };
}

/**
 * Where the open file at `path` went in `batch`: its new path when it was moved, `null` when
 * it was removed, `undefined` when the batch did not move or remove it. Batch paths are
 * relative to `repoRoot`.
 */
export function followFile(
  path: string,
  repoRoot: string,
  batch: ChangeBatch,
): string | null | undefined {
  const root = repoRoot.replace(/[\\/]+$/, "");
  const relative = path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : null;
  if (relative === null) return undefined;
  for (const change of batch.changes) {
    if (change.kind === "moved" && change.from === relative)
      return `${root}/${change.to}`;
    if (change.kind === "removed" && change.path === relative) return null;
  }
  return undefined;
}

/** The keys of a key event that decide a shortcut. */
export interface ShortcutKeys {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Whether the platform is macOS, where shortcuts use ⌘ and Ctrl keeps its editing keys. */
export const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** Whether `event` is ⌘+`key` on macOS or Ctrl+`key` elsewhere, with no other modifier. */
export function isShortcut(
  event: ShortcutKeys,
  key: string,
  mac: boolean = isMac,
): boolean {
  const command = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    command &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === key
  );
}

/**
 * The markdown file a relative link in the file at `fromPath` points to, or `null` for
 * anchors, URLs with a scheme, absolute paths and links to anything but `.md` files.
 */
export function resolveLink(fromPath: string, href: string): string | null {
  const target = decodeURIComponentSafe(href.split(/[#?]/)[0]);
  if (
    target === "" ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    target.startsWith("/") ||
    !target.toLowerCase().endsWith(".md")
  )
    return null;
  const parts = fromPath.replace(/\\/g, "/").split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Whether `batch` created, changed or moved a file to `path`, relative to `repoRoot`. */
export function touchesFile(
  path: string,
  repoRoot: string,
  batch: ChangeBatch,
): boolean {
  const root = repoRoot.replace(/[\\/]+$/, "");
  if (!path.startsWith(`${root}/`)) return false;
  const relative = path.slice(root.length + 1);
  return batch.changes.some((change) =>
    change.kind === "moved"
      ? change.to === relative
      : change.kind !== "removed" && change.path === relative,
  );
}
