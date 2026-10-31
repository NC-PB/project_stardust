import {
  type CommandContext,
  type CommandId,
  commandForKey,
} from "@/lib/commands";
import { isMac, type ShortcutKeys } from "@/lib/editor";
import { projectStatus } from "@/lib/project";
import {
  editorPromptsOf,
  FILE_PROMPTS,
  type FilePrompt,
  NO_INPUT,
  taskPathOf,
} from "@/lib/prompts";
import type { MainView } from "@/lib/spec-view";
import { expandableKeys } from "@/lib/spec-view";
import type { ThemeChoice } from "@/lib/theme";
import { closedRecent } from "@/lib/workspace";
import { useArchiveStore } from "./archive-store";
import { useBoardStore } from "./board-store";
import { useChangelogStore } from "./changelog-store";
import { useDoctorStore } from "./doctor-store";
import { useEditorStore } from "./editor-store";
import { useGitattributesStore } from "./gitattributes-store";
import { useMenuStore } from "./menu-store";
import { useProjectStore } from "./project-store";
import { usePromptStore } from "./prompt-store";
import { useSessionStore } from "./session-store";
import { useSpecStore } from "./spec-store";
import { useSplitStore } from "./split-store";
import { useTerminalStore } from "./terminal-store";
import { useThemeStore } from "./theme-store";
import { useViewStore } from "./view-store";
import { useWorkspaceStore } from "./workspace-store";

/** The open file relative to the repository when it is a task, from the board's config. */
function openTaskPath(): string | null {
  const { repoRoot, config } = useBoardStore.getState();
  const { path } = useEditorStore.getState();
  if (path === null || repoRoot === null || config === null) return null;
  return taskPathOf(path, repoRoot, config.planning_root, config.columns);
}

/** The prompts of the editor's "Copy prompt" row for the open file and their input. */
function openFilePrompts() {
  const { repoRoot, config } = useBoardStore.getState();
  const { path } = useEditorStore.getState();
  if (path === null || repoRoot === null || config === null) return null;
  return editorPromptsOf(path, repoRoot, config.planning_root, config.columns);
}

/** What decides the available commands now, read from the stores (`S-palette`). */
export function commandContext(): CommandContext {
  const project = useProjectStore.getState();
  const board = useBoardStore.getState();
  const spec = useSpecStore.getState().spec;
  const editor = useEditorStore.getState();
  const status = projectStatus(project.repoRoot, project.config);
  const boardReady = board.repoRoot !== null && board.config !== null;
  const workspace = useWorkspaceStore.getState();
  return {
    repository: project.repoRoot !== null,
    tabs: workspace.tabs.length,
    closedRecent: closedRecent(workspace.recent, workspace.tabs).length > 0,
    needsInit: status === "needs-init",
    projectBar:
      status === "ready" &&
      project.initReport === null &&
      project.repoRoot !== null,
    braindump: Boolean(project.sources?.braindump),
    specFile: Boolean(project.sources?.spec),
    board: boardReady,
    specRead: spec !== null,
    specFound: spec?.found ?? false,
    view: useViewStore.getState().view,
    sessionHidden: boardReady
      ? useSessionStore.getState().hiddenFor === board.repoRoot
      : null,
    file:
      editor.path === null
        ? null
        : {
            mode: editor.modes[editor.path] ?? "source",
            selection: editor.selection.trim() !== "",
            task: openTaskPath() !== null,
            prompts: openFilePrompts()?.prompts ?? [],
            proposalUndo:
              editor.proposalUndo !== null &&
              editor.proposalUndo.after === editor.text,
          },
    palette: useMenuStore.getState().palette,
  };
}

const withRepository = (run: (repoRoot: string) => unknown) => () => {
  const { repoRoot } = useProjectStore.getState();
  if (repoRoot !== null) void run(repoRoot);
};

const openSource = (which: "braindump" | "spec") =>
  withRepository((repoRoot) => {
    const path = useProjectStore.getState().sources?.[which];
    if (path) return useEditorStore.getState().open(repoRoot, path);
  });

const showView = (view: MainView) => () => useViewStore.getState().show(view);

/** Shows the spec view, then changes it. */
const inSpecView = (change: () => void) => () => {
  useViewStore.getState().show("spec");
  change();
};

const expandAll = (expanded: boolean) =>
  inSpecView(() => {
    const spec = useSpecStore.getState().spec;
    if (spec !== null)
      useViewStore
        .getState()
        .setAllExpanded(expandableKeys(spec.structure), expanded);
  });

