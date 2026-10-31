import { useId } from "react";
import { Button } from "@/components/ui/button";
import { entriesLabel, entryCount } from "@/lib/changelog";
import { useChangelogStore } from "@/stores/changelog-store";

/** Opens the changelog form for `repoRoot` (`S-changelog`). */
export function ChangelogButton({ repoRoot }: { repoRoot: string }) {
  const start = useChangelogStore((state) => state.start);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void start(repoRoot)}
      title="Drafts CHANGELOG.md entries from the finished tasks, after a preview"
    >
      Changelog
    </Button>
  );
}

/** The changelog form, the draft for confirmation and what the write did, for `repoRoot`. */
export function ChangelogPanel({ repoRoot }: { repoRoot: string }) {
  const changelog = useChangelogStore();
  const { setMode, setDate, setTag, preview, confirm, cancel, dismiss } =
    changelog;
  const dateId = useId();
  const tagId = useId();
  // A form or report of a repository opened before is not shown.
  if (changelog.repoRoot !== repoRoot) return null;
  const { open, tags, mode, date, tag, draft, written, error } = changelog;
  const tagsUsable = (tags?.available ?? false) && (tags?.tags.length ?? 0) > 0;
  const tagNote =
    tags === null
      ? "Reading tags…"
      : !tags.available
        ? `No tags: ${tags.reason ?? "git is not available"}`
        : tags.tags.length === 0
          ? "No tags in this repository"
          : null;
  const count = draft ? entryCount(draft.groups) : 0;

  return (
    <>
      {open && (
        <fieldset
          aria-label="Changelog"
          className="flex flex-col gap-2 rounded-md border p-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Tasks finished since</span>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`${dateId}-mode`}
                checked={mode === "date"}
                onChange={() => setMode("date")}
              />
              a date
            </label>
            <input
              id={dateId}
              type="date"
              aria-label="Since date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              onFocus={() => setMode("date")}
              className="rounded border bg-background px-1.5 py-0.5"
            />
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`${dateId}-mode`}
                checked={mode === "tag"}
                disabled={!tagsUsable}
                onChange={() => setMode("tag")}
              />
              a tag
            </label>
            <select
              id={tagId}
              aria-label="Since tag"
              value={tag}
              disabled={!tagsUsable}
              onChange={(event) => setTag(event.target.value)}
              onFocus={() => setMode("tag")}
              className="rounded border bg-background px-1.5 py-0.5"
            >
              {!tagsUsable && <option value="">none</option>}
              {tags?.tags.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.date})
                </option>
              ))}
            </select>
          </div>
          {tagNote && <p className="text-muted-foreground">{tagNote}</p>}

          {draft && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {count === 0
                  ? `No tasks ${draft.range}`
                  : `${entriesLabel(count)} for ${draft.path}, ${draft.range}, added at the top`}
              </p>
              {draft.section !== "" && (
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap">
                  {draft.section}
                </pre>
              )}
              {draft.skipped.length > 0 && (
                <p className="text-muted-foreground">
                  Without a completed date, left out: {draft.skipped.join(", ")}
                </p>
              )}
              {draft.section !== "" && (
                <p className="text-muted-foreground">
                  {draft.existing === null
                    ? `${draft.path} is created.`
                    : `The rest of ${draft.path} stays as it is.`}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="xs" onClick={() => void preview()}>
              Preview
            </Button>
            {draft && draft.section !== "" && (
              <Button size="xs" onClick={() => void confirm()}>
                Write {draft.path}
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </fieldset>
      )}
      {(written || error) && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 text-sm"
        >
          {written ? (
            <p className="text-muted-foreground">{written}</p>
          ) : (
            <p className="text-destructive">{error}</p>
          )}
          <Button variant="ghost" size="xs" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  );
}
