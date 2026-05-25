export interface Project {
  id: string;
  user_id: string;
  name: string;
  company: string;
  domain: string | null;
  market: string;
  products: string | null;
  known_segments: string | null;
  competitors: string | null;
  created_at: string;
}

export type UniverseScale = "focused" | "broad" | "max" | "ultra";

export type UniverseDimension =
  | "produkt" | "tjanst" | "bransch" | "material" | "problem" | "losning"
  | "location" | "kundsegment" | "use_case" | "kommersiell" | "fraga" | "konkurrent";

export type UniverseIntent = "informational" | "commercial" | "transactional" | "navigational";
export type UniverseFunnel = "awareness" | "consideration" | "conversion";
export type UniversePriority = "high" | "medium" | "low" | "skip";
export type UniverseChannel = "SEO" | "Google Ads" | "Lokal SEO" | "Content" | "Landing Page";

export interface KeywordScore {
  final: number;
  components: {
    demand: number;
    intent: number;
    busRel: number;
    difficulty: number;
    icp: number;
  };
  revenue: {
    p10: number;
    p50: number;
    p90: number;
    payback_weeks: number | null;
  };
}

export interface UniverseKeyword {
  keyword: string;
  cluster: string;
  dimension: UniverseDimension;
  intent: UniverseIntent;
  funnelStage: UniverseFunnel;
  priority: UniversePriority;
  channel: UniverseChannel;
  recommendedLandingPage?: string;
  recommendedAdGroup?: string;
  contentIdea?: string;
  isNegative?: boolean;
  searchVolume?: number;
  cpc?: number;
  competition?: number;
  dataSource: "real" | "estimated";
  kd?: number;
  serpFeatures?: string[];
  topRankingDomains?: string[];
  competitorGap?: boolean;
  // v2 Keyword Intelligence
  score?: KeywordScore;
}

export interface KeywordOpportunity {
  type: "quick_dominance" | "service_gap" | "striking_distance_cluster" | "geo_opportunity" | "market_expansion" | "high_score_underserved" | "cluster_consolidation" | "account_gap" | "adgroup_candidate" | "negative_candidate" | "scalable_winner";
  title: string;
  description: string;
  keywords: string[];
  estimated_revenue_p50?: number;
  priority: "high" | "medium" | "low";
  scope?: { campaign_id?: string; campaign_name?: string };
  action_label?: string;
}

// Google Ads draft (one per ad group)
export interface AdDraft {
  id?: string;
  analysis_id?: string;
  ad_group: string;
  payload: {
    headlines: string[];
    descriptions: string[];
    path1: string;
    path2: string;
    final_url: string;
    sitelinks: { text: string; description1: string; description2: string; final_url: string }[];
    callouts: string[];
  };
}

// Strategy draft
export interface StrategyDraft {
  budgetSplit: { campaign: string; monthlyBudgetSek: number; rationale: string }[];
  biddingStrategy: { campaign: string; type: string; target: string; rationale: string }[];
  launchOrder: { phase: string; week: number; campaigns: string[]; focus: string }[];
  landingPageRequirements: { adGroup: string; h1: string; mustHaves: string[]; cta: string }[];
  seoVsAdsAdvice: string;
  quickWins: { keyword: string; action: string; why: string }[];
  risks: string[];
  kpis: { metric: string; target: string; timeframe: string }[];
}

export interface KeywordUniverse {
  scale: UniverseScale;
  generatedAt: string;
  totalKeywords: number;
  totalEnriched: number;
  cities: string[];
  keywords: UniverseKeyword[];
  opportunities?: KeywordOpportunity[];
  engineVersion?: string;
}

// Google Ads Keyword Planner — raw ideas fetched per project.
export interface KeywordPlannerIdea {
  id: string;
  project_id: string;
  run_id: string;
  seed_keyword: string | null;
  seed_url: string | null;
  keyword: string;
  language_code: string;
  location_code: string;
  avg_monthly_searches: number | null;
  competition: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  competition_index: number | null;
  low_top_of_page_bid_micros: number | null;
  high_top_of_page_bid_micros: number | null;
  fetched_at: string;
  created_at: string;
}

export interface KeywordPlannerRun {
  run_id: string;
  fetched_at: string;
  seed_keywords: string[];
  seed_url: string | null;
  count: number;
  ideas: KeywordPlannerIdea[];
}


export interface Customer {
  id: string;
  project_id: string;
  name: string;
  industry: string | null;
  sni: string | null;
  domain: string | null;
  revenue: string | null;
  frequency: string | null;
  products: string | null;
}

export interface Analysis {
  id: string;
  project_id: string;
  options: AnalysisOptions;
  result_json: AnalysisResult | null;
  scan_data_json: ScanData[] | null;
  created_at: string;
}

