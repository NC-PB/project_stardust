import { useEffect } from "react";
import { Board } from "@/components/board";
import { CommandPalette, PaletteButton } from "@/components/command-palette";
import { ProjectNotices, StatusBar } from "@/components/project-panel";
import { ProjectTabs, RecentProjects } from "@/components/project-tabs";
import { PromptNotice } from "@/components/prompt-notice";
import { ProposalList } from "@/components/proposal-list";
import { Rail } from "@/components/rail";
import { RightPane } from "@/components/right-pane";
import { SearchBox } from "@/components/search-box";
import { SettingsMenu } from "@/components/settings-menu";
import { SpecView } from "@/components/spec-view";
import { StaleView } from "@/components/stale-view";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { runCommand } from "@/stores/command-store";
import { useCommitStore } from "@/stores/commit-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectStore } from "@/stores/project-store";
import { useHotkeyStore } from "@/stores/quick-capture-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useThemeStore } from "@/stores/theme-store";
import { useViewStore } from "@/stores/view-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

function App() {
  const repoRoot = useProjectStore((state) => state.repoRoot);
  const loadLayout = useLayoutStore((state) => state.load);
  const loadVersion = useAppStore((state) => state.loadVersion);
  const restore = useWorkspaceStore((state) => state.restore);
  const listen = useWorkspaceStore((state) => state.listen);
  const refreshCommitsOnFocus = useCommitStore((state) => state.refreshOnFocus);
  const startTheme = useThemeStore((state) => state.start);
  const loadTerminal = useTerminalStore((state) => state.load);
  const loadHotkey = useHotkeyStore((state) => state.load);
  const view = useViewStore((state) => state.view);

  useEffect(() => startTheme(), [startTheme]);
  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);
  useEffect(() => {
    void loadTerminal();
  }, [loadTerminal]);
  useEffect(() => {
    void loadHotkey();
  }, [loadHotkey]);

  useEffect(() => {
    void loadVersion();
    void restore();
  }, [loadVersion, restore]);

  useEffect(() => {
    const unlisten = listen();
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [listen]);

  // Commits happen outside the planning root, so they are read again when the window gets focus.
  useEffect(() => refreshCommitsOnFocus(), [refreshCommitsOnFocus]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b pr-2 pl-4">
        <span className="shrink-0 text-sm font-semibold tracking-tight">
          stardust
        </span>
        <ProjectTabs />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <SearchBox />
          <ProposalList />
          <PaletteButton />
          <SettingsMenu />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="flex min-w-0 flex-1 flex-col">
          <ProjectNotices />
          {repoRoot === null ? (
            <StartScreen />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {view === "spec" ? (
                <SpecView />
              ) : view === "stale" ? (
                <StaleView />
              ) : (
                <Board />
              )}
            </div>
          )}
        </main>
        <RightPane />
      </div>
      <StatusBar />
      <PromptNotice />
      <CommandPalette />
    </div>
  );
}

/** No project shown: open one, or one of the recent projects (`S-multi-project`). */
function StartScreen() {
  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Open a repository</h1>
          <p className="text-sm text-muted-foreground">
            stardust plans inside the repository, in plain markdown under{" "}
            <code className="code-id">docs/planning/</code>. A repository
            without planning files can be initialized after opening.
          </p>
          <div>
            <Button onClick={() => runCommand("project.open-repository")}>
              Open repository…
            </Button>
          </div>
        </div>
        <RecentProjects />
      </div>
    </div>
  );
}

export default App;
