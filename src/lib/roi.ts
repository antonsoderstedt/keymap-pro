/**
 * ROI Intelligence — kombinerar GA4 faktiskt intäktsvärde per sida
 * med GSC keyword/page-data och AI-genererade kluster.
 *
 * Resultat: monetärt värde per kluster, prioriteringspoäng och uplift-potential.
 */
import {
  estimateKeywordValue,
  estimatePositionUplift,
  estimatePageValueFromClicks,
  type RevenueSettings,
  DEFAULT_REVENUE,
} from "./revenue";

export interface Ga4Row {
  page: string;
  sessions: number;
  conversions: number;
  total_revenue: number;
  purchase_revenue: number;
}

export interface GscRow {
  keys: string[]; // [query, page] eller [page]
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ClusterKeyword {
  keyword: string;
  volume?: number;
  position?: number;
  intent?: string;
  url?: string;
}

export interface Cluster {
  name?: string;
  cluster?: string;
  intent?: string;
  keywords?: ClusterKeyword[];
}

export interface ClusterROI {
  name: string;
  intent?: string;
  keyword_count: number;
  total_volume: number;
  avg_position: number | null;
  /** Faktisk intäkt (GA4) mappad till sidor som rankar för klustrets sökord. */
  actual_revenue_sek: number;
  /** Estimerat årsvärde på nuvarande positioner. */
  estimated_value_sek: number;
  /** Potentiell uplift om alla ord lyfts till topp 3. */
  uplift_potential_sek: number;
  /** Prioritetspoäng 0-100 baserat på värde × uplift × storlek. */
  priority_score: number;
  priority: "kritisk" | "hög" | "medel" | "låg";
  top_keywords: ClusterKeyword[];
}

/** Normalisera URL för matchning (strip protocol, www, trailing slash, query). */
export function normalizeUrl(u?: string): string {
  if (!u) return "";
  try {
    const url = u.startsWith("http") ? new URL(u) : new URL("https://x" + (u.startsWith("/") ? u : "/" + u));
    return url.pathname.replace(/\/$/, "").toLowerCase() || "/";
  } catch {
    return u.split("?")[0].replace(/\/$/, "").toLowerCase();
  }
}

/** Bygg sida → faktiskt intäkt (SEK) från GA4-rader. */
export function buildPageRevenueIndex(ga4Rows: Ga4Row[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (const r of ga4Rows) {
    const key = normalizeUrl(r.page);
    const rev = r.total_revenue || r.purchase_revenue || 0;
    idx[key] = (idx[key] || 0) + rev;
  }
  return idx;
}

/** Bygg keyword → {pos, clicks, page} från GSC-rader (page+query dimensions). */
export function buildKeywordIndex(
  gscRows: GscRow[],
): Record<string, { position: number; clicks: number; page: string }> {
  const idx: Record<string, { position: number; clicks: number; page: string }> = {};
  for (const r of gscRows) {
    const query = (r.keys?.[0] || "").toLowerCase().trim();
    if (!query) continue;
    const page = r.keys?.[1] ? normalizeUrl(r.keys[1]) : "";
    const cur = idx[query];
    // ta raden med flest klick per sökord
    if (!cur || r.clicks > cur.clicks) {
      idx[query] = { position: r.position || 100, clicks: r.clicks || 0, page };
    }
  }
  return idx;
}

export function computeClusterROI(
  cluster: Cluster,
  keywordIdx: Record<string, { position: number; clicks: number; page: string }>,
  pageRevenueIdx: Record<string, number>,
  settings: RevenueSettings = DEFAULT_REVENUE,
): ClusterROI {
  const keywords = cluster.keywords || [];
  let totalVolume = 0;
  let posSum = 0;
  let posCount = 0;
  let estValue = 0;
  let uplift = 0;
  let actualRev = 0;
  const seenPages = new Set<string>();

  for (const kw of keywords) {
    const key = (kw.keyword || "").toLowerCase().trim();
    const live = keywordIdx[key];
    const pos = live?.position ?? kw.position ?? 20;
    const vol = kw.volume || 0;
    totalVolume += vol;
    if (pos > 0) {
      posSum += pos;
      posCount += 1;
    }
    estValue += estimateKeywordValue(vol, pos, settings);
    uplift += estimatePositionUplift(vol, pos, 3, settings);

    // Faktisk intäkt: ta från GA4 om sidan rankar för sökordet
    const page = live?.page || normalizeUrl(kw.url);
    if (page && !seenPages.has(page) && pageRevenueIdx[page]) {
      actualRev += pageRevenueIdx[page];
      seenPages.add(page);
    }

    // Klick-baserat värde-fallback om ingen GA4 men har GSC-klick
    if (!pageRevenueIdx[page] && live?.clicks) {
      actualRev += estimatePageValueFromClicks(live.clicks, settings);
    }
  }

  const valueSignal = Math.max(actualRev, estValue);
  const upliftSignal = uplift;
  // Prioritetspoäng: log-skala på värde + uplift + klusterstorlek-bonus
  const score = Math.min(
    100,
    Math.round(
      (Math.log10(Math.max(1, valueSignal)) * 8) +
        (Math.log10(Math.max(1, upliftSignal)) * 6) +
        Math.min(20, keywords.length * 1.5),
    ),
  );

  let priority: ClusterROI["priority"] = "låg";
  if (score >= 75) priority = "kritisk";
  else if (score >= 55) priority = "hög";
  else if (score >= 35) priority = "medel";

  return {
    name: cluster.name || cluster.cluster || "Namnlöst kluster",
    intent: cluster.intent,
    keyword_count: keywords.length,
    total_volume: totalVolume,
    avg_position: posCount ? Math.round((posSum / posCount) * 10) / 10 : null,
    actual_revenue_sek: Math.round(actualRev),
    estimated_value_sek: Math.round(estValue),
    uplift_potential_sek: Math.round(uplift),
    priority_score: score,
    priority,
    top_keywords: keywords.slice(0, 5),
  };
}

export function computeRoiOverview(args: {
  clusters: Cluster[];
  ga4Rows: Ga4Row[];
  gscRows: GscRow[];
  settings?: RevenueSettings;
}): {
  clusters: ClusterROI[];
  total_actual_revenue_sek: number;
  total_estimated_value_sek: number;
  total_uplift_potential_sek: number;
} {
  const settings = args.settings || DEFAULT_REVENUE;
  const pageIdx = buildPageRevenueIndex(args.ga4Rows);
  const kwIdx = buildKeywordIndex(args.gscRows);
  const enriched = args.clusters
    .map((c) => computeClusterROI(c, kwIdx, pageIdx, settings))
    .sort((a, b) => b.priority_score - a.priority_score);

  return {
    clusters: enriched,
    total_actual_revenue_sek: enriched.reduce((s, c) => s + c.actual_revenue_sek, 0),
    total_estimated_value_sek: enriched.reduce((s, c) => s + c.estimated_value_sek, 0),
    total_uplift_potential_sek: enriched.reduce((s, c) => s + c.uplift_potential_sek, 0),
  };
}

export function priorityColor(p: ClusterROI["priority"]): string {
  switch (p) {
    case "kritisk":
      return "hsl(var(--destructive))";
    case "hög":
      return "hsl(var(--primary))";
    case "medel":
      return "hsl(var(--accent-foreground, var(--primary)))";
    default:
      return "hsl(var(--muted-foreground))";
  }
}