export interface AnalysisOptions {
  segmentAnalysis: boolean;
  keywordClusters: boolean;
  expansion: boolean;
  adsStructure: boolean;
  quickWins: boolean;
  webscan: boolean;
  keywordResearch: boolean;
  keywordUniverse: boolean;
  universeScale?: UniverseScale;
}

export type ResearchCategory = "Produkt" | "Tjänst" | "Geo" | "Pris" | "Fråga";
export type ResearchChannel = "SEO" | "Ads" | "Båda";
export type ResearchVolume = "<100" | "100-500" | "500-2000" | "2000+";
export type ResearchCpc = "Låg" | "Medium" | "Hög";
export type ResearchIntent = "Köp" | "Info" | "Nav";
export type ResearchUsage = "Landningssida" | "Blogg" | "Ads-grupp";

export interface ResearchKeyword {
  keyword: string;
  category: ResearchCategory;
  channel: ResearchChannel;
  volume: ResearchVolume;
  cpc: ResearchCpc;
  intent: ResearchIntent;
  usage: ResearchUsage;
  // Real metrics from DataForSEO (Sweden, sv)
  realVolume?: number;       // exact monthly searches
  realCpc?: number;          // SEK
  competition?: number;      // 0-1
  dataSource?: "real" | "estimated";
}

export interface ResearchCluster {
  cluster: string;
  segment: string;
  recommendedH1: string;
  metaDescription: string;
  urlSlug: string;
  keywords: ResearchKeyword[];
}

export interface ScanData {
  domain: string;
  company: string;
  whatTheyDo: string;
  languageTheyUse: string[];
  likelyNeeds: string[];
  searchIntentHints: string[];
}

export interface AnalysisResult {
  summary: string;
  totalKeywords: number;
  segments: Segment[];
  keywords: KeywordCluster[];
  expansion: ExpansionSegment[];
  adsStructure: AdsCampaign[];
  quickWins: QuickWin[];
  keywordResearch?: ResearchCluster[];
}

export interface Segment {
  name: string;
  sniCode: string;
  size: number;
  isNew: boolean;
  opportunityScore: number;
  howTheySearch: string[];
  languagePatterns: string[];
  useCases: string[];
  primaryKeywords: PrimaryKeyword[];
  insight: string;
}

export interface PrimaryKeyword {
  keyword: string;
  channel: string;
  volumeEstimate: string;
  difficulty: string;
  cpc: string;
  intent: string;
}

export interface KeywordCluster {
  cluster: string;
  segment: string;
  keywords: ClusterKeyword[];
}

export interface ClusterKeyword {
  keyword: string;
  type: string;
  channel: string;
  volumeEstimate: string;
  difficulty: string;
  cpc: string;
}

export interface ExpansionSegment {
  name: string;
  sniCode: string;
  why: string;
  language: string[];
  topKeywords: string[];
  opportunityScore: number;
}

export interface AdsCampaign {
  campaignName: string;
  segment: string;
  adGroups: AdsAdGroup[];
}

export interface AdsAdGroup {
  name: string;
  broadMatch: string[];
  phraseMatch: string[];
  exactMatch: string[];
  negatives: string[];
}

export interface QuickWin {
  keyword: string;
  reason: string;
  channel: string;
  volumeEstimate: string;
  intent: string;
  action: string;
}

export const MARKET_OPTIONS = [
  { value: "se-sv", label: "Sverige / Svenska" },
  { value: "se-en", label: "Sverige / Engelska" },
  { value: "nordic", label: "Norden" },
  { value: "global", label: "Global" },
];

export const SAMPLE_CUSTOMERS = `Företag\tBransch\tSNI\tDomän\tOmsättning\tOrderfrekvens\tProdukter köpta
Alfa Mekanik AB\tTillverkning\t25620\talfamekanik.se\t45 MSEK\tMånatlig\tKabelgenomföring plåt, DIN-skena fäste
Byggsystem Nord\tBygg\t41200\tbyggsystemnord.se\t120 MSEK\tVeckovis\tDistanshylsa M6, Batteribox aluminium
Teknikbolaget i Skåne\tElektronik\t26110\tteknikbolaget.se\t28 MSEK\tKvartalsvis\tKylflänsar aluminium, PCB-distanser
Nordic Power Solutions\tEnergi\t27110\tnordicpower.se\t95 MSEK\tMånatlig\tKabelstegar, Transformatorskåp
Industrimontage Väst AB\tInstallation\t43210\tindustrimontagevast.se\t67 MSEK\tVeckovis\tDIN-skenor, Kabelränna plåt
Scandia Components\tFordon\t29320\tscandiacomponents.se\t210 MSEK\tDaglig\tDistanshylsa rostfri, Fästelement special
GreenTech Fastigheter\tFastighet\t68320\tgreentechfast.se\t34 MSEK\tKvartalsvis\tVentilationsbeslag, Kabelgenomföring vägg
Maritime Systems AB\tMarin\t30110\tmaritimesystems.se\t55 MSEK\tMånatlig\tBatteribox marin, Korrosionsskydd`;

