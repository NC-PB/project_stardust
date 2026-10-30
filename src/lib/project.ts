import type { Config, ConfigReport_Serialize, InitReport } from "@/bindings";

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
