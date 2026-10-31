import { autocompletion } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import CodeMirror from "@uiw/react-codemirror";
import { cn } from "cn";
import { ImageOff, X } from "lucide-react";
import {
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { commands, type GlossaryTerm } from "@/bindings";
import { Backlinks } from "@/components/backlinks";
import { ProposalQuote, ProposalUndo } from "@/components/proposal-quote";
import { StaleBadges, useStaleFlagsOf } from "@/components/stale-flags";
import { Button } from "@/components/ui/button";
import { APPEND_ONLY_EXPLANATION, violationText } from "@/lib/append-only";
import {
  bodyOf,
  clampLine,
  FORM_FIELDS,
  type FormField,
  fileNameOf,
  formValue,
  frontmatterLineCount,
  resolveLink,
} from "@/lib/editor";
import { remarkGlossary } from "@/lib/glossary";
import { dropPoint, imageBadge, pastedFiles } from "@/lib/images";
import { linkCompletion, repoRelative } from "@/lib/links";
import { editorPromptsOf, PROMPT_LABELS, taskPathOf } from "@/lib/prompts";
import {
  protectedLinesField,
  protectedLinesOf,
  setProtectedLines,
} from "@/lib/protected-lines";
import { useBoardStore } from "@/stores/board-store";
import { runCommand } from "@/stores/command-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLinkStore } from "@/stores/link-store";
import { useMenuStore } from "@/stores/menu-store";
import { useSpecStore } from "@/stores/spec-store";
import { useThemeStore } from "@/stores/theme-store";

/** Markup stays visible; headings are sized, the rest is coloured (`S-editor-layout`). */
const sourceHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.35em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--color-primary)" },
  { tag: tags.url, color: "var(--color-primary)", textDecoration: "underline" },
  {
    tag: tags.monospace,
    fontFamily: "var(--font-mono)",
    backgroundColor: "var(--color-muted)",
    borderRadius: "3px",
  },
  // Task list markers `[ ]` and `[x]`.
  { tag: tags.atom, color: "var(--color-primary)", fontWeight: "700" },
  { tag: tags.quote, color: "var(--color-muted-foreground)" },
  {
    tag: tags.processingInstruction,
    color: "var(--color-muted-foreground)",
  },
]);

const frontmatterLine = Decoration.line({ class: "cm-frontmatter" });

/** Marks the lines of the frontmatter block. */
const frontmatterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = this.build(update.view);
    }
    build(view: EditorView): DecorationSet {
      const { doc } = view.state;
      const lines = Math.min(frontmatterLineCount(doc.toString()), doc.lines);
      return Decoration.set(
        Array.from({ length: lines }, (_, i) =>
          frontmatterLine.range(doc.line(i + 1).from),
        ),
      );
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const sourceExtensions = [
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(sourceHighlight),
  frontmatterPlugin,
  protectedLinesField,
  EditorView.lineWrapping,
  // Typing `](` or `[[` offers files to link to (`S-links`).
  autocompletion({
    override: [
      linkCompletion(
        () => useLinkStore.getState().candidates,
        () => {
          const { repoRoot, path } = useEditorStore.getState();
          return repoRoot && path ? repoRelative(repoRoot, path) : null;
        },
      ),
    ],
  }),
];

const sourceStyle = {
  "&": { backgroundColor: "transparent", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-sans)",
    padding: "8px 0",
    caretColor: "var(--color-foreground)",
  },
  ".cm-cursor": { borderLeftColor: "var(--color-foreground)" },
  ".cm-frontmatter": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.85em",
    backgroundColor: "var(--color-muted)",
    color: "var(--color-muted-foreground)",
  },
  ".cm-protected": {
    backgroundColor:
      "color-mix(in oklab, var(--color-destructive) 15%, transparent)",
  },
};

/**
 * The editor follows the app colours in both themes (`S-theme`); the `dark` flag switches
 * CodeMirror's own selection colours.
 */
const sourceThemes = {
  light: EditorView.theme(sourceStyle, { dark: false }),
  dark: EditorView.theme(sourceStyle, { dark: true }),
};

