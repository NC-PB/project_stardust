/** Archive helpers (`S-archive`); the plan and the moves are made in Rust. */

import type { ArchiveMove } from "@/bindings";

/** The moves of a plan grouped by month folder, in the plan's order. */
export function movesByMonth(
  moves: ArchiveMove[],
): { month: string; moves: ArchiveMove[] }[] {
  const groups: { month: string; moves: ArchiveMove[] }[] = [];
  for (const move of moves) {
    const last = groups[groups.length - 1];
    if (last?.month === move.month) last.moves.push(move);
    else groups.push({ month: move.month, moves: [move] });
  }
  return groups;
}

/** "1 task" or "n tasks". */
export function tasksLabel(count: number): string {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}
