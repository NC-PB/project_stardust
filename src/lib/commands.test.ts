import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  type CommandContext,
  type CommandSpec,
  commandForKey,
  paletteEntries,
} from "./commands";
import { parseShortcut } from "./palette";
import { BRAINDUMP_PROMPTS, TASK_PROMPTS } from "./prompts";

const keys = (key: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

const NOTHING_OPEN: CommandContext = {
  repository: false,
  needsInit: false,
  projectBar: false,
  braindump: false,
  specFile: false,
  board: false,
  specRead: false,
  specFound: false,
  view: "board",
  sessionHidden: null,
  file: null,
  palette: false,
};

const READY: CommandContext = {
  ...NOTHING_OPEN,
  repository: true,
  projectBar: true,
  braindump: true,
  specFile: true,
  board: true,
  specRead: true,
  specFound: true,
  sessionHidden: false,
};

const TASK_OPEN: CommandContext = {
  ...READY,
  file: {
    mode: "read",
    selection: true,
    task: true,
    prompts: TASK_PROMPTS,
    proposalUndo: true,
  },
};

/** The states of the app a user passes through, from the start screen to an open task. */
const STATES: CommandContext[] = [
  NOTHING_OPEN,
  { ...NOTHING_OPEN, repository: true, needsInit: true },
  READY,
  TASK_OPEN,
  {
    ...READY,
    view: "spec",
    sessionHidden: true,
    file: {
      mode: "source",
      selection: false,
      task: false,
      prompts: BRAINDUMP_PROMPTS,
      proposalUndo: false,
    },
  },
  { ...READY, view: "stale" },
];

/** The registered commands that no state of the app lists in the palette. */
function withoutPaletteEntry(commands: readonly CommandSpec[]): string[] {
  const listed = new Set(
    STATES.flatMap((state) =>
      paletteEntries(state, "", commands).map((entry) => entry.id as string),
    ),
  );
  return commands.map((command) => command.id).filter((id) => !listed.has(id));
}

describe("the command registry", () => {
  it("gives every command a palette entry", () => {
    expect(withoutPaletteEntry(COMMANDS)).toEqual([]);
  });

  it("finds a command registered without a palette entry", () => {
    const hidden: CommandSpec = {
      id: "test.hidden",
      name: "Hidden",
      available: () => false,
    };
    expect(withoutPaletteEntry([...COMMANDS, hidden])).toEqual(["test.hidden"]);
  });

  it("finds an entry by its name", () => {
    for (const command of COMMANDS) {
      const state = STATES.find((candidate) => command.available(candidate));
      expect(state).toBeDefined();
      if (state === undefined) continue;
      const names = paletteEntries(state, command.name).map(
        (entry) => entry.id,
      );
      expect(names[0], command.name).toBe(command.id);
    }
  });

  it("has unique ids, names and shortcuts, each shortcut readable", () => {
    const ids = COMMANDS.map((command) => command.id);
    const names = COMMANDS.map((command) => command.name);
    const shortcuts = COMMANDS.flatMap((command) =>
      "shortcut" in command ? [command.shortcut] : [],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(names.every((name) => name.trim() !== "")).toBe(true);
    expect(shortcuts.every((shortcut) => parseShortcut(shortcut))).toBe(true);
  });
});

describe("paletteEntries", () => {
  it("lists only the available commands, each with its shortcut", () => {
    const ids = paletteEntries(NOTHING_OPEN, "").map((entry) => entry.id);
    expect(ids).toContain("project.open-repository");
    expect(ids).not.toContain("editor.save");
    expect(ids).not.toContain("project.doctor");
    const save = paletteEntries(TASK_OPEN, "").find(
      (entry) => entry.id === "editor.save",
    );
    expect(save?.shortcut).toBe("Mod+S");
    const doctor = paletteEntries(TASK_OPEN, "").find(
      (entry) => entry.id === "project.doctor",
    );
    expect(doctor?.shortcut).toBeNull();
  });

  it("ranks the best match first and marks the matched characters", () => {
    const [first] = paletteEntries(TASK_OPEN, "term");
    expect(first.id).toBe("project.open-terminal");
    expect(first.matched).toEqual([5, 6, 7, 8]);
  });

  it("offers the prompts of the open file, the spec and the board", () => {
    const ids = paletteEntries(TASK_OPEN, "copy prompt").map(
      (entry) => entry.id,
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "prompt.work-on-task",
        "prompt.verify-task",
        "prompt.handoff",
        "prompt.triage-inbox",
        "prompt.interview-me",
      ]),
    );
    expect(ids).not.toContain("prompt.structure-this");
  });

  it("leaves out the view already shown and the palette itself while open", () => {
    const ids = paletteEntries({ ...READY, palette: true }, "").map(
      (entry) => entry.id,
    );
    expect(ids).not.toContain("view.board");
    expect(ids).toContain("view.spec");
    expect(ids).not.toContain("palette.open");
  });
});

describe("commandForKey", () => {
  const mod = { metaKey: true };

  it("finds the available command of a shortcut", () => {
    expect(commandForKey(keys("k", mod), NOTHING_OPEN, false, true)).toBe(
      "palette.open",
    );
    expect(commandForKey(keys("s", mod), TASK_OPEN, true, true)).toBe(
      "editor.save",
    );
    expect(
      commandForKey(keys("e", { ctrlKey: true }), TASK_OPEN, false, false),
    ).toBe("editor.toggle-mode");
  });

  it("finds nothing for an unavailable command or another key", () => {
    expect(commandForKey(keys("s", mod), READY, false, true)).toBeNull();
    expect(
      commandForKey(keys("k", mod), { ...READY, palette: true }, false, true),
    ).toBeNull();
    expect(commandForKey(keys("s"), TASK_OPEN, false, true)).toBeNull();
    expect(
      commandForKey(keys("s", { ctrlKey: true }), TASK_OPEN, false, true),
    ).toBeNull();
  });

  it("leaves Ctrl/⌘+Z to text fields and the source editor", () => {
    expect(commandForKey(keys("z", mod), TASK_OPEN, false, true)).toBe(
      "editor.undo-proposal",
    );
    expect(commandForKey(keys("z", mod), TASK_OPEN, true, true)).toBeNull();
  });
});