// =============================================================================
// Commercial Intelligence v1 — shared types
// Locked architecture: deterministic scoring + LLM narrative only.
// Mirror of Phase 0 database schema.
// =============================================================================

export type WorkspaceProfile =
  | "b2b_service"
  | "b2b_industrial"
  | "b2c_ecom"
  | "local_service"
  | "saas";

export type AggressivenessProfile = "conservative" | "balanced" | "aggressive";

export type LeadQualityTarget = "volume" | "balanced" | "quality";

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export type BuyerStage =
  | "unaware"
  | "problem_aware"
  | "solution_aware"
  | "product_aware"
  | "ready_to_buy";

export type LeadQualityProxy = "low" | "medium" | "high";

export type ScoreBand = "veto" | "low" | "medium" | "high" | "critical";

export type ConfidenceBand = "low" | "medium" | "high";

export type CommercialValueBand = "low" | "medium" | "high" | "critical";

export type RiskBand = "low" | "medium" | "high";

export type FulfillmentCapacity =
  | "unconstrained"
  | "constrained"
  | "at_capacity"
  | "suspended";

export type StrategicImportance =
  | "core"
  | "growth"
  | "defensive"
  | "exploratory";

// -----------------------------------------------------------------------------
// Evidence + claims
// -----------------------------------------------------------------------------

export interface Claim {
  field: string;
  value: unknown;
  source: string;            // e.g. "gsc", "ga4", "semrush", "operator", "model"
  source_id?: string;
  observed_at?: string;      // ISO timestamp
  freshness_days?: number;
  confidence?: number;       // 0..1
}

export interface EvidenceRef {
  id: string;
  source: string;            // "gsc" | "ga4" | "google_ads" | "semrush" | "serp" | "operator" | "model" | ...
  source_id?: string;
  url?: string;
  excerpt?: string;
  observed_at?: string;
  freshness_days?: number;
}

// -----------------------------------------------------------------------------
// Intelligence verdict (per keyword) — output of Commercial Intent Engine
// -----------------------------------------------------------------------------

export interface ValueDistribution {
  p10: number;
  p50: number;
  p90: number;
  currency: string;
}

export interface IntelligenceVerdict {
  keyword: string;
  normalized_keyword: string;
  cluster_id?: string;
  search_intent: SearchIntent;
  buyer_stage: BuyerStage;
  commercial_intent_score: number;       // 0..1
  business_relevance_score: number;      // 0..1
  conversion_likelihood: number;         // 0..1
  serp_competitiveness: number;          // 0..1
  commoditization_score: number;         // 0..1
  lead_quality_proxy: LeadQualityProxy;
  suggested_acquisition_approach: string;
  estimated_commercial_value: ValueDistribution;
  confidence: number;                    // 0..1
  evidence: EvidenceRef[];
  model_version: string;
  signals_version: string;
  computed_at: string;
}

// -----------------------------------------------------------------------------
// Opportunity scoring v1 — locked component set
// -----------------------------------------------------------------------------

export type ScoreComponentName =
  | "buyer_intent"
  | "business_fit"
  | "conversion_likelihood"
  | "serp_weakness"
  | "commercial_value"
  | "historical_performance"
  | "strategic_value"
  | "operational_feasibility"
  | "competition_quality"
  | "landing_page_fit";

export type OpportunityScoreComponents = Record<ScoreComponentName, number>; // each 0..1

export interface ComponentContribution {
  component: ScoreComponentName;
  raw_value: number;                    // 0..1
  weight: number;                       // 0..100 (profile-derived; sums to 100)
  points_contributed: number;           // raw_value * weight
  rank: number;                         // 1-based after sorting by points_contributed desc
  reason_codes: string[];               // registry-controlled
  supporting_signals: EvidenceRef[];
  delta_vs_profile_baseline?: number;   // optional context for narrative
}

export interface ScoreFreshness {
  oldest_signal_days?: number;
  newest_signal_days?: number;
  per_component?: Partial<Record<ScoreComponentName, number>>; // days
}

export interface LearningAdjustment {
  applied: number;                      // bounded ±10
  reason: string;
  n: number;                            // sample size
  cluster_family?: string;
  suggested_acquisition_approach?: string;
}

export interface ExpectedImpact {
  p10: number;
  p50: number;
  p90: number;
  currency: string;
  horizon_days: number;
}

export interface RiskAssessment {
  band: RiskBand;
  drivers: string[];
}

