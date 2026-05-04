// CREATIVE + LANDING regler (4)
import type { Rule, RuleResult } from "../types.ts";
import { ev, impact } from "../utils.ts";

export const adStrengthPoor: Rule = {
  id: "ad_strength_poor",
  level: "creative",
  scope: "ad_group",
  requires: ["ads"],
  evaluate({ adGroup }): RuleResult | null {
    if (!adGroup) return null;
    const weak = adGroup.ads.filter((a) =>
      ["POOR", "AVERAGE"].includes((a.ad_strength || "").toUpperCase())
    );
    if (weak.length === 0) return null;
    return {
      fires: true,
      confidence: 0.7,
      evidence: [ev("gaql", "weak_ads_count", weak.length)],
      expected_impact: impact("clicks", "up", 5, 12, 20),
      assumptions: ["Bättre ad strength → högre CTR"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Förbättra annonsstyrka",
        detail: `${weak.length} annonser har POOR/AVERAGE ad strength. Lägg till fler rubriker/beskrivningar.`,
        reversible: true,
        risk: "low",
        risk_reason: "Endast tillägg av kreativa element.",
      }],
    };
  },
};

export const rsaCountBelowTwo: Rule = {
  id: "rsa_count_below_two",
  level: "creative",
  scope: "ad_group",
  requires: ["ads"],
  evaluate({ adGroup }): RuleResult | null {
    if (!adGroup) return null;
    if (adGroup.ads.length >= 2) return null;
    return {
      fires: true,
      confidence: 0.9,
      evidence: [ev("gaql", "ads_in_group", adGroup.ads.length)],
      expected_impact: impact("clicks", "up", 3, 8, 15),
      assumptions: ["Google rekommenderar ≥2 RSA per ad group"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Skapa minst 2 RSA per ad group",
        detail: `Ad group har ${adGroup.ads.length} annons(er). Skapa fler för bättre testning.`,
        reversible: true,
        risk: "low",
        risk_reason: "Tilläggsannonser konkurrerar internt.",
      }],
    };
  },
};

export const landingQsLow: Rule = {
  id: "landing_qs_low",
  level: "landing",
  scope: "keyword",
  requires: ["keywords"],
  evaluate({ keyword }): RuleResult | null {
    if (!keyword) return null;
    if (keyword.landing_qs !== "BELOW_AVERAGE") return null;
    if (keyword.metrics_30d.clicks < 50) return null;
    return {
      fires: true,
      confidence: 0.75,
      evidence: [
        ev("gaql", "landing_qs", keyword.landing_qs),
        ev("gaql", "clicks_30d", keyword.metrics_30d.clicks),
      ],
      expected_impact: impact("conversions", "up", 1, 3, 6),
      assumptions: ["Bättre landningssida → högre konv-rate och QS"],
      proposed_actions: [{
        kind: "investigate",
        level: "tactic",
        label: "Granska landningssidan",
        detail: `${keyword.text}: landing page experience är BELOW_AVERAGE. Kolla relevans, laddningstid, mobil-UX.`,
        reversible: true,
        risk: "low",
        risk_reason: "Endast granskning.",
      }],
    };
  },
};

export const pmaxCannibalizingBrand: Rule = {
  id: "pmax_cannibalizing_brand",
  level: "structure",
  scope: "campaign",
  requires: ["campaigns", "auction_insights"],
  evaluate({ campaign, snapshot }): RuleResult | null {
    if (!campaign) return null;
    const type = (campaign.type || "").toUpperCase();
    if (!type.includes("PERFORMANCE_MAX")) return null;
    const brandTerms = snapshot.goals?.brand_terms ?? [];
    if (!brandTerms.length) return null;
    // Heuristik: PMAX i konto med brand-kampanj → potentiell kannibalisering
    const hasBrandCampaign = snapshot.campaigns.some((c) => c.is_brand && c.id !== campaign.id);
    if (!hasBrandCampaign) return null;
    return {
      fires: true,
      confidence: 0.6,
      evidence: [
        ev("gaql", "campaign_type", type),
        ev("computed", "brand_campaign_exists", "true"),
      ],
      expected_impact: impact("cpa", "down", 5, 10, 20),
      assumptions: ["PMAX kan bjuda på brand-sökord och inflatera ROAS"],
      proposed_actions: [{
        kind: "manual",
        level: "tactic",
        label: "Exkludera brand-termer från PMAX",
        detail: `Lägg till brand-termer (${brandTerms.join(", ")}) som account-level negativa eller PMAX-exclusions.`,
        reversible: true,
        risk: "low",
        risk_reason: "Brand-trafik flyttas till brand-kampanjen där den hör hemma.",
      }],
    };
  },
};
