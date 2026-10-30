import { cn } from "cn";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { boardTags, type Card, cardsOf, filterCards } from "@/lib/board";
import { useBoardStore } from "@/stores/board-store";

/** Ages on the cards are recomputed this often. */
const AGE_TICK_MS = 60_000;

/** The columns and cards of the open project (`S-board-columns`, `S-board-card`, `S-board-filter`). */
export function Board() {
  const { columns, config, since, tagFilter, toggleTag, clearTagFilter } =
    useBoardStore();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (config === null) return null;
  const cards = filterCards(
    cardsOf(columns, config.terminal, since, now),
    tagFilter,
  );
  // Selected tags stay listed after their last task lost them, so they can be removed.
  const onBoard = boardTags(columns);
  const tags = [
    ...onBoard,
    ...tagFilter.filter((tag) => !onBoard.includes(tag)),
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
      {tags.length > 0 && (
        <TagBar
          tags={tags}
          selected={tagFilter}
          onToggle={toggleTag}
          onClear={clearTagFilter}
        />
      )}
      <div className="flex min-h-0 w-full flex-1 gap-4 overflow-x-auto pb-2">
        {columns.map((column) => {
          const shown = cards.get(column.name) ?? [];
          return (
            <section
              key={column.name}
              className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2"
            >
              <header className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{column.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {tagFilter.length > 0
                    ? `${shown.length} of ${column.tasks.length}`
                    : column.tasks.length}
                </span>
              </header>
              {column.missing && (
                <p className="px-1 text-xs text-muted-foreground">
                  No folder for this column.
                </p>
              )}
              {column.error && (
                <p className="px-1 text-xs text-destructive">{column.error}</p>
              )}
              {shown.map((card) => (
                <TaskCard
                  key={card.key}
                  card={card}
                  selected={tagFilter}
                  onToggleTag={toggleTag}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Every tag on the board; selected tags filter the cards. */
function TagBar({
  tags,
  selected,
  onToggle,
  onClear,
}: {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">Tags</span>
      {tags.map((tag) => (
        <TagChip
          key={tag}
          tag={tag}
          selected={selected.includes(tag)}
          onToggle={onToggle}
        />
      ))}
      {selected.length > 0 && (
        <Button variant="ghost" size="xs" onClick={onClear}>
          Clear filter
        </Button>
      )}
    </div>
  );
}

function TagChip({
  tag,
  selected,
  onToggle,
}: {
  tag: string;
  selected: boolean;
  onToggle: (tag: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(tag)}
      className={cn(
        "rounded px-1.5 py-0.5 text-xs",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {tag}
    </button>
  );
}

function TaskCard({
  card,
  selected,
  onToggleTag,
}: {
  card: Card;
  selected: string[];
  onToggleTag: (tag: string) => void;
}) {
  return (
    <article className="flex shrink-0 flex-col gap-1.5 rounded-md border bg-background p-2 text-sm shadow-xs">
      <div className="flex items-start gap-1.5">
        {card.isNew && (
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
            title="Changed since your last visit"
          />
        )}
        <p className="font-medium leading-snug">{card.title}</p>
      </div>
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              selected={selected.includes(tag)}
              onToggle={onToggleTag}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {card.age && (
          <span title="Since the file last changed">{card.age}</span>
        )}
        {card.subtasks > 0 && (
          <span>
            {card.subtasks} sub-task{card.subtasks === 1 ? "" : "s"}
          </span>
        )}
        {card.blockedBy.length > 0 && (
          <span
            className="font-medium text-destructive"
            title={`Waiting for ${card.blockedBy.join(", ")}`}
          >
            Blocked
          </span>
        )}
      </div>
    </article>
  );
}
