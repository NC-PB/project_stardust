/**
 * The window's regions (`S-window-layout`): what the right pane shows and how wide it is.
 * Plain functions; the stores and components only read them.
 */

/** The right pane is never narrower than this, in CSS pixels. */
export const PANE_MIN_WIDTH = 320;
/** The right pane takes at most this share of the window, so the board keeps a column or two. */
export const PANE_MAX_SHARE = 0.7;
/** The width before the user resized the pane. */
export const PANE_DEFAULT_WIDTH = 560;
/** One arrow key press on the handle. */
export const PANE_STEP = 32;

/** `width` kept between the minimum and the share of `windowWidth`, whole pixels. */
export function clampPaneWidth(width: number, windowWidth: number): number {
  const max = Math.max(
    PANE_MIN_WIDTH,
    Math.round(windowWidth * PANE_MAX_SHARE),
  );
  return Math.round(Math.min(Math.max(width, PANE_MIN_WIDTH), max));
}

/** The width kept in the app settings (`paneWidth`); anything but a positive number is the default. */
export function paneWidthFromSetting(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : PANE_DEFAULT_WIDTH;
}

/** The pane width after a handle key, or `null` for a key the handle does not take. */
export function paneWidthForKey(
  key: string,
  width: number,
  windowWidth: number,
): number | null {
  // The handle sits on the pane's left edge: left widens the pane, right narrows it.
  if (key === "ArrowLeft")
    return clampPaneWidth(width + PANE_STEP, windowWidth);
  if (key === "ArrowRight")
    return clampPaneWidth(width - PANE_STEP, windowWidth);
  if (key === "Home")
    return clampPaneWidth(Number.POSITIVE_INFINITY, windowWidth);
  if (key === "End") return PANE_MIN_WIDTH;
  return null;
}

export type PaneContent = "editor" | "session" | "none";

export interface PaneState {
  /** The open file, if any. */
  filePath: string | null;
  /** The shown project; without one there is no session brief. */
  repoRoot: string | null;
  /** The project the brief was hidden for (`S-session-panel`). */
  hiddenFor: string | null;
  /** The brief was asked for over the open file. */
  over: boolean;
}

/**
 * What the right pane shows: the session brief when no file is open (unless it was hidden for
 * this project) or when it was asked for over the file, else the open file, else nothing.
 */
export function paneContent(state: PaneState): PaneContent {
  if (state.repoRoot !== null) {
    if (state.filePath !== null && state.over) return "session";
    if (state.filePath === null && state.hiddenFor !== state.repoRoot)
      return "session";
  }
  return state.filePath !== null ? "editor" : "none";
}