const copyPrompt = (prompt: FilePrompt) => () => {
  const offered = openFilePrompts();
  const input =
    offered?.prompts.includes(prompt) === true ? offered.input : NO_INPUT;
  const repoRoot =
    useBoardStore.getState().repoRoot ?? useSpecStore.getState().repoRoot;
  if (repoRoot !== null)
    void usePromptStore.getState().copy(repoRoot, prompt, input);
};

const chooseTheme = (choice: ThemeChoice) => () =>
  void useThemeStore.getState().choose(choice);

/**
 * What each command does. Typed by the registry's ids, so a command without a run function,
 * or a run function without a command, does not compile.
 */
const RUNS: Record<CommandId, () => void> = {
  "palette.open": () => useMenuStore.getState().setPalette(true),
  "project.open-repository": () => void useWorkspaceStore.getState().choose(),
  "workspace.next-tab": () => void useWorkspaceStore.getState().step(1),
  "workspace.previous-tab": () => void useWorkspaceStore.getState().step(-1),
  "workspace.close-tab": () => void useWorkspaceStore.getState().close(),
  "workspace.reopen-recent": () =>
    void useWorkspaceStore.getState().reopenRecent(),
  "project.initialize": () => void useProjectStore.getState().initialize(),
  "project.open-terminal": withRepository((repoRoot) =>
    useTerminalStore.getState().open(repoRoot),
  ),
  "project.open-braindump": openSource("braindump"),
  "project.open-spec": openSource("spec"),
  "project.split-spec": withRepository((repoRoot) =>
    useSplitStore.getState().preview(repoRoot),
  ),
  "project.gitattributes": withRepository((repoRoot) =>
    useGitattributesStore.getState().preview(repoRoot),
  ),
  "project.changelog": withRepository((repoRoot) =>
    useChangelogStore.getState().start(repoRoot),
  ),
  "project.archive": withRepository((repoRoot) =>
    useArchiveStore.getState().preview(repoRoot),
  ),
  "project.doctor": withRepository((repoRoot) =>
    useDoctorStore.getState().check(repoRoot),
  ),
  "search.focus": () => useMenuStore.getState().focusSearch(),
  "proposals.toggle": () => {
    const menu = useMenuStore.getState();
    menu.setProposals(!menu.proposals);
  },
  "view.board": showView("board"),
  "view.spec": showView("spec"),
  "view.stale": showView("stale"),
  "spec.questions": inSpecView(() => useViewStore.getState().toggleQuestions()),
  "spec.mind-map": inSpecView(() => useViewStore.getState().toggleMindMap()),
  "spec.expand-all": expandAll(true),
  "spec.collapse-all": expandAll(false),
  "session.show": () => useSessionStore.getState().show(),
  "session.hide": () => {
    const { repoRoot } = useBoardStore.getState();
    if (repoRoot !== null) useSessionStore.getState().hide(repoRoot);
  },
  "editor.save": () => void useEditorStore.getState().save(),
  "editor.toggle-mode": () => useEditorStore.getState().toggleMode(),
  "editor.make-task": () => void useEditorStore.getState().makeTask(),
  "editor.undo-proposal": () => useEditorStore.getState().undoProposal(),
  "editor.delete": () =>
    useMenuStore.getState().setConfirmTrash(useEditorStore.getState().path),
  "editor.close": () => void useEditorStore.getState().close(),
  ...(Object.fromEntries(
    FILE_PROMPTS.map((prompt) => [`prompt.${prompt}`, copyPrompt(prompt)]),
  ) as Record<`prompt.${FilePrompt}`, () => void>),
  "theme.system": chooseTheme("system"),
  "theme.light": chooseTheme("light"),
  "theme.dark": chooseTheme("dark"),
  "settings.open": () => useMenuStore.getState().setSettings(true),
};

/**
 * Runs the command `id`, as its button, its shortcut and its palette entry do. Runs at once,
 * inside the click or key event, so a prompt copy still counts as part of it.
 */
export function runCommand(id: CommandId): void {
  RUNS[id]();
}

/** The ids that have a run function, for the test that compares them with the registry. */
export const RUN_IDS = Object.keys(RUNS);

/** Whether `target` takes typed text: an input, a text area or an editable element. */
function isTyping(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

/**
 * Runs the command whose shortcut the key event is, if one is available; returns whether it
 * did. The only window key handler of the app.
 */
export function handleShortcut(
  event: ShortcutKeys & { target: EventTarget | null; preventDefault(): void },
  mac: boolean = isMac,
): boolean {
  const id = commandForKey(
    event,
    commandContext(),
    isTyping(event.target),
    mac,
  );
  if (id === null) return false;
  event.preventDefault();
  runCommand(id);
  return true;
}
