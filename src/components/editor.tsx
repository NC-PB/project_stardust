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
import CodeMirror from "@uiw/react-codemirror";
import { cn } from "cn";
import {
  type ComponentProps,
  type KeyboardEvent,
  useEffect,
  useId,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import {
  bodyOf,
  FORM_FIELDS,
  type FormField,
  fileNameOf,
  formValue,
  frontmatterLineCount,
  isShortcut,
  resolveLink,
} from "@/lib/editor";
import { useEditorStore } from "@/stores/editor-store";

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
    fontFamily: "ui-monospace, monospace",
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
  EditorView.lineWrapping,
  EditorView.theme({
    "&": { backgroundColor: "transparent", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { fontFamily: "var(--font-sans)", padding: "8px 0" },
    ".cm-frontmatter": {
      fontFamily: "ui-monospace, monospace",
      fontSize: "0.85em",
      backgroundColor: "var(--color-muted)",
      color: "var(--color-muted-foreground)",
    },
  }),
];

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
    save,
    close,
    toggleMode,
  } = useEditorStore();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (isShortcut(event, "s")) {
        event.preventDefault();
        void save();
      } else if (isShortcut(event, "e")) {
        event.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, toggleMode]);

  if (path === null) return null;
  const mode = modes[path] ?? "source";
  const unsaved = text !== saved;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-lg border p-2">
      <header className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {fileNameOf(path)}
        </h2>
        <span className="text-xs text-muted-foreground">
          {unsaved ? "Unsaved" : "Saved"}
        </span>
        <Button
          variant="outline"
          size="xs"
          onClick={toggleMode}
          title="Ctrl/⌘+E"
        >
          {mode === "source" ? "Read" : "Source"}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => void close()}>
          Close
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {task && frontmatterLineCount(text) > 0 && (
          <FrontmatterForm key={path} />
        )}
        {mode === "source" ? (
          <CodeMirror
            value={text}
            onChange={edit}
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
    </section>
  );
}

/** The frontmatter fields of the open file; a field is written when it loses focus. */
function FrontmatterForm() {
  const task = useEditorStore((state) => state.task);
  if (task === null) return null;
  return (
    <form
      className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 rounded-md bg-muted/50 p-2 text-xs"
      onSubmit={(event) => event.preventDefault()}
    >
      <span className="text-muted-foreground">Id</span>
      <span className="font-mono">{task.id ?? "none"}</span>
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
            "rounded border bg-background px-1.5 py-0.5",
            problem && "border-destructive",
          )}
        />
        {problem && <span className="text-destructive">{problem}</span>}
      </div>
    </>
  );
}

/** The body rendered with GFM, local images and Mermaid diagrams. */
function ReadView({ text }: { text: string }) {
  return (
    <article className="markdown-read text-sm">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ img: LocalImage, a: Link, pre: CodeBlock }}
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

/** An image from the repository, read through Rust; a missing one says why. */
function LocalImage({ src, alt }: ComponentProps<"img">) {
  const { path, repoRoot } = useEditorStore();
  const [image, setImage] = useState<{ url: string } | { error: string }>();

  useEffect(() => {
    if (!path || !repoRoot || typeof src !== "string") return;
    let current = true;
    void commands.readImage(repoRoot, path, src).then((result) => {
      if (current)
        setImage(
          result.status === "ok"
            ? { url: result.data }
            : { error: result.error },
        );
    });
    return () => {
      current = false;
    };
  }, [path, repoRoot, src]);

  if (image && "error" in image)
    return (
      <span className="rounded bg-muted px-1 text-xs text-muted-foreground">
        Image {alt ? `"${alt}" ` : ""}not shown: {image.error}
      </span>
    );
  return image ? <img src={image.url} alt={alt} /> : null;
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
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
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
  }, [source]);

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
