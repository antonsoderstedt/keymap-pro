// Typer för Content & SEO Diagnostics Engine

export interface UniverseKeyword {
  keyword: string;
  cluster?: string;
  dimension?: string;
  intent?: string;
  funnelStage?: string;
  priority?: string;
  channel?: string;
  recommendedLandingPage?: string;
  recommendedAdGroup?: string;
  contentIdea?: string;
  isNegative?: boolean;
  searchVolume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  dataSource?: string;
  kd?: number | null;
  serpFeatures?: string[];
  topRankingDomains?: string[];
  competitorGap?: boolean;
  trend_json?: any;
  [k: string]: any;
}

export interface SeoContentSnapshot {
  project_id: string;
  analysis_id: string | null;
  domain: string;

  universe: {
    keywords: UniverseKeyword[];
    clusters: ClusterSummary[];
    total_keywords: number;
    total_enriched: number;
  } | null;

  gsc: {
    rows_28d: GscRow[];
    rows_90d: GscRow[];
    site_url: string;
  } | null;

  audit: {
    domain: string;
    semrush?: { overview: any; topPages: any[] };
    onPage: { issues: AuditIssue[]; htmlSize: number };
    generatedAt: string;
  } | null;

  backlinks: {
    ownOverview: BacklinkOverview | null;
    competitors: { domain: string; overview: BacklinkOverview | null }[];
    gapDomains: GapDomain[];
  } | null;

  content_briefs: { cluster: string; exists: boolean; payload: any }[];

  strategy: any | null;

  goals: ProjectGoals | null;

  competitors: string[];
}

export interface ClusterSummary {
  name: string;
  keywords: UniverseKeyword[];
  total_volume: number;
  avg_kd: number | null;
  avg_cpc: number | null;
  competitor_gap_count: number;
  has_brief: boolean;
  dominant_intent: string;
  dominant_channel: string;
  gsc_keywords: GscRow[];
  best_position: number | null;
  estimated_value_sek: number;
}

export interface GscRow {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface AuditIssue {
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  url: string;
}

export interface BacklinkOverview {
  authorityScore: number;
  totalBacklinks: number;
  referringDomains: number;
  follows: number;
  nofollows: number;
}

export interface GapDomain {
  domain: string;
  authority: number;
  backlinks: number;
  linksToCompetitors: string[];
  competitorCount: number;
}

export interface ProjectGoals {
  conversion_type: string;
  conversion_value: number;
  conversion_rate_pct: number;
  brand_terms: string[];
  primary_goal: string;
}

export interface SeoDiagnosisReport {
  schema_version: "1.0";
  generated_at: string;
  project_id: string;
  analysis_id: string | null;
  domain: string;
  blockers: SeoDiagnosisBlocker[];
  site_health: {
    audit_score: number | null;
    healthy: boolean;
    summary: string;
  };
  diagnoses: SeoDiagnosis[];
  meta: {
    rules_evaluated: number;
    rules_fired: number;
    cache_hit: boolean;
    duration_ms: number;
    data_sources: string[];
  };
}

export interface SeoDiagnosis {
  id: string;
  rule_id: string;
  category: SeoRuleCategory;
  scope: "site" | "cluster" | "page" | "keyword";
  scope_ref: { id: string; name: string }[];
  severity: "info" | "warn" | "critical";
  confidence: number;
  is_symptom_of?: string;
  title: string;
  what_happens: string;
  why: string;
  evidence: SeoEvidence[];
  expected_impact: SeoImpactEstimate;
  estimated_value_sek: number;
  proposed_actions: SeoProposedAction[];
  data_sources: string[];
}

export interface SeoEvidence {
  source: "universe" | "gsc" | "audit" | "backlinks" | "computed" | "competitor";
  metric: string;
  value: number | string;
  period?: "7d" | "28d" | "90d";
  comparison?: { value: number | string; label: string };
}

export interface SeoImpactEstimate {
  metric: "clicks" | "position" | "conversions" | "authority" | "topical_coverage" | "ai_citations";
  direction: "up" | "down";
  low: number;
  mid: number;
  high: number;
  horizon_days: number;
  reasoning: string;
}

export interface SeoProposedAction {
  kind:
    | "create_content"
    | "fix_technical"
    | "build_links"
    | "update_content"
    | "internal_link"
    | "add_schema"
    | "investigate";
  label: string;
  detail: string;
  effort: "låg" | "medel" | "hög";
  steps: string[];
  creates_action_item: boolean;
}

export type SeoRuleCategory =
  | "architecture"
  | "opportunity"
  | "page"
  | "ai_llm"
  | "authority";

export interface SeoDiagnosisBlocker {
  gate: "NO_UNIVERSE" | "NO_GSC" | "NO_DOMAIN" | "STALE_DATA" | "INSUFFICIENT_DATA";
  message: string;
  resolution: string;
}

export interface SeoRule {
  id: string;
  category: SeoRuleCategory;
  scope: "site" | "cluster" | "page" | "keyword";
  requires: ("universe" | "gsc" | "audit" | "backlinks" | "goals")[];
  evaluate(
    snapshot: SeoContentSnapshot,
    context?: { cluster?: ClusterSummary; gscRow?: GscRow }
  ): SeoRuleResult | null;
}

export interface SeoRuleResult {
  fires: boolean;
  confidence: number;
  evidence: SeoEvidence[];
  expected_impact: SeoImpactEstimate;
  proposed_actions: SeoProposedAction[];
  severity: "info" | "warn" | "critical";
  title: string;
  what_happens: string;
  why: string;
  scope_ref: { id: string; name: string }[];
}
