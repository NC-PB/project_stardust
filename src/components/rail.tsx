import { cn } from "cn";
import { Compass, FolderCog } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { RailButton } from "@/components/rail-button";
import { ViewSwitch } from "@/components/view-switch";
import { type CommandId, commandOf } from "@/lib/commands";
import { paneContent } from "@/lib/layout";
import { useBoardStore } from "@/stores/board-store";
import { commandContext, runCommand } from "@/stores/command-store";
import { useEditorStore } from "@/stores/editor-store";
import { useMenuStore } from "@/stores/menu-store";
import { useProjectStore } from "@/stores/project-store";
import { useSessionStore } from "@/stores/session-store";

/**
 * The rail on the window's left edge (`S-window-layout`): the main views, the session brief
 * and the Project menu. Every button runs its command (`S-palette`).
 */
export function Rail() {
  const repoRoot = useProjectStore((state) => state.repoRoot);
  if (repoRoot === null) return null;
  return (
    <nav
      aria-label="Workspace"
      className="flex w-15 shrink-0 flex-col items-center gap-1 py-2"
    >
      <ViewSwitch />
      <SessionToggle />
      <div className="mt-auto">
        <ProjectMenu />
      </div>
    </nav>
  );
}

/** Shows or hides the session brief in the right pane (`S-session-panel`). */
function SessionToggle() {
  const repoRoot = useBoardStore((state) =>
    state.config === null ? null : state.repoRoot,
  );
  const filePath = useEditorStore((state) => state.path);
  const hiddenFor = useSessionStore((state) => state.hiddenFor);
  const over = useSessionStore((state) => state.over);
  if (repoRoot === null) return null;
  const shown =
    paneContent({ filePath, repoRoot, hiddenFor, over }) === "session";
  return (
    <RailButton
      icon={Compass}
      label="Session"
      active={shown}
      aria-pressed={shown}
      title={shown ? "Hide the session brief" : "Show the session brief"}
      onClick={() => runCommand(shown ? "session.hide" : "session.show")}
    />
  );
}

/** The former project bar, grouped; only the commands available now are listed. */
const MENU: { label: string; commands: CommandId[] }[] = [
  { label: "Files", commands: ["project.open-braindump", "project.open-spec"] },
  {
    label: "Planning files",
    commands: [
      "project.doctor",
      "project.archive",
      "project.changelog",
      "project.split-spec",
      "project.gitattributes",
    ],
  },
  {
    label: "Repository",
    commands: [
      "project.initialize",
      "project.open-terminal",
      "project.open-repository",
    ],
  },
];

/** Short names where the palette's are longer than a menu needs. */
const MENU_NAMES: Partial<Record<CommandId, string>> = {
  "project.open-braindump": "Braindump",
  "project.open-spec": "Spec file",
  "project.doctor": "Doctor",
  "project.archive": "Archive finished tasks",
  "project.changelog": "Changelog draft",
  "project.open-repository": "Open another repository",
};

function ProjectMenu() {
  const open = useMenuStore((state) => state.projectMenu);
  const setOpen = useMenuStore((state) => state.setProjectMenu);
  // The entries are read when the menu opens; it closes on any choice.
  const context = open ? commandContext() : null;
  const groups =
    context === null
      ? []
      : MENU.map((group) => ({
          ...group,
          commands: group.commands.filter((id) =>
            commandOf(id).available(context),
          ),
        })).filter((group) => group.commands.length > 0);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <RailButton icon={FolderCog} label="Project" active={open} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={6}
          className="z-30 min-w-56 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-[0_8px_24px_-12px_rgb(30_39_51/0.35)]"
        >
          {groups.map((group, index) => (
            <DropdownMenu.Group key={group.label}>
              {index > 0 && (
                <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border" />
              )}
              <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
                {group.label}
              </DropdownMenu.Label>
              {group.commands.map((id) => (
                <DropdownMenu.Item
                  key={id}
                  onSelect={() => runCommand(id)}
                  className={cn(
                    "cursor-default rounded-sm px-2 py-1.5 outline-none select-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  {MENU_NAMES[id] ?? commandOf(id).name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
