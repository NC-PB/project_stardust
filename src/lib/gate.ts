import type { GateConfig } from "@/bindings";

/** The checks the `gate` keys of the config turn on (`S-gate`), as the gate status names them. */
export function gateChecks(gate: GateConfig): string[] {
  const checks: string[] = [];
  if (gate.no_open_blocking_questions)
    checks.push("No open blocking questions");
  if (gate.nodes_ticked_and_specified)
    checks.push("Every node ticked and with criteria");
  if (gate.rules_referenced) checks.push("Every rule referenced by a node");
  return checks;
}
