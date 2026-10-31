import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import {
  type GlossaryEntry,
  glossaryMatcher,
  pluralOf,
  remarkGlossary,
} from "./glossary";

const terms: GlossaryEntry[] = [
  { term: "Column", definition: "a folder" },
  { term: "Terminal column", definition: "the finished column" },
  { term: "Planning root", definition: "the planning folder" },
  { term: "Task", definition: "one unit of work" },
];

const render = (markdown: string, entries: GlossaryEntry[] = terms) =>
  renderToStaticMarkup(
    createElement(
      Markdown,
      { remarkPlugins: [remarkGfm, [remarkGlossary, { terms: entries }]] },
      markdown,
    ),
  );

const abbr = (text: string, term: string, definition: string) =>
  `<abbr title="${term}: ${definition}" class="glossary-term" tabindex="0" data-definition="${term}: ${definition}">${text}</abbr>`;

describe("remarkGlossary", () => {
  it("marks a term with its definition as hover text", () => {
    expect(render("Each task is a file.")).toBe(
      `<p>Each ${abbr("task", "Task", "one unit of work")} is a file.</p>`,
    );
  });

  it("marks the first occurrence per paragraph only", () => {
    expect(render("Task one, task two.\n\nTask three.")).toBe(
      `<p>${abbr("Task", "Task", "one unit of work")} one, task two.</p>\n` +
        `<p>${abbr("Task", "Task", "one unit of work")} three.</p>`,
    );
  });

  it("matches whole words only", () => {
    expect(render("Multitask and task_x and taskss.")).toBe(
      "<p>Multitask and task_x and taskss.</p>",
    );
  });

  it("marks simple plurals as the term", () => {
    expect(render("Tasks in columns.")).toBe(
      `<p>${abbr("Tasks", "Task", "one unit of work")} in ${abbr("columns", "Column", "a folder")}.</p>`,
    );
  });

  it("makes the last word of a multi-word term plural", () => {
    expect(render("Two planning roots, terminal columns.")).toBe(
      `<p>Two ${abbr("planning roots", "Planning root", "the planning folder")}, ${abbr("terminal columns", "Terminal column", "the finished column")}.</p>`,
    );
  });

  it("counts a plural and its singular as one term per paragraph", () => {
    expect(render("Tasks and a task.")).toBe(
      `<p>${abbr("Tasks", "Task", "one unit of work")} and a task.</p>`,
    );
  });

  it("keeps a plural that is a term of its own", () => {
    expect(
      render("Notes and a note.", [
        { term: "Note", definition: "one" },
        { term: "Notes", definition: "many" },
      ]),
    ).toBe(
      `<p>${abbr("Notes", "Notes", "many")} and a ${abbr("note", "Note", "one")}.</p>`,
    );
  });

  it("prefers longer terms over shorter ones inside them", () => {
    expect(render("The terminal column is a column.")).toBe(
      `<p>The ${abbr("terminal column", "Terminal column", "the finished column")} is a ${abbr("column", "Column", "a folder")}.</p>`,
    );
  });

  it("matches multi-word terms across a line break", () => {
    expect(render("Under the planning\nroot.")).toBe(
      `<p>Under the ${abbr("planning\nroot", "Planning root", "the planning folder")}.</p>`,
    );
  });

  it("marks inside emphasis and list items, counting the whole paragraph", () => {
    expect(render("- *Task* and task\n- a task")).toBe(
      "<ul>\n" +
        `<li><em>${abbr("Task", "Task", "one unit of work")}</em> and task</li>\n` +
        `<li>a ${abbr("task", "Task", "one unit of work")}</li>\n` +
        "</ul>",
    );
  });

  it("skips headings, code and links", () => {
    expect(render("# Task\n\n`task` [task](a.md)\n\n```\ntask\n```")).toBe(
      '<h1>Task</h1>\n<p><code>task</code> <a href="a.md">task</a></p>\n' +
        "<pre><code>task\n</code></pre>",
    );
  });

  it("leaves the text alone without terms", () => {
    expect(render("A task.", [])).toBe("<p>A task.</p>");
  });
});

describe("pluralOf", () => {
  it("adds s, es or ies", () => {
    expect(pluralOf("task")).toBe("tasks");
    expect(pluralOf("status")).toBe("statuses");
    expect(pluralOf("box")).toBe("boxes");
    expect(pluralOf("branch")).toBe("branches");
    expect(pluralOf("summary")).toBe("summaries");
    expect(pluralOf("key")).toBe("keys");
    expect(pluralOf("planning root")).toBe("planning roots");
  });

  it("has none when the term does not end in a letter", () => {
    expect(pluralOf("c++ (old)")).toBeNull();
    expect(pluralOf("phase 1")).toBeNull();
  });
});

describe("glossaryMatcher", () => {
  it("keeps the first definition of a term", () => {
    const matcher = glossaryMatcher([
      { term: "Task", definition: "first" },
      { term: "task", definition: "second" },
    ]);
    expect(matcher?.entries.get("task")?.definition).toBe("first");
  });

  it("escapes characters special in patterns", () => {
    const matcher = glossaryMatcher([{ term: "C++ (old)", definition: "x" }]);
    expect("use C++ (old) here".match(matcher?.pattern ?? /$^/)?.[0]).toBe(
      "C++ (old)",
    );
  });
});
