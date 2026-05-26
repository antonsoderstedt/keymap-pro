import { describe, it, expect } from "vitest";
import {
  deriveCampaignHealth,
  summarizeOutcomes,
  pickTopCampaignsByBudget,
} from "@/lib/accountIntelligence";

describe("deriveCampaignHealth", () => {
  it("returns 'unknown' when cost < 100 SEK", () => {
    expect(
      deriveCampaignHealth({ metrics_30d: { cost_sek: 50, roas: 0.5 }, target_roas: 2 }),
    ).toBe("unknown");
  });
  it("returns 'good' when roas >= target_roas", () => {
    expect(
      deriveCampaignHealth({ metrics_30d: { cost_sek: 5000, roas: 3 }, target_roas: 2 }),
    ).toBe("good");
  });
  it("returns 'bad' when roas < target_roas", () => {
    expect(
      deriveCampaignHealth({ metrics_30d: { cost_sek: 5000, roas: 1 }, target_roas: 2 }),
    ).toBe("bad");
  });
  it("returns 'good' when cpa <= target_cpa", () => {
    expect(
      deriveCampaignHealth({
        metrics_30d: { cost_sek: 5000, cpa_sek: 50 },
        target_cpa_sek: 100,
      }),
    ).toBe("good");
  });
  it("returns 'warn' when no target set but has spend", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 5000 } })).toBe("warn");
  });
});

describe("summarizeOutcomes", () => {
  it("counts only outcomes within window", () => {
    const now = Date.now();
    const outcomes = [
      {
        applied_at: new Date(now - 5 * 86400000).toISOString(),
        measured_14d: { delta_pct: { conversions: 10 } },
      },
      {
        applied_at: new Date(now - 40 * 86400000).toISOString(),
        measured_14d: { delta_pct: { conversions: 10 } },
      },
    ];
    const r = summarizeOutcomes(outcomes, 30);
    expect(r.applied).toBe(1);
    expect(r.measured).toBe(1);
    expect(r.positive).toBe(1);
  });
  it("counts auto-reverted", () => {
    const now = Date.now();
    const outcomes = [
      {
        applied_at: new Date(now - 1 * 86400000).toISOString(),
        auto_reverted_at: new Date().toISOString(),
      },
    ];
    expect(summarizeOutcomes(outcomes, 30).autoReverted).toBe(1);
  });
  it("falls back to measured_7d when 14d saknas", () => {
    const now = Date.now();
    const r = summarizeOutcomes(
      [
        {
          applied_at: new Date(now - 2 * 86400000).toISOString(),
          measured_7d: { delta_pct: { conversions: -5 } },
        },
      ],
      30,
    );
    expect(r.measured).toBe(1);
    expect(r.negative).toBe(1);
  });
});

describe("pickTopCampaignsByBudget", () => {
  it("returns top N and remainder", () => {
    const campaigns = [
      { name: "A", daily_budget_sek: 100 },
      { name: "B", daily_budget_sek: 50 },
      { name: "C", daily_budget_sek: 30 },
      { name: "D", daily_budget_sek: 20 },
    ];
    const r = pickTopCampaignsByBudget(campaigns, 2);
    expect(r.top.map((c) => c.name)).toEqual(["A", "B"]);
    expect(r.otherTotal).toBe(50);
  });
});
