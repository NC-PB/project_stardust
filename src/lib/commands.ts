import type { EditorMode, ShortcutKeys } from "@/lib/editor";
import { matchesShortcut, rankByName } from "@/lib/palette";
import { FILE_PROMPTS, type FilePrompt, PROMPT_LABELS } from "@/lib/prompts";
import type { MainView } from "@/lib/spec-view";

/**
 * What decides which commands are available, read from the stores when needed; plain data so
 * availability can be tested without them.
 */
export interface CommandContext {
  /** A repository is open in the shown tab (`S-init`). */
  repository: boolean;
  /** How many project tabs are open (`S-multi-project`). */
  tabs: number;
  /** A recent project has no open tab. */
  closedRecent: boolean;
  /** The open repository has no `docs/planner.yml`. */
  needsInit: boolean;
  /** The project bar shows its buttons: the project is ready and no init report is shown. */
  projectBar: boolean;
  /** The project bar knows a braindump file and a spec file. */
  braindump: boolean;
  specFile: boolean;
  /** The board of the open project is loaded. */
  board: boolean;
  /** The spec is read (the view switch shows) and was found. */
  specRead: boolean;
  specFound: boolean;
  view: MainView;
  /** The session panel is hidden; `null` while it has no project. */
  sessionHidden: boolean | null;
  /** The open file, if any. */
  file: {
    mode: EditorMode;
    /** Text is selected in it. */
    selection: boolean;
    /** It is a task file. */
    task: boolean;
    /** The prompts its "Copy prompt" row offers. */
    prompts: readonly FilePrompt[];
    /** The last Accept or Reject can still be undone. */
    proposalUndo: boolean;
  } | null;
  /** The command palette is open. */
  palette: boolean;
}

/** A command as registered: what the palette lists and what its shortcut runs. */
export interface CommandSpec {
  /** Stable id, `group.action`; buttons and shortcuts run commands by it. */
  id: string;
  /** The palette entry; matched against what is typed. */
  name: string;
  /** `Mod+<key>` or `Mod+Shift+<key>`, see `parseShortcut`. */
  shortcut?: string;
  /** False when the shortcut must not act while the focus is in a text field or editor. */
  whileTyping?: boolean;
  available: (context: CommandContext) => boolean;
}

const promptAvailable =
  (prompt: FilePrompt) =>
  (context: CommandContext): boolean => {
    if (prompt === "triage-inbox") return context.board;
    if (
      prompt === "interview-me" ||
      prompt === "integrate-answers" ||
      prompt === "generate-tasks"
    )
      return context.specFound;
    return context.file?.prompts.includes(prompt) ?? false;
  };

const always = () => true;
const fileOpen = (context: CommandContext) => context.file !== null;

/**
 * Every command of the app (`S-palette`). A command is an app action that needs no item chosen
 * first; opening a card, a search hit or a finding, and the confirm and cancel buttons of a
 * preview a command opened, belong to that item or panel. The palette lists exactly the
 * available commands of this list, and the only window shortcuts are the ones given here.
 */
