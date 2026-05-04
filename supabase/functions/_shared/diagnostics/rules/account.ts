// ACCOUNT-nivå regler (2)
import type { Rule, RuleResult } from "../types.ts";
import { ev, impact } from "../utils.ts";

export const trackingBroken: Rule = {
  id: "tracking_broken",
  level: "account",
  scope: "account",
  requires: ["campaigns"],
  evaluate({ snapshot }): RuleResult | null {
    const totalConv = snapshot.campaigns.reduce((s, c) => s + (c.metrics_30d.conversions ?? 0), 0);
    const totalClicks = snapshot.campaigns.reduce((s, c) => s + (c.metrics_30d.clicks ?? 0), 0);
    if (totalClicks <= 200 || totalConv > 0) return null;
    return {
      fires: true,
      confidence: 0.95,
      evidence: [
        ev("gaql", "conversions", totalConv),
        ev("gaql", "clicks", totalClicks),
      ],
      expected_impact: impact("conversions", "up", 0, 0, 0, 30),
      assumptions: ["Spårning trasig om många klick men 0 konv"],
      proposed_actions: [{
        kind: "investigate",
        level: "tactic",
        label: "Verifiera konverteringsspårning",
        detail: "Kontrollera att gtag/Tag Manager skickar konverteringar till rätt konverteringsåtgärd och att den är primär.",
        reversible: true,
        risk: "low",
        risk_reason: "Endast verifiering, ingen ändring i Ads.",
      }],
    };
  },
};

export const lowOptimizationScore: Rule = {
  id: "low_optimization_score",
  level: "account",
  scope: "account",
  requires: ["campaigns"],
  evaluate({ snapshot }): RuleResult | null {
    const score = Number((snapshot.customer as any)?.optimizationScore);
    if (!Number.isFinite(score) || score >= 0.6) return null;
    return {
      fires: true,
      confidence: 0.7,
      evidence: [ev("gaql", "optimization_score", score)],
      expected_impact: impact("conversions", "up", 0, 0, 0, 30),
      assumptions: ["Google bedömer kontot som suboptimerat"],
      proposed_actions: [{
        kind: "investigate",
        level: "tactic",
        label: "Granska Google Ads recommendations",
        detail: `Optimization score är ${(score * 100).toFixed(0)}%. Se recommendations-fliken i Google Ads för konkreta förslag.`,
        reversible: true,
        risk: "low",
        risk_reason: "Endast granskning.",
      }],
    };
  },
};
