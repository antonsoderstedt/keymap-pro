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
