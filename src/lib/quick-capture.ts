import {
  recentFromSettings,
  tabLabels,
  workspaceFromSettings,
} from "./workspace";

/** The app setting holding the quick capture hotkey; empty turns the hotkey off. */
export const HOTKEY_SETTING = "quickCaptureHotkey";
/** The hotkey while none is set. */
export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
/** The label of the capture window, given by Rust when it creates it. */
export const CAPTURE_WINDOW = "capture";

/** The hotkey kept in the settings: missing or not text means the default, empty means off. */
export function hotkeyFromSetting(stored: unknown): string {
  return typeof stored === "string" ? stored.trim() : DEFAULT_HOTKEY;
}

/** A project the capture window offers, with the label its tab shows. */
export interface CaptureProject {
  repoRoot: string;
  label: string;
}

/** The projects of the capture window and the one chosen at first. */
export interface CaptureChoice {
  projects: CaptureProject[];
  chosen: string | null;
}

/**
 * The projects to capture into, from the app settings: the open tabs in tab order, then the
 * recent projects without a tab. `previous`, the project chosen last, stays chosen while it
 * is offered; otherwise the shown tab, else the first project.
 */
export function captureChoice(
  workspaceSetting: unknown,
  recentSetting: unknown,
  legacyRoot: unknown,
  previous: string | null,
): CaptureChoice {
  const workspace = workspaceFromSettings(workspaceSetting, legacyRoot);
  const recent = recentFromSettings(recentSetting, workspace);
  const roots = [
    ...workspace.tabs,
    ...recent.filter((root) => !workspace.tabs.includes(root)),
  ];
  const labels = tabLabels(roots);
  const projects = roots.map((repoRoot) => ({
    repoRoot,
    label: labels[repoRoot] ?? repoRoot,
  }));
  const chosen =
    previous !== null && roots.includes(previous)
      ? previous
      : (workspace.active ?? roots[0] ?? null);
  return { projects, chosen };
}

/** Whether `text` holds anything to capture; the line itself is made in Rust. */
export function hasCapture(text: string): boolean {
  return text.trim() !== "";
}
