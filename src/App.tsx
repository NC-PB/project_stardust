import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { versionLabel } from "@/lib/version";
import { useAppStore } from "@/stores/app-store";

function App() {
  const version = useAppStore((state) => state.version);
  const loadVersion = useAppStore((state) => state.loadVersion);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">stardust</h1>
      <p className="text-muted-foreground">{versionLabel(version)}</p>
      <Button variant="outline" onClick={() => void loadVersion()}>
        Reload version
      </Button>
    </main>
  );
}

export default App;
