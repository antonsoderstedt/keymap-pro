/**
 * Genererar konkreta åtgärdsförslag per kluster med förväntad SEK/valuta-effekt.
 *
 * Heuristik baserat på klustrets dominerande intent, channel, funnel-steg,
 * konkurrensgap, KD och genomsnittlig CPC/volym.
 */
import type { KeywordUniverse, UniverseKeyword } from "./types";
import {
  estimateKeywordValue,
  estimatePositionUplift,
  DEFAULT_REVENUE,
  type RevenueSettings,
} from "./revenue";

export type ClusterActionType =
  | "landing_page"
  | "content_hub"
  | "bid_strategy"
  | "negative_keywords"
  | "tech_seo"
  | "competitor_gap"
  | "local_seo"
  | "ad_copy"
  | "internal_linking";

export interface ClusterAction {
  id: string;
  cluster: string;
  title: string;
  type: ClusterActionType;
  channel: string;
  priority: "kritisk" | "hög" | "medel" | "låg";
  effort: "låg" | "medel" | "hög";
  expected_value: number;          // årligt värde i projektets valuta
  uplift_value: number;             // potential om vi lyckas (toppos 3)
  rationale: string;
  steps: string[];
  top_keywords: string[];
  metrics: {
    keyword_count: number;
    total_volume: number;
    avg_position: number | null;
    avg_kd: number | null;
    avg_cpc: number | null;
    competitor_gap_count: number;
  };
}

interface ClusterAgg {
  cluster: string;
  keywords: UniverseKeyword[];
  totalVolume: number;
  avgPos: number | null;
  avgKd: number | null;
  avgCpc: number | null;
  intentMix: Record<string, number>;
  channelMix: Record<string, number>;
  funnelMix: Record<string, number>;
  hasLocation: boolean;
  competitorGap: number;
  estValue: number;
  upliftValue: number;
}

function aggregateClusters(universe: KeywordUniverse, s: RevenueSettings): ClusterAgg[] {
  const map = new Map<string, UniverseKeyword[]>();
  for (const kw of universe.keywords || []) {
    if (kw.isNegative) continue;
    const c = kw.cluster || "Övrigt";
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(kw);
  }

  const result: ClusterAgg[] = [];
  for (const [cluster, kws] of map.entries()) {
    let posSum = 0, posCount = 0, kdSum = 0, kdCount = 0, cpcSum = 0, cpcCount = 0;
    let totalVolume = 0;
    const intentMix: Record<string, number> = {};
    const channelMix: Record<string, number> = {};
    const funnelMix: Record<string, number> = {};
    let hasLocation = false;
    let gap = 0;
    let estValue = 0;
    let upliftValue = 0;

    for (const k of kws) {
      const vol = k.searchVolume ?? 0;
      const pos = 20; // okänd live-position — anta sida 2 som default
      totalVolume += vol;
      if (k.searchVolume) { posSum += pos; posCount++; }
      if (typeof k.kd === "number") { kdSum += k.kd; kdCount++; }
      if (typeof k.cpc === "number") { cpcSum += k.cpc; cpcCount++; }
      intentMix[k.intent] = (intentMix[k.intent] || 0) + 1;
      channelMix[k.channel] = (channelMix[k.channel] || 0) + 1;
      funnelMix[k.funnelStage] = (funnelMix[k.funnelStage] || 0) + 1;
      if (k.dimension === "location") hasLocation = true;
      if (k.competitorGap) gap++;
      estValue += estimateKeywordValue(vol, pos, s);
      upliftValue += estimatePositionUplift(vol, pos, 3, s);
    }

    result.push({
      cluster,
      keywords: kws,
      totalVolume,
      avgPos: posCount ? Math.round((posSum / posCount) * 10) / 10 : null,
      avgKd: kdCount ? Math.round((kdSum / kdCount) * 10) / 10 : null,
      avgCpc: cpcCount ? Math.round((cpcSum / cpcCount) * 100) / 100 : null,
      intentMix, channelMix, funnelMix, hasLocation, competitorGap: gap,
      estValue: Math.round(estValue),
      upliftValue: Math.round(upliftValue),
    });
  }
  return result;
}

