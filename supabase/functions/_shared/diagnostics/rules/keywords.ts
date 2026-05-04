// KEYWORDS-nivå regler (3)
import type { Rule, RuleResult } from "../types.ts";
import { ev, impact, microsToSek } from "../utils.ts";

export const wastedKeywordNoConversions: Rule = {
  id: "wasted_keyword_no_conversions",
  level: "keywords",
  scope: "keyword",
  requires: ["keywords"],
  evaluate({ campaign, adGroup, keyword }): RuleResult | null {
    if (!keyword || !campaign || !adGroup) return null;
    const cost = microsToSek(keyword.metrics_30d.cost_micros);
    if (keyword.metrics_30d.conversions > 0) return null;
    if (cost < 200) return null;
    return {
      fires: true,
      confidence: 0.85,
      evidence: [
        ev("gaql", "cost_sek_30d", cost),
        ev("gaql", "conversions_30d", 0),
        ev("gaql", "clicks_30d", keyword.metrics_30d.clicks),
      ],
      expected_impact: impact("spend", "down", Math.round(cost * 0.6), cost, cost),
      assumptions: ["Sökord utan konv på >200 kr är kandidat för pause/negativ"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Pausa sökord eller lägg som negativ",
        detail: `${keyword.text} (${keyword.match_type}) — ${cost} kr utan konv.`,
        reversible: true,
        risk: "low",
        risk_reason: "Kan återaktiveras.",
      }],
    };
  },
};

export const negativeKeywordCandidate: Rule = {
  id: "negative_keyword_candidate",
  level: "keywords",
  scope: "keyword",
  requires: ["keywords"],
  evaluate({ keyword }): RuleResult | null {
    if (!keyword) return null;
    if (keyword.metrics_30d.clicks < 3) return null;
    if (keyword.metrics_30d.conversions > 0) return null;
    if ((keyword.metrics_30d.ctr ?? 0) >= 0.01) return null;
    const cost = microsToSek(keyword.metrics_30d.cost_micros);
    return {
      fires: true,
      confidence: 0.7,
      evidence: [
        ev("gaql", "clicks", keyword.metrics_30d.clicks),
        ev("gaql", "ctr", keyword.metrics_30d.ctr),
      ],
      expected_impact: impact("spend", "down", Math.round(cost * 0.5), cost, Math.round(cost * 1.2)),
      assumptions: ["CTR <1% indikerar irrelevans"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Lägg som negativt sökord",
        detail: `${keyword.text} har ${keyword.metrics_30d.clicks} klick och ${(keyword.metrics_30d.ctr * 100).toFixed(2)}% CTR.`,
        reversible: true,
        risk: "low",
        risk_reason: "Negativt sökord kan tas bort.",
      }],
    };
  },
};

export const keywordQualityScoreBelow5: Rule = {
  id: "keyword_quality_score_below_5",
  level: "keywords",
  scope: "keyword",
  requires: ["keywords"],
  evaluate({ keyword }): RuleResult | null {
    if (!keyword || keyword.quality_score == null) return null;
    if (keyword.quality_score > 4) return null;
    if (keyword.metrics_30d.clicks < 100) return null;
    const cost = microsToSek(keyword.metrics_30d.cost_micros);
    return {
      fires: true,
      confidence: 0.8,
      evidence: [
        ev("gaql", "quality_score", keyword.quality_score),
        ev("gaql", "clicks_30d", keyword.metrics_30d.clicks),
      ],
      expected_impact: impact("spend", "down", Math.round(cost * 0.2), Math.round(cost * 0.3), Math.round(cost * 0.4)),
      assumptions: ["Lågt QS innebär förhöjd CPC"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Förbättra QS eller pausa",
        detail: `QS ${keyword.quality_score}/10. Förbättra annonstext, landningssida eller pausa.`,
        reversible: true,
        risk: "low",
        risk_reason: "Manuell granskning.",
      }],
    };
  },
};
