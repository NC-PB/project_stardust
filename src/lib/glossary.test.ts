import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import {
  type GlossaryEntry,
  glossaryMatcher,
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
  `<abbr title="${term}: ${definition}" class="glossary-term">${text}</abbr>`;

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
    expect(render("Tasks and multitask and task_x.")).toBe(
      "<p>Tasks and multitask and task_x.</p>",
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