function dominantKey(mix: Record<string, number>): string {
  return Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function priorityFromValue(value: number): ClusterAction["priority"] {
  if (value >= 200_000) return "kritisk";
  if (value >= 75_000) return "hög";
  if (value >= 20_000) return "medel";
  return "låg";
}

/**
 * Huvudfunktion: returnerar en lista konkreta åtgärder per kluster.
 * Varje kluster kan generera flera åtgärder (landing + ads + tech t.ex.).
 */
export function generateClusterActions(
  universe: KeywordUniverse,
  settings: RevenueSettings = DEFAULT_REVENUE,
): ClusterAction[] {
  const aggs = aggregateClusters(universe, settings);
  const actions: ClusterAction[] = [];

  for (const a of aggs) {
    const dominantIntent = dominantKey(a.intentMix);
    const dominantChannel = dominantKey(a.channelMix);
    const dominantFunnel = dominantKey(a.funnelMix);
    const topKw = [...a.keywords]
      .sort((x, y) => (y.searchVolume || 0) - (x.searchVolume || 0))
      .slice(0, 5).map((k) => k.keyword);

    const baseMetrics = {
      keyword_count: a.keywords.length,
      total_volume: a.totalVolume,
      avg_position: a.avgPos,
      avg_kd: a.avgKd,
      avg_cpc: a.avgCpc,
      competitor_gap_count: a.competitorGap,
    };

    // 1) LANDING PAGE — kommersiell/transaktionell intent dominerar
    if (dominantIntent === "transactional" || dominantIntent === "commercial") {
      const value = Math.round(a.upliftValue * 0.6); // landing tar ~60% av uplift
      actions.push({
        id: `${a.cluster}-landing`,
        cluster: a.cluster,
        title: `Bygg/uppdatera landningssida för "${a.cluster}"`,
        type: "landing_page",
        channel: "SEO + Ads",
        priority: priorityFromValue(value),
        effort: a.keywords.length > 15 ? "hög" : "medel",
        expected_value: value,
        uplift_value: a.upliftValue,
        rationale: `${a.keywords.length} ord med ${dominantIntent === "transactional" ? "köp" : "kommersiell"}-intent och ${a.totalVolume.toLocaleString("sv-SE")} sökningar/mån — utan dedikerad landningssida tappar ni både organisk synlighet och kvalitetspoäng i Ads.`,
        steps: [
          `Skapa H1 baserat på primärt sökord: "${topKw[0] || a.cluster}"`,
          "Strukturera innehåll efter sökintent: problem → lösning → bevis → CTA",
          "Inkludera FAQ-block med 4-6 long-tail varianter från klustret",
          "Lägg interna länkar från relaterade kategorisidor",
          "Kör som final URL i motsvarande Google Ads-annonsgrupp",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }

    // 2) CONTENT HUB — informational + awareness
    if (dominantIntent === "informational" || dominantFunnel === "awareness") {
      const value = Math.round(a.estValue * 0.4 + a.upliftValue * 0.3);
      actions.push({
        id: `${a.cluster}-content`,
        cluster: a.cluster,
        title: `Content-hub: "${a.cluster}" som top-funnel`,
        type: "content_hub",
        channel: "SEO / Content",
        priority: priorityFromValue(value),
        effort: "hög",
        expected_value: value,
        uplift_value: Math.round(a.upliftValue * 0.5),
        rationale: `Stort informational-volym (${a.totalVolume.toLocaleString("sv-SE")} sökningar/mån) som idag inte fångas. En pillar + 3-5 cluster-artiklar bygger topical authority.`,
        steps: [
          "Skriv 1 pillar-artikel (2000+ ord) som täcker hela klustret",
          "Skriv 3-5 supporting-artiklar som länkar till pillar",
          "Använd FAQ schema markup för featured snippet-träff",
          "Internlinka från befintliga sidor med relevanta anchor texts",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }

    // 3) BID STRATEGY — Google Ads dominant + hög CPC eller många konkurrentgap
    if (dominantChannel === "Google Ads" && (a.avgCpc || 0) > 0) {
      const adsValue = Math.round(a.totalVolume * (settings.conversion_rate_pct / 100) * settings.avg_order_value * 0.15 * 12);
      actions.push({
        id: `${a.cluster}-bid`,
        cluster: a.cluster,
        title: `Justera budstrategi i Ads för "${a.cluster}"`,
        type: "bid_strategy",
        channel: "Google Ads",
        priority: priorityFromValue(adsValue),
        effort: "låg",
        expected_value: adsValue,
        uplift_value: adsValue,
        rationale: `Snitt-CPC ${a.avgCpc} ${settings.currency || "SEK"} på ${a.keywords.length} ord. Byt från bredmatchning till exakt + frasmatchning, sänk bud på low-intent och höj på top-konverterare.`,
        steps: [
          "Sätt målet till tROAS eller tCPA istället för max-klick",
          "Aktivera exakt + frasmatchning, pausa breda varianter",
          "Lägg negativa sökord baserat på söktermsrapport (senaste 90 dgr)",
          "Höj bud +20% på topp 3 konverterande sökord, sänk -30% på 0-konv över 30 dgr",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }

    // 4) NEGATIVES — informational+ads-blandning = budgetspill
    if (a.intentMix.informational > 2 && (a.channelMix["Google Ads"] || 0) > 0) {
      const wasteEstimate = Math.round((a.avgCpc || 5) * a.intentMix.informational * 50 * 12);
      actions.push({
        id: `${a.cluster}-neg`,
        cluster: a.cluster,
        title: `Negativa sökord för "${a.cluster}"`,
        type: "negative_keywords",
        channel: "Google Ads",
        priority: priorityFromValue(wasteEstimate),
        effort: "låg",
        expected_value: wasteEstimate,
        uplift_value: wasteEstimate,
        rationale: `${a.intentMix.informational} informational-ord i klustret riskerar att utlösa Ads-visningar utan köpintent — direkt budgetspill.`,
        steps: [
          "Lägg in informational triggers ('vad är', 'hur', 'guide') som negativa",
          "Granska söktermsrapport veckovis första månaden",
          "Sätt upp varning vid CPC > 2× snitt på enskilda termer",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }

    // 5) COMPETITOR GAP
    if (a.competitorGap >= 3) {
      const value = Math.round(a.upliftValue * 0.5);
      actions.push({
        id: `${a.cluster}-gap`,
        cluster: a.cluster,
        title: `Stäng konkurrentgap i "${a.cluster}" (${a.competitorGap} ord)`,
        type: "competitor_gap",
        channel: "SEO",
        priority: priorityFromValue(value),
        effort: "medel",
        expected_value: value,
        uplift_value: a.upliftValue,
        rationale: `Konkurrenter rankar för ${a.competitorGap} ord där ni saknas. Lägst hängande frukt: ord där minst 2 konkurrenter rankar och KD < 40.`,
        steps: [
          "Analysera vilka sidor konkurrenter har för dessa sökord",
          "Bygg motsvarande sida — bättre än bästa SERP-resultatet",
          "Skaffa 3-5 backlinks från branschsidor till nya sidan",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }

    // 6) LOCAL SEO
    if (a.hasLocation) {
      const localKws = a.keywords.filter((k) => k.dimension === "location");
      const localVol = localKws.reduce((s, k) => s + (k.searchVolume || 0), 0);
      const value = Math.round(localVol * 0.15 * (settings.conversion_rate_pct / 100) * settings.avg_order_value * 12);
      actions.push({
        id: `${a.cluster}-local`,
        cluster: a.cluster,
        title: `Lokal SEO för "${a.cluster}"`,
        type: "local_seo",
        channel: "Lokal SEO",
        priority: priorityFromValue(value),
        effort: "medel",
        expected_value: value,
        uplift_value: value,
        rationale: `${localKws.length} geo-modifierade sökord (${localVol.toLocaleString("sv-SE")} sökningar/mån). Lokala landningssidor + Google Business Profile är kritiskt.`,
        steps: [
          "Skapa city-sidor för topp 5 städer i klustret",
          "Optimera Google Business Profile med klustrets tjänster",
          "Bygg lokala citations (hitta.se, eniro.se, branschkataloger)",
        ],
        top_keywords: localKws.slice(0, 5).map((k) => k.keyword),
        metrics: baseMetrics,
      });
    }

    // 7) TECH SEO — hög KD + många ord = behöver teknisk grund
    if ((a.avgKd || 0) > 50 && a.keywords.length >= 5) {
      const value = Math.round(a.upliftValue * 0.25);
      actions.push({
        id: `${a.cluster}-tech`,
        cluster: a.cluster,
        title: `Teknisk SEO-grund för "${a.cluster}"`,
        type: "tech_seo",
        channel: "SEO",
        priority: priorityFromValue(value),
        effort: "medel",
        expected_value: value,
        uplift_value: value,
        rationale: `Hög konkurrens (KD ${a.avgKd}) — utan teknisk excellens (Core Web Vitals, schema, intern länkning) kommer ni inte rankas oavsett innehåll.`,
        steps: [
          "Säkerställ LCP < 2.5s, INP < 200ms, CLS < 0.1 på klusterets sidor",
          "Lägg Product/Service/FAQ schema beroende på sidtyp",
          "Bygg silo-struktur: hub → sub-pages → blog stöd",
        ],
        top_keywords: topKw,
        metrics: baseMetrics,
      });
    }
  }

  // Sortera på expected_value desc
  return actions.sort((a, b) => b.expected_value - a.expected_value);
}

export function actionTypeLabel(t: ClusterActionType): string {
  switch (t) {
    case "landing_page": return "Landningssida";
    case "content_hub": return "Content-hub";
    case "bid_strategy": return "Budstrategi";
    case "negative_keywords": return "Negativa sökord";
    case "tech_seo": return "Teknisk SEO";
    case "competitor_gap": return "Konkurrentgap";
    case "local_seo": return "Lokal SEO";
    case "ad_copy": return "Ad copy";
    case "internal_linking": return "Intern länkning";
  }
}
