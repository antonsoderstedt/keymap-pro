import { describe, it, expect } from "vitest";
import { groupItemsBy, sumImpact, type PipelineItem } from "@/lib/actionsPipeline";

function make(partial: Partial<PipelineItem>): PipelineItem {
  return {
    id: partial.id ?? "x",
    rawId: partial.rawId ?? "raw",
    origin: partial.origin ?? "ads_proposal",
    stage: partial.stage ?? "proposed",
    title: partial.title ?? "t",
    description: null,
    category: partial.category ?? "ads",
    impactSek: partial.impactSek ?? null,
    createdAt: "2026-01-01",
    raw: {} as any,
    flags: {},
    ruleId: partial.ruleId ?? null,
    actionType: partial.actionType ?? "pause_keyword",
  };
}

describe("groupItemsBy", () => {
  it("returns empty object for empty input", () => {
    expect(groupItemsBy([], "rule_id")).toEqual({});
  });

  it("groups items by rule_id (2 same + 1 unique → 2 groups)", () => {
    const items = [
      make({ id: "1", ruleId: "ads_wasted" }),
      make({ id: "2", ruleId: "ads_wasted" }),
      make({ id: "3", ruleId: "negative_keyword_candidate" }),
    ];
    const groups = groupItemsBy(items, "rule_id");
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["ads_wasted"]).toHaveLength(2);
    expect(groups["negative_keyword_candidate"]).toHaveLength(1);
  });

  it("groups same rule_id but different action_type into different action_type groups", () => {
    const items = [
      make({ id: "1", ruleId: "r", actionType: "pause_keyword" }),
      make({ id: "2", ruleId: "r", actionType: "add_negative_keyword" }),
    ];
    const groups = groupItemsBy(items, "action_type");
    expect(Object.keys(groups)).toHaveLength(2);
  });
});

describe("sumImpact", () => {
  it("treats null/undefined impactSek as 0", () => {
    const items = [
      make({ impactSek: 100 }),
      make({ impactSek: null }),
      make({ impactSek: 50 }),
    ];
    expect(sumImpact(items)).toBe(150);
  });

  it("returns 0 for empty array", () => {
    expect(sumImpact([])).toBe(0);
  });
});
