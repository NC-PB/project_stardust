import { cn } from "cn";
import type { Node, SourceLine, Spec } from "@/bindings";
import { FogMeter } from "@/components/fog-meter";
import { GateStatus } from "@/components/gate-status";
import { InlineMarkdown } from "@/components/inline-markdown";
import { MindMap } from "@/components/mind-map";
import { QuestionsForm } from "@/components/questions-form";
import { SpecPrompts } from "@/components/spec-prompts";
import { useStaleFlags } from "@/components/stale-flags";
import { NodeTasks, TracePanel } from "@/components/trace";
import { Button } from "@/components/ui/button";
import { VerifyAreaButton } from "@/components/verify-area-button";
import {
  clarifiedCount,
  hasDetails,
  isExpanded,
  nodeKey,
  openLabel,
  questionById,
  sourceLabel,
  specPathOf,
  tickLabel,
} from "@/lib/spec-view";
import { repoRelative } from "@/lib/staleness";
import { runCommand } from "@/stores/command-store";
import { useEditorStore } from "@/stores/editor-store";
import { useSpecStore } from "@/stores/spec-store";
import { useViewStore } from "@/stores/view-store";

/** Opens a part of the spec in the editor at its line; `null` until a project is open. */
function useOpenAt(): ((at: SourceLine) => void) | null {
  const repoRoot = useSpecStore((state) => state.repoRoot);
  const config = useSpecStore((state) => state.config);
  const open = useEditorStore((state) => state.open);
  if (repoRoot === null || config === null) return null;
  return (at) =>
    void open(
      repoRoot,
      specPathOf(repoRoot, config.planning_root, at.file),
      at.line,
    );
}

/**
 * The spec of the open project beside the editor (`S-spec-file`, `S-nodes`): its sections,
 * each opening in the editor at its heading, and the Structure as a collapsible tree. It
 * follows the spec store, which reads the spec again after watcher batches that touch it.
 */
export function SpecView() {
  const spec = useSpecStore((state) => state.spec);
  const openAt = useOpenAt();
  const mindMap = useViewStore((state) => state.mindMap);
  const questions = useViewStore((state) => state.questions);
  if (spec === null || openAt === null) return null;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold">{spec.title ?? "Spec"}</h2>
        <span className="text-xs text-muted-foreground">
          {spec.location}
          {spec.form === "folder" && " (folder form)"}
        </span>
        {spec.found && <SpecPrompts />}
        {spec.found && (
          <Button
            className="ml-auto"
            variant={questions ? "secondary" : "outline"}
            size="xs"
            aria-pressed={questions}
            onClick={() => runCommand("spec.questions")}
          >
            Questions
          </Button>
        )}
        {spec.found && (
          <Button
            variant={mindMap ? "secondary" : "outline"}
            size="xs"
            aria-pressed={mindMap}
            onClick={() => runCommand("spec.mind-map")}
          >
            Mind map
          </Button>
        )}
      </header>
      {!spec.found ? (
        <p className="text-sm text-muted-foreground">
          No spec at {spec.location}.
        </p>
      ) : (
        <>
          <ReviewFlags />
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <FogMeter onOpen={openAt} />
            <GateStatus onOpen={openAt} />
          </div>
          <SectionNav spec={spec} openAt={openAt} />
          {questions && <QuestionsForm onOpen={openAt} />}
          {mindMap ? (
            <div className="h-[28rem] shrink-0 rounded-md border">
              <MindMap onOpen={openAt} />
            </div>
          ) : (
            <StructureTree spec={spec} openAt={openAt} />
          )}
          <TracePanel openAt={openAt} />
        </>
      )}
      <IssueList spec={spec} openAt={openAt} />
    </section>
  );
}

/** One button per `## ` section; each opens its file at the heading. */
function SectionNav({
  spec,
  openAt,
}: {
  spec: Spec;
  openAt: (at: SourceLine) => void;
}) {
  return (
    <nav aria-label="Spec sections" className="flex flex-wrap gap-1">
      {spec.sections.map((section) => (
        <Button
          key={sourceLabel(section.at)}
          variant="outline"
          size="xs"
          title={`Open ${sourceLabel(section.at)}`}
          onClick={() => openAt(section.at)}
        >
          {section.heading}
        </Button>
      ))}
    </nav>
  );
}

