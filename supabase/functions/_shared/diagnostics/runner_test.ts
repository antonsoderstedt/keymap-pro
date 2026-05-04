// Smoke-test: regelmotorn körs end-to-end mot syntetisk snapshot.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runAllRules } from "./runner.ts";
import { evaluateGates } from "./gates.ts";
import type { AccountSnapshot } from "./types.ts";

function emptyMetrics() {
  return { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, ctr: 0, avg_cpc_micros: 0 };
}

function healthySnapshot(): AccountSnapshot {
  return {
    customer_id: "1234567890",
    customer: { optimizationScore: 0.85 },
    campaigns: [{
      id: "c1",
      name: "Search – kategorier",
      status: "ENABLED",
      type: "SEARCH",
      bidding_strategy_type: "TARGET_CPA",
      target_cpa_micros: 200_000_000,
      daily_budget_micros: 350_000_000,
      is_brand: false,
      metrics_7d: { ...emptyMetrics(), clicks: 100, impressions: 2000, cost_micros: 80_000_000, conversions: 5, ctr: 0.05 },
      metrics_30d: {
        clicks: 600, impressions: 12000, cost_micros: 480_000_000, conversions: 30,
        ctr: 0.05, avg_cpc_micros: 800_000,
        search_impression_share: 0.7, search_budget_lost_is: 0.05, search_rank_lost_is: 0.25,
      },
      ad_groups: [{
        id: "ag1",
        name: "Bra grupp",
        keywords: [{
          criterion_id: "k1",
          text: "köp grej",
          match_type: "EXACT",
          quality_score: 8,
          creative_qs: "ABOVE_AVERAGE",
          landing_qs: "ABOVE_AVERAGE",
          search_predicted_ctr: "ABOVE_AVERAGE",
          metrics_30d: { clicks: 50, impressions: 1000, cost_micros: 30_000_000, conversions: 3, ctr: 0.05 },
        }],
        ads: [
          { ad_id: "a1", ad_strength: "EXCELLENT", policy_summary_status: "APPROVED" },
          { ad_id: "a2", ad_strength: "GOOD", policy_summary_status: "APPROVED" },
        ],
      }],
    }],
    conversion_actions: [],
    change_history_14d: [],
    goals: { conversion_type: "purchase", conversion_value: 500, conversion_rate_pct: 5, brand_terms: [], strategy_split: {} },
  };
}

Deno.test("healthy account: inga blockers, få diagnoser", () => {
  const snap = healthySnapshot();
  const { blockers, campaignGates } = evaluateGates(snap);
  assertEquals(blockers.length, 0);
  const { diagnoses } = runAllRules(snap, campaignGates);
  // Får inte trigga någon kritisk regel
  assert(diagnoses.every((d) => d.severity !== "critical"), "ingen kritisk diagnos i healthy");
});

Deno.test("trasig spårning → TRACKING blocker", () => {
  const snap = healthySnapshot();
  snap.campaigns[0].metrics_30d.conversions = 0;
  snap.campaigns[0].metrics_30d.clicks = 600;
  const { blockers } = evaluateGates(snap);
  assertEquals(blockers.length, 1);
  assertEquals(blockers[0].gate, "TRACKING");
});

Deno.test("budget lost >30% → daily_budget_starved firar", () => {
  const snap = healthySnapshot();
  snap.campaigns[0].metrics_30d.search_budget_lost_is = 0.45;
  const { campaignGates } = evaluateGates(snap);
  const { diagnoses } = runAllRules(snap, campaignGates);
  assert(diagnoses.some((d) => d.rule_id === "daily_budget_starved"), "daily_budget_starved ska fira");
});

Deno.test("manual CPC + 30 konv → manual_cpc_with_data firar", () => {
  const snap = healthySnapshot();
  snap.campaigns[0].bidding_strategy_type = "MANUAL_CPC";
  const { campaignGates } = evaluateGates(snap);
  const { diagnoses } = runAllRules(snap, campaignGates);
  assert(diagnoses.some((d) => d.rule_id === "manual_cpc_with_data"));
});

Deno.test("CPA långt under target + budget lost → target_cpa_strangling", () => {
  const snap = healthySnapshot();
  // CPA = 480_000_000 micros / 30 = 16_000_000 micros = 16 SEK (target 200 SEK)
  snap.campaigns[0].metrics_30d.search_budget_lost_is = 0.20;
  const { campaignGates } = evaluateGates(snap);
  const { diagnoses } = runAllRules(snap, campaignGates);
  assert(diagnoses.some((d) => d.rule_id === "target_cpa_strangling"));
});

Deno.test("brand-kampanj på TARGET_CPA → brand_wrong_strategy", () => {
  const snap = healthySnapshot();
  snap.campaigns[0].is_brand = true;
  const { campaignGates } = evaluateGates(snap);
  const { diagnoses } = runAllRules(snap, campaignGates);
  assert(diagnoses.some((d) => d.rule_id === "brand_wrong_strategy"));
});
