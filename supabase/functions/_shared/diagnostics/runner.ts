// Registry + runner: kör alla regler mot snapshot, returnerar Diagnosis[]
import type {
  AccountSnapshot,
  Diagnosis,
  Rule,
  RuleContext,
  RuleResult,
} from "./types.ts";
import { clampConfidence } from "./utils.ts";
import { lowOptimizationScore, trackingBroken } from "./rules/account.ts";
import { brandWrongStrategy, manualCpcWithData, targetCpaStrangling } from "./rules/strategy.ts";
import { dailyBudgetStarved, overfundedLoser, underfundedWinner } from "./rules/budget.ts";
import { keywordQualityScoreBelow5, negativeKeywordCandidate, wastedKeywordNoConversions } from "./rules/keywords.ts";
import { adStrengthPoor, landingQsLow, pmaxCannibalizingBrand, rsaCountBelowTwo } from "./rules/creative_landing.ts";

export const ALL_RULES: Rule[] = [
  trackingBroken,
  lowOptimizationScore,
  manualCpcWithData,
  targetCpaStrangling,
  brandWrongStrategy,
  underfundedWinner,
  overfundedLoser,
  dailyBudgetStarved,
  wastedKeywordNoConversions,
  negativeKeywordCandidate,
  keywordQualityScoreBelow5,
  adStrengthPoor,
  rsaCountBelowTwo,
  landingQsLow,
  pmaxCannibalizingBrand,
];

export interface RunResult {
  diagnoses: Diagnosis[];
  evaluated: number;
  fired: number;
}

export function runAllRules(
  snapshot: AccountSnapshot,
  campaignGates: Map<string, Set<string>>,
  scopedCampaignIds?: string[],
): RunResult {
  const diagnoses: Diagnosis[] = [];
  let evaluated = 0;
  let fired = 0;

  const campaigns = scopedCampaignIds && scopedCampaignIds.length > 0
    ? snapshot.campaigns.filter((c) => scopedCampaignIds.includes(c.id))
    : snapshot.campaigns;

  for (const rule of ALL_RULES) {
    if (rule.scope === "account") {
      evaluated++;
      const res = safeEval(rule, { snapshot });
      if (res?.fires) {
        fired++;
        diagnoses.push(buildDiagnosis(rule, res, "account", []));
      }
      continue;
    }

    for (const campaign of campaigns) {
      const gates = campaignGates.get(campaign.id) ?? new Set<string>();
      const lowSig = gates.has("LOW_SIGNIFICANCE");
      const recentChange = gates.has("RECENT_CHANGE");

      if (rule.scope === "campaign") {
        evaluated++;
        const res = safeEval(rule, { snapshot, campaign });
        if (res?.fires) {
          fired++;
          res.confidence = clampConfidence(res.confidence, lowSig, recentChange);
          diagnoses.push(buildDiagnosis(rule, res, "campaign", [{ id: campaign.id, name: campaign.name }]));
        }
        continue;
      }

      for (const adGroup of campaign.ad_groups) {
        if (rule.scope === "ad_group") {
          evaluated++;
          const res = safeEval(rule, { snapshot, campaign, adGroup });
          if (res?.fires) {
            fired++;
            res.confidence = clampConfidence(res.confidence, lowSig, recentChange);
            diagnoses.push(
              buildDiagnosis(rule, res, "ad_group", [
                { id: campaign.id, name: campaign.name },
                { id: adGroup.id, name: adGroup.name },
              ]),
            );
          }
          continue;
        }

        if (rule.scope === "keyword") {
          for (const keyword of adGroup.keywords) {
            evaluated++;
            const res = safeEval(rule, { snapshot, campaign, adGroup, keyword });
            if (res?.fires) {
              fired++;
              res.confidence = clampConfidence(res.confidence, lowSig, recentChange);
              diagnoses.push(
                buildDiagnosis(rule, res, "keyword", [
                  { id: campaign.id, name: campaign.name },
                  { id: adGroup.id, name: adGroup.name },
                  { id: keyword.criterion_id, name: keyword.text },
                ]),
              );
            }
          }
        }
      }
    }
  }

  return { diagnoses, evaluated, fired };
}

function safeEval(rule: Rule, ctx: RuleContext): RuleResult | null {
  try {
    return rule.evaluate(ctx);
  } catch (e) {
    console.error(`Rule ${rule.id} threw`, e);
    return null;
  }
}

function buildDiagnosis(
  rule: Rule,
  res: RuleResult,
  scope: Diagnosis["scope"],
  scope_ref: { id: string; name: string }[],
): Diagnosis {
  const severity: Diagnosis["severity"] = rule.id === "tracking_broken"
    ? "critical"
    : res.confidence >= 0.8
    ? "warn"
    : "info";
  const titles: Record<string, string> = {
    tracking_broken: "Konverteringsspårning verkar trasig",
    low_optimization_score: "Lågt optimization score",
    manual_cpc_with_data: "Manual CPC trots tillräckligt med data",
    target_cpa_strangling: "Target CPA stryper volymen",
    brand_wrong_strategy: "Brand-kampanj på fel budstrategi",
    underfunded_winner: "Vinnande kampanj är budgetbegränsad",
    overfunded_loser: "Förlorande kampanj med för hög budget",
    daily_budget_starved: "Daglig budget för låg",
    wasted_keyword_no_conversions: "Sökord spenderar utan konvertering",
    negative_keyword_candidate: "Lämplig negativkandidat",
    keyword_quality_score_below_5: "Lågt Quality Score",
    ad_strength_poor: "Svag ad strength",
    rsa_count_below_two: "För få RSA i ad group",
    landing_qs_low: "Lågt landing page experience",
    pmaxCannibalizingBrand: "PMAX kan kannibalisera brand",
  };
  return {
    id: `${rule.id}:${scope_ref.map((s) => s.id).join("/")}`,
    rule_id: rule.id,
    level: rule.level,
    scope,
    scope_ref,
    severity,
    confidence: res.confidence,
    title: titles[rule.id] ?? rule.id,
    what_happens: res.evidence.map((e) => `${e.metric}=${e.value}`).join("; "),
    why: res.assumptions.join(" • "),
    evidence: res.evidence,
    expected_impact: res.expected_impact,
    proposed_actions: res.proposed_actions,
  };
}
