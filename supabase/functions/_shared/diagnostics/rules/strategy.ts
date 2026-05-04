// STRATEGY-nivå regler (3)
import type { Rule, RuleResult } from "../types.ts";
import { cpa, dailyBudgetSek, ev, impact, microsToSek, targetCpaSek } from "../utils.ts";

export const manualCpcWithData: Rule = {
  id: "manual_cpc_with_data",
  level: "strategy",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign) return null;
    const strategy = (campaign.bidding_strategy_type || "").toUpperCase();
    if (!strategy.includes("MANUAL")) return null;
    if (campaign.metrics_30d.conversions < 30) return null;
    const cpaNow = cpa(campaign) ?? 0;
    return {
      fires: true,
      confidence: 0.8,
      evidence: [
        ev("gaql", "bidding_strategy", strategy),
        ev("gaql", "conversions_30d", campaign.metrics_30d.conversions),
        ev("computed", "cpa_sek", cpaNow),
      ],
      expected_impact: impact("conversions", "up", 5, 12, 25),
      assumptions: ["Smart bidding presterar bättre vid ≥30 konv/30d"],
      proposed_actions: [{
        kind: "manual",
        level: "strategy",
        label: "Byt till TARGET_CPA",
        detail: `Sätt target CPA nära nuvarande snitt (${cpaNow.toFixed(0)} kr) och låt Google optimera.`,
        reversible: true,
        risk: "medium",
        risk_reason: "Smart bidding behöver 1-2 veckors lärande.",
      }],
    };
  },
};

export const targetCpaStrangling: Rule = {
  id: "target_cpa_strangling",
  level: "strategy",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign) return null;
    const strategy = (campaign.bidding_strategy_type || "").toUpperCase();
    if (!strategy.includes("TARGET_CPA")) return null;
    const target = targetCpaSek(campaign);
    const actual = cpa(campaign);
    if (!target || !actual) return null;
    if (actual >= target * 0.85) return null; // måste vara klart under target
    const budgetLost = campaign.metrics_30d.search_budget_lost_is ?? 0;
    if (budgetLost < 0.10) return null;
    const conv = campaign.metrics_30d.conversions;
    const extraConv = Math.round(conv * (budgetLost / (1 - budgetLost)));
    return {
      fires: true,
      confidence: 0.85,
      evidence: [
        ev("gaql", "target_cpa_sek", target),
        ev("computed", "actual_cpa_sek", actual),
        ev("gaql", "budget_lost_is", budgetLost),
      ],
      expected_impact: impact("conversions", "up", Math.round(extraConv * 0.5), extraConv, Math.round(extraConv * 1.5)),
      assumptions: ["Lediga auktioner finns; CPA håller sig under target vid budgethöjning"],
      proposed_actions: [{
        kind: "mutate",
        level: "budget",
        label: `Höj daglig budget +20%`,
        detail: `Aktuell budget ${dailyBudgetSek(campaign)} kr/dag. Höj till ${Math.round(dailyBudgetSek(campaign) * 1.2)} kr/dag.`,
        mutate: {
          action_type: "update_budget",
          campaign_id: campaign.id,
          new_amount_micros: Math.round(campaign.daily_budget_micros * 1.2),
        },
        reversible: true,
        risk: "low",
        risk_reason: "≤20% budgetjustering, lätt att rulla tillbaka.",
      }],
    };
  },
};

export const brandWrongStrategy: Rule = {
  id: "brand_wrong_strategy",
  level: "strategy",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign || !campaign.is_brand) return null;
    const strategy = (campaign.bidding_strategy_type || "").toUpperCase();
    if (strategy.includes("TARGET_IMPRESSION_SHARE")) return null;
    return {
      fires: true,
      confidence: 0.75,
      evidence: [
        ev("gaql", "is_brand", "true"),
        ev("gaql", "bidding_strategy", strategy),
      ],
      expected_impact: impact("impression_share", "up", 5, 15, 25),
      assumptions: ["Brand-kampanjer mår bäst av TARGET_IMPRESSION_SHARE för att skydda varumärket"],
      proposed_actions: [{
        kind: "manual",
        level: "strategy",
        label: "Byt till TARGET_IMPRESSION_SHARE 90%",
        detail: "Brand-kampanjer ska maximera synlighet på eget varumärke, inte CPA.",
        reversible: true,
        risk: "low",
        risk_reason: "Brand-trafik är förutsägbar och billig.",
      }],
    };
  },
};
