// Shared type-shape för Account Intelligence-vyn — speglar shape som
// ads-fetch-account-tree returnerar (samma struktur som CampaignTree.tsx läser).

export interface AIMetrics {
  clicks: number;
  impressions: number;
  cost_sek: number;
  conversions: number;
  conv_value_sek: number;
  ctr: number;
  cpa_sek: number | null;
  roas: number | null;
}

export interface AIKeyword {
  ad_group_id: string;
  criterion_id: string;
  text: string;
  match_type: string;
  status: string;
}

export interface AIAdGroup {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  keywords: AIKeyword[];
  ads: unknown[];
}

export interface AINegative {
  criterion_id: string;
  text: string;
  match_type: string;
}

export interface AICampaign {
  id: string;
  name: string;
  status: string;
  channel?: string;
  bidding_strategy_type?: string;
  daily_budget_sek: number;
  target_cpa_sek?: number | null;
  target_roas?: number | null;
  metrics_30d: AIMetrics;
  ad_groups: AIAdGroup[];
  negatives: AINegative[];
}

export interface CampaignTreeShape {
  campaigns: AICampaign[];
  fetched_at: string;
}
