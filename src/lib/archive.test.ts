import { describe, expect, it } from "vitest";
import type { ArchiveMove } from "@/bindings";
import { movesByMonth, tasksLabel } from "./archive";

const move = (file_name: string, month: string): ArchiveMove => ({
  file_name,
  id: null,
  title: file_name,
  completed: `${month}-01`,
  month,
  from: `docs/planning/done/${file_name}`,
  to: `docs/planning/done/${month}/${file_name}`,
});

describe("movesByMonth", () => {
  it("groups consecutive moves of one month and keeps the order", () => {
    const a = move("a.md", "2026-08");
    const b = move("b.md", "2026-09");
    const c = move("c.md", "2026-09");
    expect(movesByMonth([a, b, c])).toEqual([
      { month: "2026-08", moves: [a] },
      { month: "2026-09", moves: [b, c] },
    ]);
    expect(movesByMonth([])).toEqual([]);
  });
});

describe("tasksLabel", () => {
  it("counts tasks", () => {
    expect(tasksLabel(1)).toBe("1 task");
    expect(tasksLabel(3)).toBe("3 tasks");
  });
});
