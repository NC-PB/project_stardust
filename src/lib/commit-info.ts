/** Commit info on cards (`S-commit-info`); the commits are counted in Rust from `git log`. */

import type { TaskCommits } from "@/bindings";

/** The commit info of each task id; empty when git could not be read. */
export function commitsById(
  info: { available: boolean; tasks: TaskCommits[] } | null,
): Map<string, TaskCommits> {
  if (info === null || !info.available) return new Map();
  return new Map(info.tasks.map((task) => [task.id, task]));
}

/** What a card shows for its commits, or `null` when no commit mentions it. */
export function commitLabel(
  commits: TaskCommits | undefined,
): { label: string; title: string } | null {
  if (commits === undefined || commits.count === 0) return null;
  const noun = commits.count === 1 ? "commit" : "commits";
  return {
    label: `${commits.count} ${noun} · ${commits.last}`,
    title: `${commits.count} ${noun} mention ${commits.id}, the last on ${commits.last}. Information only: a mention does not move the task.`,
  };
}
