import { useEffect } from "react";
import { Board } from "@/components/board";
import { Editor } from "@/components/editor";
import { ProjectPanel } from "@/components/project-panel";
import { PromptNotice } from "@/components/prompt-notice";
import { SearchBox } from "@/components/search-box";
import { versionLabel } from "@/lib/version";
import { useAppStore } from "@/stores/app-store";
import { useProjectStore } from "@/stores/project-store";

function App() {
  const version = useAppStore((state) => state.version);
  const loadVersion = useAppStore((state) => state.loadVersion);
  const restore = useProjectStore((state) => state.restore);
  const listen = useProjectStore((state) => state.listen);

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

  return (
    <main className="flex h-screen flex-col items-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">stardust</h1>
      <ProjectPanel />
      <SearchBox />
      <div className="flex min-h-0 w-full flex-1 gap-4">
        <Board />
        <Editor />
      </div>
      <p className="text-xs text-muted-foreground">{versionLabel(version)}</p>
      <PromptNotice />
    </main>
  );
}

export default App;
