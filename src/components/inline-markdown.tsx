import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import {
  INLINE_ELEMENTS,
  remarkInlineOnly,
  specLinkTarget,
} from "@/lib/inline-markdown";
import { useEditorStore } from "@/stores/editor-store";
import { useSpecStore } from "@/stores/spec-store";

const PLUGINS = [remarkInlineOnly];

/**
 * A spec text such as a node title or criterion with its inline markup rendered: inline code,
 * emphasis and links, no blocks. `file` is the spec file the text is in, relative to the
 * planning root; relative `.md` links open from there in the editor.
 */
export function InlineMarkdown({ text, file }: { text: string; file: string }) {
  return (
    <Markdown
      remarkPlugins={PLUGINS}
      allowedElements={INLINE_ELEMENTS}
      unwrapDisallowed
      components={{
        code: InlineCode,
        a: ({ href, children }) => (
          <SpecLink href={href} file={file}>
            {children}
          </SpecLink>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}

function InlineCode({ children }: ComponentProps<"code">) {
  return (
    <code className="rounded bg-muted px-1 font-mono text-[0.9em]">
      {children}
    </code>
  );
}

/**
 * A link to a planning file opens it in the editor. Other links never navigate the window:
 * they show as text with the address on hover, and a click does nothing. The text around a
 * link is never a button; the row opens through its own control (D-20261031-013555-1ofs).
 */
function SpecLink({
  href,
  file,
  children,
}: ComponentProps<"a"> & { file: string }) {
  const repoRoot = useSpecStore((state) => state.repoRoot);
  const planningRoot = useSpecStore(
    (state) => state.config?.planning_root ?? null,
  );
  const open = useEditorStore((state) => state.open);
  const target =
    repoRoot !== null && planningRoot !== null && href
      ? specLinkTarget(repoRoot, planningRoot, file, href)
      : null;
  if (repoRoot === null || target === null)
    return (
      <span title={href} className="underline decoration-dotted">
        {children}
      </span>
    );
  return (
    <a
      href={href}
      title={`Open ${href}`}
      className="text-primary underline"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void open(repoRoot, target);
      }}
    >
      {children}
    </a>
  );
}
