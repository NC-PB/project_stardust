import { useEffect, useId, useRef } from "react";
import { hasCapture } from "@/lib/quick-capture";
import { useCaptureStore } from "@/stores/quick-capture-store";
import { useThemeStore } from "@/stores/theme-store";

/**
 * The quick capture window (`S-quick-capture`): one line and a project; Enter appends it to
 * the project's braindump, Escape hides the window.
 */
export function QuickCapture() {
  const {
    projects,
    chosen,
    text,
    error,
    saving,
    load,
    choose,
    setText,
    submit,
    cancel,
  } = useCaptureStore();
  const startTheme = useThemeStore((state) => state.start);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => startTheme(), [startTheme]);

  // The window is hidden, not closed, between captures: shown again, it reads the projects anew.
  useEffect(() => {
    const onFocus = () => {
      void load();
      input.current?.focus();
    };
    onFocus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <form
      className="flex h-screen flex-col gap-2 bg-background p-3 text-sm text-foreground"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") void cancel();
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="An idea for the braindump"
        aria-label="Idea"
        className="rounded border bg-background px-2 py-1"
      />
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-muted-foreground">
          Project
        </label>
        <select
          id={id}
          value={chosen ?? ""}
          onChange={(event) => choose(event.target.value)}
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5"
        >
          {projects.length === 0 && <option value="">No project yet</option>}
          {projects.map((project) => (
            <option
              key={project.repoRoot}
              value={project.repoRoot}
              title={project.repoRoot}
            >
              {project.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={saving || chosen === null || !hasCapture(text)}
          className="rounded-md border px-2 py-0.5 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