export const COMMANDS = [
  {
    id: "palette.open",
    name: "Command palette",
    shortcut: "Mod+K",
    available: (context) => !context.palette,
  },
  { id: "project.open-repository", name: "Open repository", available: always },
  {
    id: "workspace.next-tab",
    name: "Next project tab",
    available: (context) => context.tabs > 1,
  },
  {
    id: "workspace.previous-tab",
    name: "Previous project tab",
    available: (context) => context.tabs > 1,
  },
  {
    id: "workspace.close-tab",
    name: "Close project tab",
    available: (context) => context.tabs > 0,
  },
  {
    id: "workspace.reopen-recent",
    name: "Open the most recent closed project",
    available: (context) => context.closedRecent,
  },
  {
    id: "project.initialize",
    name: "Initialize project",
    available: (context) => context.needsInit,
  },
  {
    id: "project.open-terminal",
    name: "Open terminal",
    available: (context) => context.repository,
  },
  {
    id: "project.open-braindump",
    name: "Open braindump",
    available: (context) => context.projectBar && context.braindump,
  },
  {
    id: "project.open-spec",
    name: "Open spec file",
    available: (context) => context.projectBar && context.specFile,
  },
  {
    id: "project.split-spec",
    name: "Split spec",
    available: (context) => context.projectBar && context.specFile,
  },
  {
    id: "project.gitattributes",
    name: "Git attributes",
    available: (context) => context.projectBar,
  },
  {
    id: "project.changelog",
    name: "Changelog draft",
    available: (context) => context.projectBar,
  },
  {
    id: "project.archive",
    name: "Archive finished tasks",
    available: (context) => context.projectBar,
  },
  {
    id: "project.doctor",
    name: "Doctor: check the planning files",
    available: (context) => context.projectBar,
  },
  {
    id: "search.focus",
    name: "Search planning files",
    available: (context) => context.repository,
  },
  {
    id: "proposals.toggle",
    name: "Show or hide open proposals",
    available: (context) => context.repository,
  },
  {
    id: "view.board",
    name: "Show board",
    available: (context) => context.specRead && context.view !== "board",
  },
  {
    id: "view.spec",
    name: "Show spec view",
    available: (context) => context.specRead && context.view !== "spec",
  },
  {
    id: "view.stale",
    name: "Show Stale view",
    available: (context) => context.specRead && context.view !== "stale",
  },
  {
    id: "spec.questions",
    name: "Show or hide the questions form",
    available: (context) => context.specFound,
  },
  {
    id: "spec.mind-map",
    name: "Switch Structure between tree and mind map",
    available: (context) => context.specFound,
  },
  {
    id: "spec.expand-all",
    name: "Expand all nodes",
    available: (context) => context.specFound,
  },
  {
    id: "spec.collapse-all",
    name: "Collapse all nodes",
    available: (context) => context.specFound,
  },
  {
    id: "session.show",
    name: "Show session panel",
    available: (context) => context.sessionHidden === true,
  },
  {
    id: "session.hide",
    name: "Hide session panel",
    available: (context) => context.sessionHidden === false,
  },
  {
    id: "editor.save",
    name: "Save file",
    shortcut: "Mod+S",
    available: fileOpen,
  },
  {
    id: "editor.toggle-mode",
    name: "Switch between source and read mode",
    shortcut: "Mod+E",
    available: fileOpen,
  },
  {
    id: "editor.make-task",
    name: "Make task from selection",
    available: (context) => context.file?.selection ?? false,
  },
  {
    id: "editor.undo-proposal",
    name: "Undo proposal accept or reject",
    // In source mode the editor's own history takes Mod+Z.
    shortcut: "Mod+Z",
    whileTyping: false,
    available: (context) => context.file?.proposalUndo ?? false,
  },
  {
    id: "editor.delete",
    name: "Delete task file",
    available: (context) => context.file?.task ?? false,
  },
  { id: "editor.close", name: "Close file", available: fileOpen },
  // Each prompt that needs no node has a command; Verify area stays on its node.
  ...FILE_PROMPTS.map((prompt) => ({
    id: `prompt.${prompt}` as const,
    name: `Copy prompt: ${PROMPT_LABELS[prompt]}`,
    available: promptAvailable(prompt),
  })),
  { id: "theme.system", name: "Theme: System", available: always },
  { id: "theme.light", name: "Theme: Light", available: always },
  { id: "theme.dark", name: "Theme: Dark", available: always },
  { id: "settings.open", name: "Settings: terminal", available: always },
] as const satisfies readonly CommandSpec[];

export type CommandId = (typeof COMMANDS)[number]["id"];

const byId = new Map<string, CommandSpec>(
  COMMANDS.map((command) => [command.id, command]),
);

/** The registered command with `id`. */
export function commandOf(id: CommandId): CommandSpec {
  return byId.get(id) as CommandSpec;
}

/** One line of the palette: a command, the characters of its name that matched, its shortcut. */
export interface PaletteEntry {
  id: CommandId;
  name: string;
  shortcut: string | null;
  matched: number[];
}

/**
 * The palette's entries for `query`: every registered command available in `context` whose
 * name matches, best match first, in registry order without a query.
 */
export function paletteEntries(
  context: CommandContext,
  query: string,
  commands: readonly CommandSpec[] = COMMANDS,
): PaletteEntry[] {
  return rankByName(
    commands.filter((command) => command.available(context)),
    query,
  ).map(({ item, match }) => ({
    id: item.id as CommandId,
    name: item.name,
    shortcut: item.shortcut ?? null,
    matched: match.indices,
  }));
}

/**
 * The command a key event runs: the available command whose shortcut it is, unless the focus
 * is in a text field (`typing`) and the command does not act there.
 */
export function commandForKey(
  event: ShortcutKeys,
  context: CommandContext,
  typing: boolean,
  mac: boolean,
  commands: readonly CommandSpec[] = COMMANDS,
): CommandId | null {
  const command = commands.find(
    (candidate) =>
      candidate.shortcut !== undefined &&
      matchesShortcut(event, candidate.shortcut, mac) &&
      (candidate.whileTyping !== false || !typing) &&
      candidate.available(context),
  );
  return command ? (command.id as CommandId) : null;
}