/**
 * The open file beside the board: a frontmatter form on top, then styled source or rendered
 * read mode, toggled with Ctrl/⌘+E (`S-editor-core`, `S-editor-layout`).
 */
export function Editor() {
  const {
    path,
    text,
    saved,
    task,
    modes,
    error,
    edit,
    selection,
    setSelection,
    trash,
    reveal,
    revealed,
    violations,
  } = useEditorStore();
  const confirmDelete = useMenuStore((state) => state.confirmTrash);
  const setConfirmDelete = useMenuStore((state) => state.setConfirmTrash);
  const [view, setView] = useState<EditorView | null>(null);
  const isTask = useIsTask(path);
  const theme = useThemeStore((state) => state.theme);
  const pane = useRef<HTMLElement>(null);
  const dropping = useImageDrop(
    pane,
    path === null ? null : (modes[path] ?? "source"),
    view,
  );
  const staleFlags = useStaleFlagsOf(path);
  const pasteImages = useEditorStore((state) => state.pasteImages);

  // A line asked for by `open` (the spec view, for example) is shown once the source view has
  // the text; CodeMirror takes a new value in its own effect, which runs before this one.
  useEffect(() => {
    if (reveal === null || view === null || !view.dom.isConnected) return;
    revealLine(view, reveal);
    revealed();
  }, [reveal, view, revealed]);

  // Refused entries are marked until a check finds none; each check sets them anew, so a
  // mark moved by a replaced text is corrected with the next autosave (`S-decisions`).
  useEffect(() => {
    if (view === null || !view.dom.isConnected) return;
    view.dispatch({
      effects: setProtectedLines.of(protectedLinesOf(violations)),
    });
  }, [view, violations]);

  if (path === null) return null;
  const mode = modes[path] ?? "source";
  const unsaved = text !== saved;

  // An image on the clipboard goes in like a drop: at the source cursor, in read mode at the
  // end. A paste with text is left to the field or editor it lands in.
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = pastedFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    const source = mode === "source" && view !== null && view.dom.isConnected;
    void pasteImages(files, source ? view.state.selection.main.head : null);
  };

  return (
    <section
      ref={pane}
      onPaste={onPaste}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        dropping && "ring-2 ring-primary ring-inset",
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={path}>
          {fileNameOf(path)}
        </h2>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-xs",
            unsaved ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              unsaved ? "bg-attention" : "bg-muted-foreground/40",
            )}
          />
          {unsaved ? "Unsaved" : "Saved"}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <StaleBadges flags={staleFlags} />
        </span>
        <span className="ml-auto" />
        <Button
          variant="ghost"
          size="xs"
          disabled={selection.trim() === ""}
          onClick={() => runCommand("editor.make-task")}
          title="Select text first; the task goes to the first column"
        >
          Make task
        </Button>
        <fieldset
          className="flex shrink-0 rounded-md border bg-background p-0.5 text-xs"
          title="Ctrl/⌘+E"
        >
          <legend className="sr-only">Mode</legend>
          {(["source", "read"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => {
                if (mode !== option) runCommand("editor.toggle-mode");
              }}
              className={cn(
                "rounded-sm px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === option
                  ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "source" ? "Source" : "Read"}
            </button>
          ))}
        </fieldset>
        {isTask && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => runCommand("editor.delete")}
            title="Moves the file to the trash"
          >
            Delete
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close file"
          title="Close file"
          onClick={() => runCommand("editor.close")}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </header>
      <div className="flex shrink-0 flex-col gap-2 px-4 pt-2 empty:hidden">
        {confirmDelete === path && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-xs"
          >
            <span className="flex-1">
              Move {fileNameOf(path)} to the trash? It can be restored from
              there.
            </span>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => {
                setConfirmDelete(null);
                void trash();
              }}
            >
              Move to trash
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <ConflictBar />
        <AppendOnlyBar />
        <ProposalUndo />
        <PromptBar path={path} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {task && frontmatterLineCount(text) > 0 && (
          <FrontmatterForm key={path} />
        )}
        {mode === "source" ? (
          <CodeMirror
            value={text}
            onChange={edit}
            onCreateEditor={setView}
            theme={sourceThemes[theme]}
            onUpdate={(update) => {
              if (update.selectionSet) setSelection(selectedText(update));
            }}
            extensions={sourceExtensions}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            className="min-h-0 flex-1 text-sm"
          />
        ) : (
          <ReadView text={text} />
        )}
      </div>
      <Backlinks />
    </section>
  );
}

