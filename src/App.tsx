import { useEffect } from "react";
import { ProjectPanel } from "@/components/project-panel";
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">stardust</h1>
      <ProjectPanel />
      <p className="text-xs text-muted-foreground">{versionLabel(version)}</p>
    </main>
  );
}

export default App;
