import { useEffect } from "react";
import { Board } from "@/components/board";
import { Editor } from "@/components/editor";
import { ProjectPanel } from "@/components/project-panel";
import { PromptNotice } from "@/components/prompt-notice";
import { ProposalList } from "@/components/proposal-list";
import { SearchBox } from "@/components/search-box";
import { SessionPanel } from "@/components/session-panel";
import { SettingsMenu } from "@/components/settings-menu";
import { SpecView } from "@/components/spec-view";
import { StaleView } from "@/components/stale-view";
import { ViewSwitch } from "@/components/view-switch";
import { versionLabel } from "@/lib/version";
import { useAppStore } from "@/stores/app-store";
import { useCommitStore } from "@/stores/commit-store";
import { useProjectStore } from "@/stores/project-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useThemeStore } from "@/stores/theme-store";
import { useViewStore } from "@/stores/view-store";

function App() {
  const version = useAppStore((state) => state.version);
  const loadVersion = useAppStore((state) => state.loadVersion);
  const restore = useProjectStore((state) => state.restore);
  const listen = useProjectStore((state) => state.listen);
  const refreshCommitsOnFocus = useCommitStore((state) => state.refreshOnFocus);
  const startTheme = useThemeStore((state) => state.start);
  const loadTerminal = useTerminalStore((state) => state.load);
  const view = useViewStore((state) => state.view);

  useEffect(() => startTheme(), [startTheme]);
  useEffect(() => {
    void loadTerminal();
  }, [loadTerminal]);

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
    <main className="flex h-screen flex-col items-center gap-6 p-6">
      <header className="relative flex w-full items-center justify-center">
        <div className="absolute left-0">
          <ProposalList />
        </div>
        <h1 className="text-2xl font-semibold">stardust</h1>
        <div className="absolute right-0">
          <SettingsMenu />
        </div>
      </header>
      <ProjectPanel />
      <ViewSwitch />
      <SearchBox />
      <SessionPanel />
      <div className="flex min-h-0 w-full flex-1 gap-4">
        {view === "spec" ? (
          <SpecView />
        ) : view === "stale" ? (
          <StaleView />
        ) : (
          <Board />
        )}
        <Editor />
      </div>
      <p className="text-xs text-muted-foreground">{versionLabel(version)}</p>
      <PromptNotice />
    </main>
  );
}

export default App;