export interface OpportunityScore {
  scope_kind: "keyword" | "cluster" | "opportunity";
  scope_id: string;
  score: number;                        // 0..100
  score_band: ScoreBand;
  confidence: number;                   // 0..1
  confidence_band: ConfidenceBand;
  components: OpportunityScoreComponents;
  weights_applied: Record<ScoreComponentName, number>;
  multipliers_applied: Record<string, number>;
  vetoes_triggered: string[];
  contribution_trace: ComponentContribution[];
  freshness: ScoreFreshness;
  learning_adjustment?: LearningAdjustment;
  expected_impact?: ExpectedImpact;
  risk?: RiskAssessment;
  workspace_profile: WorkspaceProfile;
  model_version: string;
  signals_version: string;
  computed_at: string;
}

// -----------------------------------------------------------------------------
// DecisionContext (Phase C) — per-action enrichment for ContextSheet
// -----------------------------------------------------------------------------

export interface MetricDelta {
  metric: string;                       // e.g. "ctr", "cpc", "impressions"
  from?: number;
  to?: number;
  delta?: number;
  delta_pct?: number;
  unit?: string;
  window_days?: number;
  source: string;
}

export interface CausalSignal {
  id: string;
  label: string;
  description?: string;
  metric_delta?: MetricDelta;
  strength: number;                     // 0..1
  evidence: EvidenceRef[];
}

export interface RelatedSignal {
  id: string;
  label: string;
  source: string;
  relevance: number;                    // 0..1
  evidence: EvidenceRef[];
}

export interface ChangeEvent {
  id: string;
  kind: string;                         // "ads_mutation" | "content_publish" | "site_change" | "operator_action" | ...
  label: string;
  occurred_at: string;
  actor?: string;
  url?: string;
}

export interface AnalogRef {
  id: string;
  label: string;
  cluster_family?: string;
  suggested_acquisition_approach?: string;
  n: number;
  mean_uplift_pct?: number;
  variance?: number;
  scope: "project_only" | "org_only" | "network";
}

export interface DecisionConfidence {
  value: number;                        // 0..1
  band: ConfidenceBand;
  gate_triggers: string[];              // e.g. "low_coverage", "stale_signals"
}

export type NarrativeStatus = "generated" | "skipped" | "failed" | "pending";

export interface DecisionContext {
  id?: string;
  project_id: string;
  action_item_id?: string;
  ads_change_proposal_id?: string;
  scope: {
    kind: string;
    ids: string[];
  };
  why_this_matters: string | null;
  narrative_status: NarrativeStatus;
  what_changed: MetricDelta[];
  causal_signals: CausalSignal[];
  related_signals: RelatedSignal[];
  recent_changes: ChangeEvent[];
  historical_analogs: AnalogRef[];
  expected_impact?: ExpectedImpact;
  risk?: RiskAssessment;
  confidence: DecisionConfidence;
  evidence: EvidenceRef[];
  recommended_next_step: string | null;
  inputs_hash: string;
  model_version: string;
  signals_version: string;
  generated_at: string;
}

// -----------------------------------------------------------------------------
// Operator controls + learnings + business model
// -----------------------------------------------------------------------------

export type OperatorControlKind =
  | "theme_boost"
  | "theme_deprioritize"
  | "strategic_lock"
  | "veto"
  | "capacity"
  | "approach_override"
  | "mute";

export interface OperatorControl {
  id: string;
  project_id: string;
  control_kind: OperatorControlKind;
  scope: {
    theme_id?: string;
    cluster_id?: string;
    opportunity_id?: string;
    service_id?: string;
  };
  value: Record<string, unknown>;
  reason?: string;
  active: boolean;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OutcomeLearning {
  id: string;
  project_id: string;
  cluster_family: string;
  suggested_acquisition_approach: string;
  action_category: string;
  n: number;
  mean_uplift_pct?: number;
  variance?: number;
  last_updated: string;
  learning_scope: "project_only" | "org_only" | "network";
  share_anonymized: boolean;
  model_version: string;
  signals_version: string;
}

export interface ProjectBusinessModel {
  project_id: string;
  workspace_profile: WorkspaceProfile;
  aggressiveness_profile: AggressivenessProfile;
  lead_quality_target: LeadQualityTarget;
  service_priority: Record<string, number>;             // 0..1
  service_margin_pct: Record<string, number>;
  service_deal_size_band: Record<string, "small" | "mid" | "large" | "enterprise">;
  close_rate_est: Record<string, number>;               // 0..1
  ltv_multiplier: Record<string, number>;               // 1..3
  fulfillment_capacity: Record<string, FulfillmentCapacity>;
  strategic_importance: Record<string, StrategicImportance>;
  created_at: string;
  updated_at: string;
}

