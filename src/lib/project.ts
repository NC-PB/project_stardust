import type {
  ChangeBatch,
  Config,
  ConfigReport_Serialize,
  InitReport,
  MoveLinks,
} from "@/bindings";

/** What the project panel shows: no repository chosen, one without a config, or a project. */
export type ProjectStatus = "none" | "needs-init" | "ready";

/** Something init offers to add to the repository (`S-init`). */
export type Offer = "gitignore" | "planner-block";

export function projectStatus(
  repoRoot: string | null,
  config: ConfigReport_Serialize | null,
): ProjectStatus {
  if (repoRoot === null || config === null) return "none";
  return config.found ? "ready" : "needs-init";
}

/** The offers an init report makes, in the order they are shown. */
export function offersOf(report: InitReport): Offer[] {
  const offers: Offer[] = [];
  if (report.offer_gitignore) offers.push("gitignore");
  if (report.offer_planner_block) offers.push("planner-block");
  return offers;
}

export function offerLabel(offer: Offer, config: Config): string {
  switch (offer) {
    case "gitignore":
      return `Add ${config.images_root.replace(/\/+$/, "")}/ to .gitignore`;
    case "planner-block":
      return `Add the planner block to ${config.agents_file}`;
  }
}

/** One line about a burst of changes on disk, such as "2 created, 1 moved, config changed". */
export function describeBatch(batch: ChangeBatch): string {
  const counts = new Map<string, number>();
  for (const change of batch.changes) {
    counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1);
  }
  const parts = ["created", "modified", "moved", "removed"]
    .filter((kind) => counts.has(kind))
    .map((kind) => `${counts.get(kind)} ${kind}`);
  if (batch.config_changed) parts.push("config changed");
  return parts.join(", ");
}

/**
 * One line about the links rewritten after files moved (`S-links`), such as "Links rewritten
 * in 2 files: a.md, b.md", or `null` when none were.
 */
export function describeLinks(links: MoveLinks): string | null {
  const files = links.rewritten.map((file) => file.file);
  if (files.length === 0) return null;
  const count = files.length === 1 ? "1 file" : `${files.length} files`;
  return `Links rewritten in ${count}: ${files.join(", ")}`;
}

/** Whether a link report has anything to show. */
export function hasLinkNotice(links: MoveLinks): boolean {
  return links.rewritten.length > 0 || links.problems.length > 0;
}