/**
 * What to do when unsaved edits meet a change on disk, and the way back after a reload
 * replaced edits (`S-conflicts`).
 */
function ConflictBar() {
  const {
    conflict,
    replaced,
    reload,
    keepMine,
    restoreFile,
    discard,
    restoreReplaced,
    dismissReplaced,
  } = useEditorStore();
  if (conflict?.kind === "changed")
    return (
      <Notice message="Changed on disk. Your edits are kept and not saved until you choose.">
        <Button size="xs" onClick={() => void reload()}>
          Reload
        </Button>
        <Button variant="outline" size="xs" onClick={() => void keepMine()}>
          Keep mine
        </Button>
      </Notice>
    );
  if (conflict?.kind === "removed")
    return (
      <Notice message="Removed from disk. Your edits are only in the editor.">
        <Button size="xs" onClick={() => void restoreFile()}>
          Restore file
        </Button>
        <Button variant="outline" size="xs" onClick={discard}>
          Discard edits
        </Button>
      </Notice>
    );
  if (replaced !== null)
    return (
      <Notice message="Reloaded from disk; your edits were replaced.">
        <Button variant="outline" size="xs" onClick={restoreReplaced}>
          Restore my edits
        </Button>
        <Button variant="ghost" size="xs" onClick={dismissReplaced}>
          Dismiss
        </Button>
      </Notice>
    );
  return null;
}

/**
 * Why edits of a question or decision are not saved, entry by entry (`S-decisions`,
 * `R-append-only`). Undoing them keeps them restorable, as a reload does.
 */