/** The Structure: domain areas at the top, nodes below, each with its criteria. */
function StructureTree({
  spec,
  openAt,
}: {
  spec: Spec;
  openAt: (at: SourceLine) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Structure</h3>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => runCommand("spec.expand-all")}
        >
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => runCommand("spec.collapse-all")}
        >
          Collapse all
        </Button>
      </div>
      {spec.structure.length === 0 ? (
        <p className="text-xs text-muted-foreground">No nodes yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {spec.structure.map((node) => (
            <NodeItem
              key={nodeKey(node)}
              node={node}
              depth={0}
              spec={spec}
              openAt={openAt}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A node with its tick state, `#later` and blocking question; expanded, its criteria and child
 * nodes. The tick says clarified, never implemented (`R-tick-means-clear`).
 */
function NodeItem({
  node,
  depth,
  spec,
  openAt,
}: {
  node: Node;
  depth: number;
  spec: Spec;
  openAt: (at: SourceLine) => void;
}) {
  const expanded = useViewStore((state) =>
    isExpanded(state.expanded, node, depth),
  );
  const setExpanded = useViewStore((state) => state.setExpanded);
  const key = nodeKey(node);
  const expandable = hasDetails(node);
  const tick = tickLabel(node.ticked);
  const count = clarifiedCount(node.children);

  return (
    <li className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-expanded={expandable ? expanded : undefined}
          aria-label={expanded ? "Collapse" : "Expand"}
          disabled={!expandable}
          onClick={() => setExpanded(key, !expanded)}
          className="w-4 shrink-0 text-xs text-muted-foreground disabled:invisible"
        >
          {expanded ? "▾" : "▸"}
        </button>
        {tick !== null && (
          <span
            role="img"
            aria-label={tick}
            title={`${tick}. A tick means clarified, not implemented.`}
            className={cn(
              "flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none",
              node.ticked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/60",
            )}
          >
            {node.ticked && "✓"}
          </span>
        )}
        <span
          className={cn(
            depth === 0 && "font-semibold",
            node.ticked === false && "text-muted-foreground",
          )}
        >
          {node.title ? (
            <InlineMarkdown text={node.title} file={node.at.file} />
          ) : (
            "(untitled)"
          )}
        </span>
        <OpenButton at={node.at} name={node.id} openAt={openAt} />
        {node.id ? (
          <code className="rounded bg-muted px-1 text-xs">{node.id}</code>
        ) : (
          <span className="text-xs text-destructive">no id</span>
        )}
        {node.later && (
          <span className="rounded border px-1 text-xs text-muted-foreground">
            #later
          </span>
        )}
        {node.blocking_question && (
          <BlockingQuestion
            id={node.blocking_question}
            spec={spec}
            openAt={openAt}
          />
        )}
        {count.total > 0 && (
          <span className="text-xs text-muted-foreground">
            {count.clarified}/{count.total} clarified
          </span>
        )}
        {node.id && <VerifyAreaButton nodeId={node.id} />}
        <NodeTasks id={node.id} />
      </div>
      {expandable && expanded && (
        <div className="ml-5 flex flex-col gap-0.5 border-l pl-3">
          {node.criteria.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs">
              {node.criteria.map((criterion) => (
                <li
                  key={sourceLabel(criterion.at)}
                  className="flex items-start gap-1"
                >
                  <OpenButton
                    at={criterion.at}
                    name="criterion"
                    openAt={openAt}
                  />
                  <span className="whitespace-pre-line text-muted-foreground">
                    <InlineMarkdown
                      text={criterion.text}
                      file={criterion.at.file}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {node.children.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {node.children.map((child) => (
                <NodeItem
                  key={nodeKey(child)}
                  node={child}
                  depth={depth + 1}
                  spec={spec}
                  openAt={openAt}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The control that opens a row of the tree in the editor at its line. Titles and criteria are
 * text beside it, so links in them are never nested in a button (D-20261031-013555-1ofs).
 */
function OpenButton({
  at,
  name,
  openAt,
}: {
  at: SourceLine;
  name?: string | null;
  openAt: (at: SourceLine) => void;
}) {
  const label = openLabel(at, name);
  return (
    <button
      type="button"
      onClick={() => openAt(at)}
      title={label}
      aria-label={label}
      className="shrink-0 rounded px-0.5 text-xs leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      ↗
    </button>
  );
}

/** The question linked after a node's id; opens the question in the editor. */
function BlockingQuestion({
  id,
  spec,
  openAt,
}: {
  id: string;
  spec: Spec;
  openAt: (at: SourceLine) => void;
}) {
  const question = questionById(spec, id);
  if (question === null)
    return (
      <span
        className="rounded border border-destructive/50 px-1 text-xs text-destructive"
        title="This question is not in the Questions section"
      >
        {id}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => openAt(question.at)}
      title={`${question.question}\n${sourceLabel(question.at)}`}
      className={cn(
        "rounded border px-1 text-xs hover:underline",
        question.answered
          ? "text-muted-foreground"
          : "border-amber-500/50 bg-amber-500/10",
      )}
    >
      {question.answered ? "Answered" : "Blocked by"} {id}
    </button>
  );
}

/** Problems found while reading the spec, each opening at its line when it has one. */
function IssueList({
  spec,
  openAt,
}: {
  spec: Spec;
  openAt: (at: SourceLine) => void;
}) {
  if (spec.issues.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-destructive">
        {spec.issues.length} {spec.issues.length === 1 ? "issue" : "issues"} in
        the spec
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {spec.issues.map((issue) => {
          const line = issue.line ?? null;
          const where = line === null ? issue.file : `${issue.file}:${line}`;
          return (
            <li key={`${where}:${issue.message}`}>
              {line === null ? (
                <span className="text-muted-foreground">{where}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => openAt({ file: issue.file, line })}
                  className="text-muted-foreground hover:underline"
                >
                  {where}
                </button>
              )}{" "}
              {issue.message}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Spec files due for review (`S-staleness`), each opening in the editor. */
function ReviewFlags() {
  const repoRoot = useSpecStore((state) => state.repoRoot);
  const open = useEditorStore((state) => state.open);
  const flags = [...useStaleFlags().values()]
    .flat()
    .filter((flag) => flag.kind === "unreviewed-spec");
  if (repoRoot === null || flags.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs">
      {flags.map((flag) => (
        <li key={flag.path} className="flex items-center gap-2">
          <span className="font-medium text-amber-600 dark:text-amber-400">
            Review due
          </span>
          <span className="font-mono">{repoRelative(repoRoot, flag.path)}</span>
          <span className="min-w-0 flex-1">{flag.reason}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void open(repoRoot, flag.path)}
          >
            Open
          </Button>
        </li>
      ))}
    </ul>
  );
}
