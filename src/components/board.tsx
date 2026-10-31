import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { cn } from "cn";
import { useEffect, useState } from "react";
import type { TaskCommits } from "@/bindings";
import { StaleBadges, useStaleFlags } from "@/components/stale-flags";
import { Button } from "@/components/ui/button";
import {
  type BoardColumn,
  boardTags,
  type Card,
  cardsOf,
  columnDir,
  filterCards,
} from "@/lib/board";
import { commitLabel } from "@/lib/commit-info";
import { PROMPT_LABELS } from "@/lib/prompts";
import type { StaleFlag } from "@/lib/staleness";
import { useBoardStore } from "@/stores/board-store";
import { useCommitStore } from "@/stores/commit-store";
import { useEditorStore } from "@/stores/editor-store";
import { usePromptStore } from "@/stores/prompt-store";

/** Ages on the cards are recomputed this often. */
const AGE_TICK_MS = 60_000;
/** A press turns into a drag after this many pixels, so clicks on tags still work. */
const DRAG_DISTANCE_PX = 5;

const NO_FLAGS: StaleFlag[] = [];

/** What a dragged card carries (`S-board-dnd`). */
interface DragData {
  column: string;
  card: Card;
}

/**
 * The columns and cards of the open project (`S-board-columns`, `S-board-card`,
 * `S-board-filter`); cards are dragged between columns (`S-board-dnd`) and open in the
 * editor when their title is clicked (`S-editor-core`).
 */
export function Board() {
  const {
    repoRoot,
    columns,
    config,
    since,
    tagFilter,
    moveError,
    toggleTag,
    clearTagFilter,
    moveTask,
    dismissMoveError,
  } = useBoardStore();
  const openPath = useEditorStore((state) => state.path);
  const openFile = useEditorStore((state) => state.open);
  const copyPrompt = usePromptStore((state) => state.copy);
  const [now, setNow] = useState(Date.now);
  const [dragged, setDragged] = useState<Card | null>(null);
  const staleFlags = useStaleFlags();
  const commits = useCommitStore((state) => state.byId);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_DISTANCE_PX },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (config === null || repoRoot === null) return null;
  const pathOf = (column: string, card: Card) =>
    `${columnDir(repoRoot, config.planning_root, column)}/${card.key}`;
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

  const onDragStart = (event: DragStartEvent) =>
    setDragged((event.active.data.current as DragData).card);
  const onDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const { column, card } = event.active.data.current as DragData;
    const target = event.over?.id;
    if (typeof target === "string" && target !== column)
      void moveTask(card.key, column, target);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {moveError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 px-2 py-1 text-xs text-destructive"
        >
          <span>Move failed: {moveError}</span>
          <Button variant="ghost" size="xs" onClick={dismissMoveError}>
            Dismiss
          </Button>
        </div>
      )}
      {tags.length > 0 && (
        <TagBar
          tags={tags}
          selected={tagFilter}
          onToggle={toggleTag}
          onClear={clearTagFilter}
        />
      )}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div className="flex min-h-0 w-full flex-1 gap-4 overflow-x-auto pb-2">
          {columns.map((column, index) => (
            <Column
              triage={
                index === 0
                  ? () =>
                      void copyPrompt(repoRoot, "triage-inbox", {
                        task_path: null,
                        node_id: null,
                      })
                  : undefined
              }
              key={column.name}
              column={column}
              shown={cards.get(column.name) ?? []}
              filtering={tagFilter.length > 0}
              selected={tagFilter}
              onToggleTag={toggleTag}
              openPath={openPath}
              pathOf={pathOf}
              staleFlags={staleFlags}
              commits={commits}
              onOpen={(path) => void openFile(repoRoot, path)}
            />
          ))}
        </div>
        <DragOverlay>
          {dragged && (
            <TaskCard
              card={dragged}
              selected={tagFilter}
              onToggleTag={toggleTag}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/** One column; cards dropped on it move there. */
function Column({
  column,
  shown,
  filtering,
  selected,
  onToggleTag,
  openPath,
  pathOf,
  staleFlags,
  commits,
  onOpen,
  triage,
}: {
  column: BoardColumn;
  shown: Card[];
  filtering: boolean;
  selected: string[];
  onToggleTag: (tag: string) => void;
  openPath: string | null;
  pathOf: (column: string, card: Card) => string;
  /** Staleness flags by file path (`S-staleness`). */
  staleFlags: Map<string, StaleFlag[]>;
  /** Commits mentioning each task id (`S-commit-info`). */
  commits: Map<string, TaskCommits>;
  onOpen: (path: string) => void;
  /** Copies the Triage inbox prompt; given for the first column (`S-prompts`). */
  triage?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.name });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold">{column.name}</h2>
        {triage && (
          <Button
            variant="ghost"
            size="xs"
            onClick={triage}
            title="Copy the Triage inbox prompt"
          >
            {PROMPT_LABELS["triage-inbox"]}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtering
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
      {shown.map((card) => {
        const path = pathOf(column.name, card);
        return (
          <DraggableCard
            key={card.key}
            column={column.name}
            card={card}
            selected={selected}
            onToggleTag={onToggleTag}
            isOpen={path === openPath}
            flags={staleFlags.get(path) ?? NO_FLAGS}
            commits={card.id === null ? undefined : commits.get(card.id)}
            onOpen={() => onOpen(path)}
          />
        );
      })}
    </section>
  );
}

/** A card that can be dragged to another column; it stays in place, faded, while dragged. */
function DraggableCard({
  column,
  card,
  selected,
  onToggleTag,
  isOpen,
  flags,
  commits,
  onOpen,
}: {
  column: string;
  card: Card;
  selected: string[];
  onToggleTag: (tag: string) => void;
  isOpen: boolean;
  flags: StaleFlag[];
  commits: TaskCommits | undefined;
  onOpen: () => void;
}) {
  const data: DragData = { column, card };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `${column}/${card.key}`,
    data,
  });
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: `attributes` from dnd-kit set role="button" and tabIndex.
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Keys on a tag or the title inside the card act on them; only keys on the card drag it.
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) listeners?.onKeyDown?.(event);
      }}
      className={cn("shrink-0 cursor-grab", isDragging && "opacity-40")}
    >
      <TaskCard
        card={card}
        selected={selected}
        onToggleTag={onToggleTag}
        isOpen={isOpen}
        flags={flags}
        commits={commits}
        onOpen={onOpen}
      />
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
  isOpen = false,
  flags = NO_FLAGS,
  commits,
  onOpen,
}: {
  card: Card;
  selected: string[];
  onToggleTag: (tag: string) => void;
  isOpen?: boolean;
  /** Staleness flags of the card's file; reasons on hover. */
  flags?: StaleFlag[];
  /** Commits mentioning the task id; information only (`S-commit-info`). */
  commits?: TaskCommits;
  onOpen?: () => void;
}) {
  const commitInfo = commitLabel(commits);
  return (
    <article
      className={cn(
        "flex shrink-0 flex-col gap-1.5 rounded-md border bg-background p-2 text-sm shadow-xs",
        isOpen && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-1.5">
        {card.isNew && (
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
            title="Changed since your last visit"
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-medium leading-snug hover:underline"
        >
          {card.title}
        </button>
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
        {commitInfo && <span title={commitInfo.title}>{commitInfo.label}</span>}
        <StaleBadges flags={flags} />
      </div>
    </article>
  );
}
