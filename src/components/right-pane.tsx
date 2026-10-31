import { cn } from "cn";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArchivePanel } from "@/components/archive";
import { ChangelogPanel } from "@/components/changelog";
import { DoctorPanel } from "@/components/doctor";
import { Editor } from "@/components/editor";
import { GitattributesPanel } from "@/components/gitattributes";
import { SessionPanel } from "@/components/session-panel";
import { SplitSpecPanel } from "@/components/spec-split";
import {
  clampPaneWidth,
  PANE_MAX_SHARE,
  PANE_MIN_WIDTH,
  paneContent,
  paneWidthForKey,
} from "@/lib/layout";
import { projectStatus } from "@/lib/project";
import { useBoardStore } from "@/stores/board-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectStore } from "@/stores/project-store";
import { useSessionStore } from "@/stores/session-store";

/**
 * The right pane (`S-window-layout`): the project tool panels on top, then the open file or the
 * session brief. It is not shown while none of them has anything to show; its left edge is a
 * handle that resizes it.
 */
export function RightPane() {
  const path = useEditorStore((state) => state.path);
  const boardRoot = useBoardStore((state) =>
    state.config === null ? null : state.repoRoot,
  );
  const { repoRoot, config } = useProjectStore();
  const hiddenFor = useSessionStore((state) => state.hiddenFor);
  const over = useSessionStore((state) => state.over);
  const setOver = useSessionStore((state) => state.setOver);
  const width = useLayoutStore((state) => state.paneWidth);
  const content = paneContent({
    filePath: path,
    repoRoot: boardRoot,
    hiddenFor,
    over,
  });
  const ready =
    projectStatus(repoRoot, config) === "ready" && repoRoot !== null;

  // Opening a file, from anywhere, ends the brief shown over the one before.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the open file changes.
  useEffect(() => setOver(false), [path, setOver]);

  return (
    <aside
      aria-label="Open file"
      className="right-pane relative flex min-h-0 shrink-0 flex-col border-l bg-card"
      style={{
        width: `clamp(${PANE_MIN_WIDTH}px, ${width}px, ${PANE_MAX_SHARE * 100}vw)`,
      }}
    >
      <ResizeHandle />
      <div className="pane-tools flex max-h-[50%] shrink-0 flex-col gap-2 overflow-y-auto border-b bg-background p-3 empty:hidden">
        {ready && (
          <>
            <DoctorPanel repoRoot={repoRoot} />
            <ArchivePanel repoRoot={repoRoot} />
            <ChangelogPanel repoRoot={repoRoot} />
            <SplitSpecPanel repoRoot={repoRoot} />
            <GitattributesPanel repoRoot={repoRoot} />
          </>
        )}
      </div>
      {content === "session" && (
        <div className="pane-body flex min-h-0 flex-1 flex-col">
          <SessionPanel />
        </div>
      )}
      {content === "editor" && (
        <div className="pane-body flex min-h-0 flex-1 flex-col">
          <Editor />
        </div>
      )}
    </aside>
  );
}

/** The pane's left edge: drag it, or focus it and use the arrow keys, Home and End. */
function ResizeHandle() {
  const width = useLayoutStore((state) => state.paneWidth);
  const setWidth = useLayoutStore((state) => state.setPaneWidth);
  const [dragging, setDragging] = useState(false);
  const handle = useRef<HTMLDivElement>(null);
  const shown = clampPaneWidth(width, window.innerWidth);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.current?.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setWidth(
      clampPaneWidth(window.innerWidth - event.clientX, window.innerWidth),
    );
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    handle.current?.releasePointerCapture(event.pointerId);
    setDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = paneWidthForKey(event.key, shown, window.innerWidth);
    if (next === null) return;
    event.preventDefault();
    setWidth(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a splitter; <hr> takes no focus.
    <div
      ref={handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the pane"
      aria-valuenow={shown}
      aria-valuemin={PANE_MIN_WIDTH}
      aria-valuemax={clampPaneWidth(
        Number.POSITIVE_INFINITY,
        window.innerWidth,
      )}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize outline-none",
        "after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:transition-colors",
        "hover:after:bg-primary/40 focus-visible:after:bg-primary",
        dragging && "after:bg-primary",
      )}
    />
  );
}
