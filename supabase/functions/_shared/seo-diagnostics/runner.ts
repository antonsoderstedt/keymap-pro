import type {
  SeoContentSnapshot,
  SeoDiagnosisReport,
  SeoDiagnosis,
  SeoRule,
} from "./types.ts";
import { evaluateSeoGates } from "./gates.ts";
import { architectureRules } from "./rules/architecture.ts";
import { opportunityRules } from "./rules/opportunity.ts";
import { pageRules } from "./rules/page.ts";
import { aiLlmRules } from "./rules/ai_llm.ts";
import { authorityRules } from "./rules/authority.ts";
import { calcSiteHealthScore } from "./utils.ts";

const ALL_RULES: SeoRule[] = [
  ...architectureRules,
  ...opportunityRules,
  ...pageRules,
  ...aiLlmRules,
  ...authorityRules,
];

function uuid(): string {
  return crypto.randomUUID();
}

export function runSeoDiagnostics(snapshot: SeoContentSnapshot): SeoDiagnosisReport {
  const t0 = Date.now();
  const { blockers } = evaluateSeoGates(snapshot);

  if (blockers.length > 0) {
    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      project_id: snapshot.project_id,
      analysis_id: snapshot.analysis_id,
      domain: snapshot.domain,
      blockers,
      site_health: { audit_score: null, healthy: false, summary: blockers[0].message },
      diagnoses: [],
      meta: {
        rules_evaluated: 0,
        rules_fired: 0,
        cache_hit: false,
        duration_ms: Date.now() - t0,
        data_sources: [],
      },
    };
  }

  const diagnoses: SeoDiagnosis[] = [];
  let rulesEvaluated = 0;

  for (const rule of ALL_RULES) {
    const missingSource = rule.requires.some((req) => {
      if (req === "universe") return !snapshot.universe;
      if (req === "gsc") return !snapshot.gsc;
      if (req === "audit") return !snapshot.audit;
      if (req === "backlinks") return !snapshot.backlinks;
      if (req === "goals") return !snapshot.goals;
      return false;
    });

    if (missingSource) continue;

    try {
      if (rule.scope === "site" || rule.scope === "page") {
        rulesEvaluated++;
        const result = rule.evaluate(snapshot);
        if (result?.fires) {
          diagnoses.push({
            id: uuid(),
            rule_id: rule.id,
            category: rule.category,
            scope: rule.scope,
            scope_ref: result.scope_ref,
            severity: result.severity,
            confidence: result.confidence,
            title: result.title,
            what_happens: result.what_happens,
            why: result.why,
            evidence: result.evidence,
            expected_impact: result.expected_impact,
            estimated_value_sek: 0,
            proposed_actions: result.proposed_actions,
            data_sources: rule.requires,
          });
        }
      }

      if (rule.scope === "cluster" && snapshot.universe?.clusters) {
        for (const cluster of snapshot.universe.clusters) {
          rulesEvaluated++;
          const result = rule.evaluate(snapshot, { cluster });
          if (result?.fires) {
            diagnoses.push({
              id: uuid(),
              rule_id: rule.id,
              category: rule.category,
              scope: "cluster",
              scope_ref: result.scope_ref,
              severity: result.severity,
              confidence: result.confidence,
              title: result.title,
              what_happens: result.what_happens,
              why: result.why,
              evidence: result.evidence,
              expected_impact: result.expected_impact,
              estimated_value_sek: 0,
              proposed_actions: result.proposed_actions,
              data_sources: rule.requires,
            });
          }
        }
      }
    } catch (e) {
      console.error(`[seo-diagnose] rule ${rule.id} failed:`, e);
    }
  }

  // Beräkna estimated_value_sek per diagnos
  for (const d of diagnoses) {
    if (d.expected_impact.metric === "clicks" && snapshot.goals) {
      const { conversion_rate_pct, conversion_value } = snapshot.goals;
      d.estimated_value_sek = Math.round(
        d.expected_impact.mid * (conversion_rate_pct / 100) * conversion_value
      );
    } else if (d.expected_impact.metric === "conversions" && snapshot.goals) {
      d.estimated_value_sek = Math.round(d.expected_impact.mid * snapshot.goals.conversion_value);
    }
  }

  applyRootCauseTree(diagnoses);

  diagnoses.sort((a, b) => {
    const sev: Record<string, number> = { critical: 3, warn: 2, info: 1 };
    const sevDiff = (sev[b.severity] || 0) - (sev[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return b.estimated_value_sek * b.confidence - a.estimated_value_sek * a.confidence;
  });

  const auditScore = snapshot.audit
    ? calcSiteHealthScore(snapshot.audit.onPage.issues)
    : null;

  const dataSources = [
    snapshot.universe ? "universe" : null,
    snapshot.gsc ? "gsc" : null,
    snapshot.audit ? "audit" : null,
    snapshot.backlinks ? "backlinks" : null,
  ].filter(Boolean) as string[];

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    project_id: snapshot.project_id,
    analysis_id: snapshot.analysis_id,
    domain: snapshot.domain,
    blockers: [],
    site_health: {
      audit_score: auditScore,
      healthy: diagnoses.filter((d) => d.severity === "critical").length === 0,
      summary: buildHealthSummary(diagnoses),
    },
    diagnoses,
    meta: {
      rules_evaluated: rulesEvaluated,
      rules_fired: diagnoses.length,
      cache_hit: false,
      duration_ms: Date.now() - t0,
      data_sources: dataSources,
    },
  };
}

function buildHealthSummary(diagnoses: SeoDiagnosis[]): string {
  const critical = diagnoses.filter((d) => d.severity === "critical").length;
  const totalValue = diagnoses.reduce((s, d) => s + d.estimated_value_sek, 0);

  if (critical > 0) {
    return `${critical} kritiska problem att åtgärda. Estimerat värde att hämta: ${totalValue.toLocaleString("sv-SE")} kr/mån.`;
  }
  return `${diagnoses.length} möjligheter identifierade. Totalt estimerat värde: ${totalValue.toLocaleString("sv-SE")} kr/mån.`;
}

function applyRootCauseTree(diagnoses: SeoDiagnosis[]): void {
  const pillarDiagnoses = diagnoses.filter((d) => d.rule_id === "missing_pillar_for_cluster");
  for (const pillar of pillarDiagnoses) {
    const clusterName = pillar.scope_ref[0]?.name;
    const symptoms = diagnoses.filter(
      (d) =>
        d.rule_id === "cluster_without_internal_linking" &&
        d.scope_ref[0]?.name === clusterName
    );
    for (const s of symptoms) {
      s.is_symptom_of = pillar.id;
    }
  }
}
