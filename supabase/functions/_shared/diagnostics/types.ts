// Ads Diagnostics Engine — gemensamma typkontrakt
// Alla ytor (AdsAudit, AuctionInsights, AdsChat, WeeklyBriefing) konsumerar DiagnosisReport
// så att samma kampanj alltid får samma analys.

export interface DiagnosisReport {
  schema_version: "1.0";
  generated_at: string;
  customer_id: string;
  project_id: string;
  scope: { campaign_ids: string[] } | null; // null = hela kontot
  snapshot_window: { start: string; end: string };
  blockers: DiagnosisBlocker[];
  account_health: {
    optimization_score: number | null;
    healthy: boolean;
    summary: string;
  };
  diagnoses: Diagnosis[]; // sorterade på confidence × estimated_value_sek
  meta: {
    rules_evaluated: number;
    rules_fired: number;
    cache_hit: boolean;
    duration_ms: number;
  };
}

export interface Diagnosis {
  id: string;
  rule_id: string;
  level: TreeLevel;
  scope: "account" | "campaign" | "ad_group" | "keyword";
  scope_ref: { id: string; name: string }[];
  severity: "info" | "warn" | "critical";
  confidence: number; // 0..1
  is_symptom_of?: string;
  title: string;
  what_happens: string;
  why: string;
  evidence: Evidence[];
  expected_impact: ImpactEstimate;
  proposed_actions: ProposedAction[];
  estimated_value_sek?: number;
}

export interface Evidence {
  source: "gaql" | "ga4" | "gsc" | "auction_insights" | "computed";
  metric: string;
  value: number | string;
  period: "7d" | "30d" | "90d";
  comparison?: { value: number | string; label: string };
}

export interface ImpactEstimate {
  metric: "conversions" | "cpa" | "roas" | "spend" | "impression_share" | "clicks";
  direction: "up" | "down";
  low: number;
  mid: number;
  high: number;
  horizon_days: number;
}

export interface ProposedAction {
  kind: "mutate" | "manual" | "investigate";
  level: "strategy" | "budget" | "tactic";
  label: string;
  detail: string;
  mutate?: unknown; // AdsMutatePayload — redo för ads-mutate
  reversible: boolean;
  risk: "low" | "medium" | "high";
  risk_reason: string;
}

export interface DiagnosisBlocker {
  gate: "TRACKING" | "BILLING" | "DISAPPROVED" | "MISSING_ADS_SCOPE";
  message: string;
  resolution: string;
}

export type TreeLevel =
  | "account"
  | "strategy"
  | "structure"
  | "budget_targets"
  | "targeting"
  | "creative"
  | "keywords"
  | "landing";

// === Snapshots ===

export interface ProjectGoals {
  conversion_type: string;
  conversion_value: number;
  conversion_rate_pct: number;
  brand_terms: string[];
  strategy_split: Record<string, number>;
}

export interface AccountSnapshot {
  customer_id: string;
  customer: Record<string, unknown>;
  campaigns: CampaignSnapshot[];
  conversion_actions: unknown[];
  change_history_14d: ChangeHistoryEntry[];
  goals: ProjectGoals | null;
}

export interface ChangeHistoryEntry {
  campaign_id?: string;
  change_date: string;
  change_type?: string;
  changed_fields?: string;
}

export interface CampaignSnapshot {
  id: string;
  name: string;
  status: string;
  type: string;
  bidding_strategy_type: string;
  target_cpa_micros?: number;
  target_roas?: number;
  daily_budget_micros: number;
  is_brand: boolean;
  metrics_7d: CampaignMetrics;
  metrics_30d: CampaignMetrics;
  metrics_90d?: CampaignMetrics;
  ad_groups: AdGroupSnapshot[];
  auction_insights?: unknown;
}

export interface CampaignMetrics {
  clicks: number;
  impressions: number;
  cost_micros: number;
  conversions: number;
  ctr: number;
  avg_cpc_micros: number;
  search_impression_share?: number;
  search_budget_lost_is?: number;
  search_rank_lost_is?: number;
}

export interface AdGroupSnapshot {
  id: string;
  name: string;
  keywords: KeywordSnapshot[];
  ads: AdSnapshot[];
}

export interface KeywordSnapshot {
  criterion_id: string;
  text: string;
  match_type: string;
  quality_score: number | null;
  creative_qs: string | null;
  landing_qs: string | null;
  search_predicted_ctr: string | null;
  metrics_30d: {
    clicks: number;
    impressions: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
  };
}

export interface AdSnapshot {
  ad_id: string;
  ad_strength: string;
  policy_summary_status: string;
  assets?: unknown[];
}

// === Regelinterface ===

export interface RuleContext {
  snapshot: AccountSnapshot;
  campaign?: CampaignSnapshot;
  adGroup?: AdGroupSnapshot;
  keyword?: KeywordSnapshot;
}

export interface RuleResult {
  fires: boolean;
  confidence: number;
  evidence: Evidence[];
  expected_impact: ImpactEstimate;
  assumptions: string[];
  proposed_actions: ProposedAction[];
}

export interface Rule {
  id: string;
  level: TreeLevel;
  scope: "account" | "campaign" | "ad_group" | "keyword";
  requires: ("campaigns" | "keywords" | "ads" | "auction_insights" | "change_history")[];
  evaluate(ctx: RuleContext): RuleResult | null; // null = regel skippas (saknar data)
}
