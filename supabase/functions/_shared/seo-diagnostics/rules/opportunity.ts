import type { SeoRule } from "../types.ts";
import { monthlyUplift, isBrandTerm } from "../utils.ts";

// REGEL 6: striking_distance
export const strikingDistance: SeoRule = {
  id: "striking_distance",
  category: "opportunity",
  scope: "site",
  requires: ["gsc", "universe"],
  evaluate(snapshot) {
    if (!snapshot.gsc) return null;

    const strikers = snapshot.gsc.rows_28d
      .filter(
        (r) =>
          r.position >= 4 &&
          r.position <= 15 &&
          r.impressions > 100 &&
          !isBrandTerm(r.keyword, snapshot.goals?.brand_terms ?? [])
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    if (strikers.length < 2) return null;

    const totalUplift = strikers.reduce(
      (sum, r) => sum + monthlyUplift(r.impressions / 30, r.position, 3, snapshot.goals),
      0
    );

    return {
      fires: true,
      confidence: 0.8,
      severity: strikers.length > 5 ? "critical" : "warn",
      title: `${strikers.length} sökord på position 4-15 — lättaste snabba klättringen`,
      what_happens: `${strikers.length} sökord rankar strax utanför topp 3. Liten förbättring ger stor trafikökning.`,
      why: "Position 1-3 tar 75% av alla klick. Att flytta från position 8 till 3 ger 4× mer trafik.",
      scope_ref: strikers.slice(0, 5).map((r) => ({ id: r.keyword, name: r.keyword })),
      evidence: [
        { source: "gsc", metric: "striking_distance_count", value: strikers.length, period: "28d" },
        { source: "gsc", metric: "top_keyword", value: strikers[0].keyword, period: "28d" },
        { source: "gsc", metric: "top_keyword_position", value: strikers[0].position.toFixed(1), period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(totalUplift * 0.25),
        mid: Math.round(totalUplift * 0.5),
        high: totalUplift,
        horizon_days: 60,
        reasoning: `${strikers.length} sökord × genomsnittlig uplift från position ${(strikers.reduce((s, r) => s + r.position, 0) / strikers.length).toFixed(0)} till 3.`,
      },
      proposed_actions: [
        {
          kind: "update_content",
          label: "Förstärk topp-5 striking distance-sidor",
          detail: `Prioritera "${strikers[0].keyword}" (pos ${strikers[0].position.toFixed(0)}, ${strikers[0].impressions} imp/mån).`,
          effort: "medel",
          steps: [
            "Lägg till 300-500 ord som täcker relaterade frågor",
            "Lägg till FAQ-block med 4-6 long-tail-varianter",
            "Bygg 2-3 interna länkar från starka sidor",
            "Kontrollera att intenten matchar sidans innehåll 100%",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 7: competitor_gap_quick_win
export const competitorGapQuickWin: SeoRule = {
  id: "competitor_gap_quick_win",
  category: "opportunity",
  scope: "cluster",
  requires: ["universe"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c) return null;

    const quickWinKws = c.keywords.filter(
      (k) => k.competitorGap && (k.kd ?? 100) < 40 && (k.searchVolume ?? 0) > 50
    );

    if (quickWinKws.length < 2) return null;

    const totalVolume = quickWinKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
    const uplift = monthlyUplift(totalVolume, 20, 5, snapshot.goals);

    return {
      fires: true,
      confidence: 0.7,
      severity: quickWinKws.length > 5 ? "critical" : "warn",
      title: `${quickWinKws.length} competitor gaps du kan stänga snabbt i "${c.name}"`,
      what_happens: `Konkurrenter rankar för ${quickWinKws.length} sökord med KD<40 i "${c.name}" — du saknar sidorna.`,
      why: "KD<40 är stängbara med nytt innehåll inom 60-90d om du har topical authority i klustret.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "gap_keywords_count", value: quickWinKws.length, period: "28d" },
        {
          source: "universe",
          metric: "avg_kd",
          value: (quickWinKws.reduce((s, k) => s + (k.kd ?? 35), 0) / quickWinKws.length).toFixed(0),
          period: "28d",
        },
        { source: "universe", metric: "gap_volume", value: totalVolume, period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(uplift * 0.2),
        mid: Math.round(uplift * 0.45),
        high: uplift,
        horizon_days: 90,
        reasoning: `Estimerat baserat på ${quickWinKws.length} sökord med total volym ${totalVolume}/mån vid position 5.`,
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: `Skapa sidor för ${quickWinKws.length} competitor gaps`,
          detail: `Börja med "${quickWinKws.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))[0].keyword}" — bäst volym/KD-ratio.`,
          effort: "hög",
          steps: [
            "Analysera konkurrentens sida för varje gap-sökord",
            "Bygg en bättre sida (djupare, bättre struktur, FAQ)",
            "Länka från pillar-sidan i klustret",
            "Skaffa 1-2 backlinks från branschsajter",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 8: untapped_zero_volume_b2b
export const untappedZeroVolumeB2b: SeoRule = {
  id: "untapped_zero_volume_b2b",
  category: "opportunity",
  scope: "cluster",
  requires: ["universe"],
  evaluate(_snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c) return null;

    const zeroVolTransKws = c.keywords.filter(
      (k) =>
        (k.searchVolume === 0 || k.searchVolume === null || k.searchVolume === undefined) &&
        (k.intent === "transactional" || k.intent === "commercial") &&
        !k.isNegative
    );

    if (zeroVolTransKws.length < 3) return null;

    return {
      fires: true,
      confidence: 0.5,
      severity: "info",
      title: `${zeroVolTransKws.length} zero-volume köpsökord i "${c.name}" — B2B-guld`,
      what_happens: `${zeroVolTransKws.length} sökord visas som 0 volym men har transactional intent. I B2B söker den som söker dessa OM att köpa.`,
      why: "B2B-sökord med 0 volym konverterar ofta 5-10× bättre än generiska termer. Personen som söker vet vad de vill ha.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "zero_vol_transactional", value: zeroVolTransKws.length, period: "28d" },
        {
          source: "universe",
          metric: "examples",
          value: zeroVolTransKws.slice(0, 3).map((k) => k.keyword).join(", "),
          period: "28d",
        },
      ],
      expected_impact: {
        metric: "conversions",
        direction: "up",
        low: 1,
        mid: 3,
        high: 8,
        horizon_days: 90,
        reasoning: "Zero-volume transactional i B2B = hög konverteringsrate om sidan matchar intent perfekt.",
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: "Skapa hyperfokuserade landningssidor",
          detail: "Skapa dedikerade sidor för de 3 viktigaste zero-volume transactional-sökorden.",
          effort: "medel",
          steps: [
            "Prioritera sökord med tydligast köpintent",
            "Bygg kort, fokuserad sida: problem → lösning → bevis → CTA",
            "Inga generiska texter — svar på exakt vad personen söker",
            "Mät med GA4-konverteringsevent",
          ],
          creates_action_item: false,
        },
      ],
    };
  },
};

// REGEL 9: seasonal_opportunity_approaching
export const seasonalOpportunityApproaching: SeoRule = {
  id: "seasonal_opportunity_approaching",
  category: "opportunity",
  scope: "cluster",
  requires: ["universe"],
  evaluate(_snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c) return null;

    const trendingKws = c.keywords.filter((k) => {
      const trend = (k as any).trend_json;
      if (!trend || !Array.isArray(trend) || trend.length < 4) return false;
      const recent = trend
        .slice(-2)
        .reduce((s: number, v: any) => s + (Number(v?.search_volume) || 0), 0);
      const earlier = trend
        .slice(-4, -2)
        .reduce((s: number, v: any) => s + (Number(v?.search_volume) || 0), 0);
      return earlier > 0 && recent > earlier * 1.2;
    });

    if (trendingKws.length < 2) return null;

    return {
      fires: true,
      confidence: 0.65,
      severity: "warn",
      title: `${trendingKws.length} sökord i "${c.name}" trendar uppåt — skapa innehåll nu`,
      what_happens: `${trendingKws.length} sökord visar 20%+ volymökning senaste 2 månaderna. Innehåll skapas nu hinner rankas innan toppen.`,
      why: "SEO-innehåll tar 6-12 veckor att rankas. Väntar du till toppen har du missat fönstret.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "trending_keywords", value: trendingKws.length, period: "28d" },
        { source: "universe", metric: "top_trending", value: trendingKws[0]?.keyword ?? "", period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 100,
        mid: 400,
        high: 1200,
        horizon_days: 90,
        reasoning: "Tidigt innehåll för trendande sökord får länkauktoritet och rankning innan konkurrenter reagerar.",
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: "Skapa innehåll för trendande sökord nu",
          detail: `Prioritera innehåll för "${trendingKws[0]?.keyword}" och ${trendingKws.length - 1} andra trendande sökord.`,
          effort: "medel",
          steps: [
            "Generera content brief för top-trendande sökord",
            "Publicera inom 2 veckor",
            "Dela på relevanta kanaler för snabb indexering",
            "Bygg interna länkar från klustrets pillar",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 10: content_brief_value_gap
export const contentBriefValueGap: SeoRule = {
  id: "content_brief_value_gap",
  category: "opportunity",
  scope: "cluster",
  requires: ["universe"],
  evaluate(_snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || c.has_brief) return null;
    if (c.estimated_value_sek < 10000) return null;

    return {
      fires: true,
      confidence: 0.85,
      severity: c.estimated_value_sek > 50000 ? "critical" : "warn",
      title: `"${c.name}" har ${c.estimated_value_sek.toLocaleString("sv-SE")} kr/mån i potential men inget brief`,
      what_happens: `Klustret med estimerat värde ${c.estimated_value_sek.toLocaleString("sv-SE")} kr/mån saknar content brief — ingen contentstrategi är satt.`,
      why: "Utan brief skrivs innehållet utan SEO-struktur, intent-match eller internt länknätverk.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "computed", metric: "estimated_monthly_value", value: c.estimated_value_sek, period: "28d" },
        { source: "universe", metric: "keyword_count", value: c.keywords.length, period: "28d" },
        { source: "universe", metric: "total_volume", value: c.total_volume, period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(c.estimated_value_sek * 0.1),
        mid: Math.round(c.estimated_value_sek * 0.25),
        high: Math.round(c.estimated_value_sek * 0.5),
        horizon_days: 90,
        reasoning: "Brief säkrar SEO-struktur och ökar sannolikhet för ranking med 30-50%.",
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: `Generera content brief för "${c.name}"`,
          detail: "Gå till Briefs-fliken och generera ett AI-drivet brief för klustret.",
          effort: "låg",
          steps: [
            "Öppna Briefs-tabben i Sökord & innehåll",
            `Välj klustret "${c.name}"`,
            "Klicka Generera brief",
            "Granska och tilldela skribent",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

export const opportunityRules: SeoRule[] = [
  strikingDistance,
  competitorGapQuickWin,
  untappedZeroVolumeB2b,
  seasonalOpportunityApproaching,
  contentBriefValueGap,
];
