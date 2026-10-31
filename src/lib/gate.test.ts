import { describe, expect, it } from "vitest";
import { gateChecks } from "./gate";

describe("gateChecks", () => {
  it("names the enabled checks in config order", () => {
    expect(
      gateChecks({
        no_open_blocking_questions: true,
        nodes_ticked_and_specified: false,
        rules_referenced: true,
      }),
    ).toEqual([
      "No open blocking questions",
      "Every rule referenced by a node",
    ]);
  });

  it("is empty when every check is off", () => {
    expect(
      gateChecks({
        no_open_blocking_questions: false,
        nodes_ticked_and_specified: false,
        rules_referenced: false,
      }),
    ).toEqual([]);
  });
});
