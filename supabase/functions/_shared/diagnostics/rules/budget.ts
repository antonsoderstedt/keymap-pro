// BUDGET-nivå regler (3)
import type { Rule, RuleResult } from "../types.ts";
import { cpa, dailyBudgetSek, ev, impact, microsToSek, targetCpaSek } from "../utils.ts";

export const underfundedWinner: Rule = {
  id: "underfunded_winner",
  level: "budget_targets",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign) return null;
    const target = targetCpaSek(campaign);
    const actual = cpa(campaign);
    if (!target || !actual) return null;
    if (actual >= target) return null;
    const budgetLost = campaign.metrics_30d.search_budget_lost_is ?? 0;
    if (budgetLost < 0.15) return null;
    const conv = campaign.metrics_30d.conversions;
    const extraConv = Math.round(conv * 0.2);
    return {
      fires: true,
      confidence: 0.8,
      evidence: [
        ev("computed", "actual_cpa_sek", actual, "30d", { value: target, label: "target_cpa" }),
        ev("gaql", "budget_lost_is", budgetLost),
      ],
      expected_impact: impact("conversions", "up", Math.round(extraConv * 0.5), extraConv, Math.round(extraConv * 1.5)),
      assumptions: ["Vinnande kampanj som tappar volym pga budget"],
      proposed_actions: [{
        kind: "mutate",
        level: "budget",
        label: "Höj budget +20%",
        detail: `${dailyBudgetSek(campaign)} → ${Math.round(dailyBudgetSek(campaign) * 1.2)} kr/dag.`,
        mutate: {
          action_type: "update_budget",
          campaign_id: campaign.id,
          new_amount_micros: Math.round(campaign.daily_budget_micros * 1.2),
        },
        reversible: true,
        risk: "low",
        risk_reason: "CPA redan under target, marginal finns.",
      }],
    };
  },
};

export const overfundedLoser: Rule = {
  id: "overfunded_loser",
  level: "budget_targets",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign) return null;
    const target = targetCpaSek(campaign);
    const actual = cpa(campaign);
    const cost = microsToSek(campaign.metrics_30d.cost_micros);
    if (cost < 1000) return null;
    // Räknas som loser om: CPA klart över target, ELLER 0 konv på >1000kr
    const isLoser = (target && actual && actual > target * 1.3) ||
                    (campaign.metrics_30d.conversions === 0 && cost > 1000);
    if (!isLoser) return null;
    return {
      fires: true,
      confidence: 0.85,
      evidence: [
        ev("computed", "cost_sek_30d", cost),
        ev("computed", "cpa_sek", actual ?? "n/a", "30d", target ? { value: target, label: "target_cpa" } : undefined),
        ev("gaql", "conversions_30d", campaign.metrics_30d.conversions),
      ],
      expected_impact: impact("spend", "down", Math.round(cost * 0.2), Math.round(cost * 0.4), Math.round(cost * 0.6)),
      assumptions: ["Förlorande kampanj kan sänkas eller pausas utan stort intäktsbortfall"],
      proposed_actions: [{
        kind: "mutate",
        level: "budget",
        label: "Sänk budget −40%",
        detail: `${dailyBudgetSek(campaign)} → ${Math.round(dailyBudgetSek(campaign) * 0.6)} kr/dag, eller pausa kampanjen.`,
        mutate: {
          action_type: "update_budget",
          campaign_id: campaign.id,
          new_amount_micros: Math.round(campaign.daily_budget_micros * 0.6),
        },
        reversible: true,
        risk: "medium",
        risk_reason: "Risk att tappa enstaka konverteringar.",
      }],
    };
  },
};

export const dailyBudgetStarved: Rule = {
  id: "daily_budget_starved",
  level: "budget_targets",
  scope: "campaign",
  requires: ["campaigns"],
  evaluate({ campaign }): RuleResult | null {
    if (!campaign) return null;
    const budgetLost = campaign.metrics_30d.search_budget_lost_is ?? 0;
    if (budgetLost < 0.30) return null;
    return {
      fires: true,
      confidence: 0.9,
      evidence: [ev("gaql", "budget_lost_is", budgetLost)],
      expected_impact: impact("impression_share", "up", 10, 20, 30),
      assumptions: ["Budget är hård flaskhals — minst 30% IS förlorad pga budget"],
      proposed_actions: [{
        kind: "mutate",
        level: "budget",
        label: "Höj budget +30%",
        detail: `${dailyBudgetSek(campaign)} → ${Math.round(dailyBudgetSek(campaign) * 1.3)} kr/dag.`,
        mutate: {
          action_type: "update_budget",
          campaign_id: campaign.id,
          new_amount_micros: Math.round(campaign.daily_budget_micros * 1.3),
        },
        reversible: true,
        risk: "medium",
        risk_reason: "Större höjning, övervaka CPA.",
      }],
    };
  },
};
