import { useMemo } from "react";
import type { SourceLine } from "@/bindings";
import { Button } from "@/components/ui/button";
import {
  answerProblem,
  type OpenQuestion,
  openQuestions,
} from "@/lib/questions";
import { sourceLabel } from "@/lib/spec-view";
import { useQuestionsStore } from "@/stores/questions-store";
import { useSpecStore } from "@/stores/spec-store";

interface QuestionsFormProps {
  /** Opens the spec in the editor at a question or node. */
  onOpen: (at: SourceLine) => void;
}

/**
 * The Questions form (`S-questions`): every open question, blocking ones first, with the nodes
 * it blocks and an answer field. Save appends the answer with today's date and moves the entry
 * to Answered in the spec file (`R-append-only`); the spec view follows from the watcher batch.
 */
export function QuestionsForm({ onOpen }: QuestionsFormProps) {
  const spec = useSpecStore((state) => state.spec);
  const answered = useQuestionsStore((state) => state.answered);
  const questions = useMemo(
    () =>
      spec === null
        ? []
        : openQuestions(spec).filter(
            (entry) =>
              !entry.question.id || !answered.includes(entry.question.id),
          ),
    [spec, answered],
  );

  return (
    <section aria-label="Open questions" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Open questions</h3>
      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No open questions.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {questions.map((entry) => (
            <QuestionItem
              key={sourceLabel(entry.question.at)}
              entry={entry}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionItem({
  entry,
  onOpen,
}: {
  entry: OpenQuestion;
  onOpen: (at: SourceLine) => void;
}) {
  const { question, blocking, nodes } = entry;
  const id = question.id ?? null;
  const draft = useQuestionsStore((state) =>
    id === null ? "" : (state.drafts[id] ?? ""),
  );
  const error = useQuestionsStore((state) =>
    id === null ? null : (state.errors[id] ?? null),
  );
  const saving = useQuestionsStore((state) => state.saving);
  const setDraft = useQuestionsStore((state) => state.setDraft);
  const save = useQuestionsStore((state) => state.save);
  const problem = answerProblem(draft);
  const fieldId = `answer-${id ?? sourceLabel(question.at)}`;

  return (
    <li className="flex flex-col gap-1 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-1.5">
        {blocking && (
          <span className="rounded bg-destructive/10 px-1 text-xs font-medium text-destructive">
            blocking
          </span>
        )}
        <button
          type="button"
          className="text-left hover:underline"
          title={`Open ${sourceLabel(question.at)}`}
          onClick={() => onOpen(question.at)}
        >
          {question.question}
        </button>
        {id !== null && (
          <code className="text-xs text-muted-foreground">{id}</code>
        )}
      </div>
      {nodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{blocking ? "Blocks" : "Concerns"}</span>
          {nodes.map((node) => {
            const at = node.at;
            const label = node.title
              ? `${node.title}${node.id ? ` (${node.id})` : ""}`
              : (node.id ?? "");
            return at === null ? (
              <span key={label} title="No node with this id in the Structure">
                {label}
              </span>
            ) : (
              <button
                key={sourceLabel(at)}
                type="button"
                className="rounded bg-muted px-1 hover:underline"
                title={`Open ${sourceLabel(at)}`}
                onClick={() => onOpen(at)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {id === null ? (
        <p className="text-xs text-destructive">
          This question has no Q- id; answer it in the editor.
        </p>
      ) : (
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(id);
          }}
        >
          <label htmlFor={fieldId} className="sr-only">
            Answer to {id}
          </label>
          <textarea
            id={fieldId}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void save(id);
              }
            }}
            placeholder="Answer"
            className="min-w-0 flex-1 resize-y rounded-md border bg-background px-2 py-1 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={problem !== null || saving !== null}
            title={
              problem ??
              "Append the answer with today's date and move it to Answered"
            }
          >
            {saving === id ? "Saving…" : "Save"}
          </Button>
        </form>
      )}
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
