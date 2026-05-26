import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The recentActions → causal loop lives inline in the edge worker
// (decision-context-build/index.ts) and is not separately importable into
// vitest. We assert the source-level invariant directly: the worker must
// keep Ads mutations + rule_id as causal candidates but must NOT label
// operator action_items as "Tidigare åtgärd: …" causal candidates.
const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/decision-context-build/index.ts"),
  "utf8",
);

describe("assembleCausalCandidates — recentActions de-classified", () => {
  it("does NOT emit operator action items as causal candidates", () => {
    expect(SRC.includes("Tidigare åtgärd")).toBe(false);
  });

  it("keeps Ads mutations and rule_id as causal candidates", () => {
    expect(SRC.includes("Annonsändring:")).toBe(true);
    expect(SRC.includes("Regel utlöste förslag")).toBe(true);
  });
});