function AppendOnlyBar() {
  const { violations, conflict, reload } = useEditorStore();
  if (violations.length === 0 || conflict !== null) return null;
  return (
    <Notice message={APPEND_ONLY_EXPLANATION}>
      <Button
        variant="outline"
        size="xs"
        onClick={() => void reload()}
        title="Back to the saved text; Restore my edits brings them back"
      >
        Undo my edits
      </Button>
      <ul className="w-full list-disc pl-4">
        {violations.map((violation) => (
          <li key={`${violation.at.line}:${violation.message}`}>
            {violationText(violation)}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

function Notice({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-md border border-attention/40 bg-attention-surface px-3 py-1.5 text-xs"
    >
      <span className="flex-1">{message}</span>
      {children}
    </div>
  );
}

/** The path of the open file relative to the repository when it is a task, else `null`. */
function useTaskPath(path: string | null): string | null {
  const { repoRoot, config } = useBoardStore();
  if (path === null || repoRoot === null || config === null) return null;
  return taskPathOf(path, repoRoot, config.planning_root, config.columns);
}

function useIsTask(path: string | null): boolean {
  return useTaskPath(path) !== null;
}

/**
 * Prompts for the open task or the braindump, copied to the clipboard (`S-prompts`); hidden
 * for other files.
 */
function PromptBar({ path }: { path: string }) {
  const { repoRoot, config } = useBoardStore();
  if (repoRoot === null || config === null) return null;
  const offered = editorPromptsOf(
    path,
    repoRoot,
    config.planning_root,
    config.columns,
  );
  if (offered === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">Copy prompt</span>
      {offered.prompts.map((prompt) => (
        <Button
          key={prompt}
          variant="secondary"
          size="xs"
          onClick={() => runCommand(`prompt.${prompt}`)}
        >
          {PROMPT_LABELS[prompt]}
        </Button>
      ))}
    </div>
  );
}

/**
 * Files dragged from the OS onto the editor pane are added as images (`S-images`). Tauri
 * delivers OS drops as webview events with file paths; the DOM gets no files. In source mode
 * the links go where the pointer is, over the form at the cursor; in read mode at the end.
 * Returns whether files are dragged over the pane.
 */
function useImageDrop(
  pane: RefObject<HTMLElement | null>,
  mode: "source" | "read" | null,
  view: EditorView | null,
): boolean {
  const dropImages = useEditorStore((state) => state.dropImages);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (mode === null) return;
    const hit = (position: { x: number; y: number }) => {
      const point = dropPoint(position, window.devicePixelRatio);
      const target = document.elementFromPoint(point.x, point.y);
      return {
        point,
        target,
        inside: !!target && !!pane.current?.contains(target),
      };
    };
    let unlisten: (() => void) | undefined;
    let active = true;
    const listening = (() => {
      try {
        return getCurrentWebview().onDragDropEvent(({ payload }) => {
          if (payload.type === "leave") return setOver(false);
          const { point, target, inside } = hit(payload.position);
          if (payload.type !== "drop") return setOver(inside);
          setOver(false);
          if (!inside) return;
          const source =
            mode === "source" && view !== null && view.dom.isConnected;
          const at = !source
            ? null
            : target && view.dom.contains(target)
              ? view.posAtCoords(point, false)
              : view.state.selection.main.head;
          void dropImages(payload.paths, at);
        });
      } catch {
        // Outside Tauri, such as in a plain browser, there are no drop events.
        return Promise.resolve(() => {});
      }
    })();
    void listening.then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [pane, mode, view, dropImages]);

  return over;
}

/** Puts the cursor at the start of `line` (1-based) and scrolls it to the top. */
function revealLine(view: EditorView, line: number) {
  const { doc } = view.state;
  const at = doc.line(clampLine(line, doc.lines)).from;
  view.dispatch({
    selection: { anchor: at },
    effects: EditorView.scrollIntoView(at, { y: "start", yMargin: 16 }),
  });
  view.focus();
}

/** The text of every selected range, one per line. */
function selectedText(update: ViewUpdate): string {
  const { state } = update;
  return state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.sliceDoc(range.from, range.to))
    .join("\n");
}

/** The frontmatter fields of the open file; a field is written when it loses focus. */
function FrontmatterForm() {
  const task = useEditorStore((state) => state.task);
  if (task === null) return null;
  return (
    <form
      className="grid max-w-[70ch] grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded-md border bg-background px-3 py-2 text-xs"
      onSubmit={(event) => event.preventDefault()}
    >
      <span className="text-muted-foreground">Id</span>
      <span className="code-id">{task.id ?? "none"}</span>
      {FORM_FIELDS.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={formValue(task, field)}
        />
      ))}
      {task.issues.length > 0 && (
        <ul className="col-span-2 text-destructive">
          {task.issues.map((issue) => (
            <li key={`${issue.key}:${issue.message}`}>
              {issue.key && <code>{issue.key}</code>} {issue.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function FieldInput({ field, value }: { field: FormField; value: string }) {
  const setField = useEditorStore((state) => state.setField);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  // Edits in the source show up in the form.
  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    if (draft === value) return setProblem(null);
    setProblem(await setField(field, draft));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void commit();
    if (event.key === "Escape") {
      setDraft(value);
      setProblem(null);
    }
  };

  return (
    <>
      <label htmlFor={id} className="text-muted-foreground">
        {field.label}
      </label>
      <div className="flex flex-col">
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          placeholder={field.kind === "list" ? "comma separated" : undefined}
          className={cn(
            "h-6 rounded-sm border bg-card px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            problem && "border-destructive",
          )}
        />
        {problem && <span className="text-destructive">{problem}</span>}
      </div>
    </>
  );
}

const NO_TERMS: GlossaryTerm[] = [];

/** The body rendered with GFM, glossary hovers, local images and Mermaid diagrams. */
function ReadView({ text }: { text: string }) {
  const setSelection = useEditorStore((state) => state.setSelection);
  const glossary = useSpecStore((state) => state.spec?.glossary ?? NO_TERMS);
  // The rendered text of the selection, read when the mouse or a key is released.
  const readSelection = () =>
    setSelection(window.getSelection()?.toString() ?? "");
  return (
    // Focusable on click, so a paste in read mode reaches the pane.
    <article
      tabIndex={-1}
      className="markdown-read text-sm outline-none"
      onMouseUp={readSelection}
      onKeyUp={readSelection}
    >
      <Markdown
        remarkPlugins={[remarkGfm, [remarkGlossary, { terms: glossary }]]}
        components={{
          img: LocalImage,
          a: Link,
          pre: CodeBlock,
          blockquote: ProposalQuote,
        }}
      >
        {bodyOf(text)}
      </Markdown>
    </article>
  );
}

/** Markdown links never navigate the window: links to files open them in the editor. */
function Link({ href, children }: ComponentProps<"a">) {
  const { path, repoRoot, open } = useEditorStore();
  const target = path && href ? resolveLink(path, href) : null;
  return (
    <a
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        if (target && repoRoot) void open(repoRoot, target);
      }}
    >
      {children}
    </a>
  );
}

type ImageState =
  | { kind: "shown"; url: string }
  | { kind: "missing" }
  | { kind: "refused"; reason: string };

/**
 * An image from the repository, read through Rust; a missing or refused one is a badge in the
 * line instead (`S-images`).
 */
function LocalImage({ src, alt }: ComponentProps<"img">) {
  const { path, repoRoot } = useEditorStore();
  const [image, setImage] = useState<ImageState>();

  useEffect(() => {
    if (!path || !repoRoot || typeof src !== "string") return;
    let current = true;
    void commands.readImage(repoRoot, path, src).then((result) => {
      if (current)
        setImage(
          result.status === "ok"
            ? result.data
            : { kind: "refused", reason: result.error },
        );
    });
    return () => {
      current = false;
    };
  }, [path, repoRoot, src]);

  if (image === undefined) return null;
  if (image.kind === "shown")
    return (
      <img
        src={image.url}
        alt={alt}
        onError={() =>
          setImage({
            kind: "refused",
            reason: "the file is not a readable image",
          })
        }
      />
    );
  const badge = imageBadge(alt, src, image);
  return (
    <span
      role="img"
      aria-label={badge.label}
      title={badge.title}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 align-middle text-xs text-muted-foreground"
    >
      <ImageOff className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{badge.label}</span>
    </span>
  );
}

/** Fenced code; `mermaid` blocks are drawn as diagrams. */
function CodeBlock({
  node,
  children,
  ...props
}: ComponentProps<"pre"> & {
  node?: { children?: unknown[] };
}) {
  const code = node?.children?.[0] as
    | {
        properties?: { className?: unknown };
        children?: { value?: string }[];
      }
    | undefined;
  const classes = code?.properties?.className;
  const isMermaid =
    Array.isArray(classes) && classes.includes("language-mermaid");
  if (isMermaid) return <Mermaid source={code?.children?.[0]?.value ?? ""} />;
  return <pre {...props}>{children}</pre>;
}

let mermaidCount = 0;

function Mermaid({ source }: { source: string }) {
  const theme = useThemeStore((state) => state.theme);
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: theme === "dark" ? "dark" : "default",
      });
      try {
        mermaidCount += 1;
        const { svg } = await mermaid.render(`mermaid-${mermaidCount}`, source);
        if (current) {
          setSvg(svg);
          setError(undefined);
        }
      } catch (err) {
        if (current) setError(String(err));
      }
    })();
    return () => {
      current = false;
    };
  }, [source, theme]);

  if (error)
    return (
      <pre className="text-destructive">
        Mermaid: {error}
        {"\n\n"}
        {source}
      </pre>
    );
  return (
    <div
      className="mermaid"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid sanitizes the SVG with `securityLevel: "strict"`.
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
