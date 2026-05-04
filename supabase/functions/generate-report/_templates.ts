// Standardiserade rapportmallar — delas av Edge function & frontend (re-exporteras nedan).
// Output:
//   {
//     summary:  { headline, period?, kpis: [{label, value, sub?, trend?}], bullets: string[] },
//     tables:   [{ id, title, columns: [{key,label,format?}], rows: any[] }],
//     charts:   [{ id, type: 'bar'|'line'|'pie'|'area', title, data: any[], xKey, series: [{key,label,color?}] }],
//   }

type Section = { status: string; reason?: string; data?: any };
type Payload = {
  report_type: string;
  sections?: Record<string, Section>;
  trend?: any;
  generated_at?: string;
  overall_status?: string;
};

const PALETTE = ["#b8f542", "#5ab0ff", "#ff7a59", "#c084fc", "#facc15", "#34d399", "#f472b6"];

function fmtSek(n: number | undefined | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kr`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k kr`;
  return `${Math.round(n)} kr`;
}
function fmtPct(n: number | undefined | null, digits = 1): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
function fmtNum(n: number | undefined | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function buildTemplate(payload: Payload) {
  switch (payload.report_type) {
    case "share_of_voice":  return tplSov(payload);
    case "auction_insights": return tplAuction(payload);
    case "yoy":              return tplYoy(payload);
    case "roi":              return tplRoi(payload);
    default:                 return tplGeneric(payload);
  }
}

// ---------- Share of Voice ----------
function tplSov(p: Payload) {
  const d = p.sections?.share_of_voice?.data;
  if (!d) return empty("Share of Voice", p.sections?.share_of_voice?.reason);

  const competitors = (d.competitors || []) as any[];
  const yourSov = Number(d.sov_pct || 0);
  const sortedCompetitors = [...competitors].sort((a, b) => (b.sov_pct || 0) - (a.sov_pct || 0));
  const top = sortedCompetitors.slice(0, 6);
  const otherSov = Math.max(0, 100 - yourSov - top.reduce((s, c) => s + (c.sov_pct || 0), 0));

  return {
    summary: {
      headline: `Du har ${yourSov.toFixed(1)}% Share of Voice i din nisch`,
      period: d.period,
      kpis: [
        { label: "Din SoV", value: `${yourSov.toFixed(1)}%`, sub: d.your_domain },
        { label: "Dina visningar", value: fmtNum(d.your_impressions) },
        { label: "Marknadsstorlek", value: fmtNum(d.total_market_impressions), sub: "totala visningar" },
        { label: "Konkurrenter", value: `${competitors.length}`, sub: "spårade" },
      ],
      bullets: [
        sortedCompetitors[0]
          ? `Största konkurrent: ${sortedCompetitors[0].domain} (${(sortedCompetitors[0].sov_pct || 0).toFixed(1)}%)`
          : "Inga konkurrenter identifierade",
        yourSov < 10 ? "SoV under 10% — stor tillväxtpotential" : yourSov < 25 ? "Etablerad men utmanare" : "Marknadsledare i nischen",
      ],
    },
    charts: [
      {
        id: "sov_split",
        type: "pie",
        title: "Marknadsandel per aktör",
        xKey: "name",
        series: [{ key: "value", label: "SoV %" }],
        data: [
          { name: d.your_domain || "Du", value: yourSov, color: PALETTE[0] },
          ...top.map((c, i) => ({ name: c.domain, value: c.sov_pct || 0, color: PALETTE[(i + 1) % PALETTE.length] })),
          ...(otherSov > 0.5 ? [{ name: "Övriga", value: otherSov, color: "#3a3a3a" }] : []),
        ],
      },
      {
        id: "sov_bars",
        type: "bar",
        title: "Visningar per aktör (top 8)",
        xKey: "name",
        series: [{ key: "impressions", label: "Visningar", color: PALETTE[0] }],
        data: [
          { name: d.your_domain || "Du", impressions: d.your_impressions || 0 },
          ...top.map((c) => ({ name: c.domain, impressions: c.impressions || 0 })),
        ],
      },
    ],
    tables: [
      {
        id: "competitors",
        title: "Konkurrenter rankade efter SoV",
        columns: [
          { key: "domain", label: "Domän" },
          { key: "sov_pct", label: "SoV %", format: "pct1" },
          { key: "impressions", label: "Visningar", format: "num" },
          { key: "clicks", label: "Klick", format: "num" },
          { key: "avg_position", label: "Snitt-pos", format: "decimal1" },
        ],
        rows: sortedCompetitors,
      },
    ],
  };
}

// ---------- Auction Insights ----------
function tplAuction(p: Payload) {
  const d = p.sections?.auction_insights?.data;
  if (!d) return empty("Auction Insights", p.sections?.auction_insights?.reason);

  const totals = d.totals || {};
  const competitors = (d.competitors || []) as any[];
  const campaigns = (d.campaigns || []) as any[];
  const sortedComp = [...competitors].sort((a, b) => (b.impressionShare || 0) - (a.impressionShare || 0)).slice(0, 10);

  return {
    summary: {
      headline: `Genomsnittlig Impression Share: ${(((totals.avg_is) || 0) * 100).toFixed(0)}%`,
      period: d.period,
      kpis: [
        { label: "Avg IS", value: `${((totals.avg_is || 0) * 100).toFixed(0)}%` },
        { label: "Förlorad p.g.a. budget", value: `${((totals.avg_lost_budget || 0) * 100).toFixed(0)}%` },
        { label: "Förlorad p.g.a. rank", value: `${((totals.avg_lost_rank || 0) * 100).toFixed(0)}%` },
        { label: "Konkurrenter", value: `${competitors.length}` },
      ],
      bullets: [
        (totals.avg_lost_budget || 0) > 0.2 ? "Budget begränsar exponering — överväg höjning" : "Budget räcker till nuvarande nivå",
        (totals.avg_lost_rank || 0) > 0.15 ? "Rank-tapp: jobba på Quality Score / bud" : "Rank-tapp under kontroll",
        sortedComp[0] ? `Hetaste konkurrent: ${sortedComp[0].domain} (IS ${((sortedComp[0].impressionShare || 0) * 100).toFixed(0)}%)` : "Inga konkurrenter spårade",
      ],
    },
    charts: [
      {
        id: "comp_is",
        type: "bar",
        title: "Konkurrenter — Impression Share",
        xKey: "domain",
        series: [{ key: "is_pct", label: "IS %", color: PALETTE[1] }],
        data: sortedComp.map((c) => ({ domain: c.domain, is_pct: Math.round((c.impressionShare || 0) * 1000) / 10 })),
      },
      {
        id: "is_split",
        type: "pie",
        title: "Var vår exponering tar vägen",
        xKey: "name",
        series: [{ key: "value", label: "Andel" }],
        data: [
          { name: "Vi visas", value: Math.round((totals.avg_is || 0) * 100), color: PALETTE[0] },
          { name: "Förlorat budget", value: Math.round((totals.avg_lost_budget || 0) * 100), color: PALETTE[2] },
          { name: "Förlorat rank", value: Math.round((totals.avg_lost_rank || 0) * 100), color: PALETTE[3] },
        ].filter((s) => s.value > 0),
      },
    ],
    tables: [
      {
        id: "competitors",
        title: "Konkurrent-översikt",
        columns: [
          { key: "domain", label: "Domän" },
          { key: "impressionShare", label: "IS", format: "pct100" },
          { key: "overlapRate", label: "Overlap", format: "pct100" },
          { key: "outrankingShare", label: "Outranking", format: "pct100" },
          { key: "topOfPageRate", label: "Top of page", format: "pct100" },
        ],
        rows: sortedComp,
      },
      {
        id: "campaigns",
        title: "Kampanjer",
        columns: [
          { key: "name", label: "Kampanj" },
          { key: "impressionShare", label: "IS", format: "pct100" },
          { key: "lostBudget", label: "Lost-budget", format: "pct100" },
          { key: "lostRank", label: "Lost-rank", format: "pct100" },
          { key: "cost", label: "Kostnad", format: "sek" },
        ],
        rows: campaigns,
      },
    ],
  };
}

// ---------- YoY / MoM ----------
function tplYoy(p: Payload) {
  const t = p.trend;
  if (!t) return empty("YoY/MoM trend", p.sections?.yoy_compute?.reason || "Ingen trend-data");

  const ga = t.ga4_delta || {};
  const ads = t.ads_delta || {};
  const gsc = t.gsc_delta || {};
  const sessYoy = ga.sessions?.yoy?.pct;
  const revYoy = ga.revenue?.yoy?.pct;

  const buildRows = (label: string, deltas: any) =>
    Object.entries(deltas || {}).map(([metric, v]: [string, any]) => ({
      metric: `${label} · ${metric}`,
      current: v.current,
      mom_pct: v.mom?.pct,
      yoy_pct: v.yoy?.pct,
    }));

  const trendChartData = (() => {
    // Skapa enkel trend-jämförelse: current vs mom vs yoy för varje metric
    const merged: Record<string, any> = {};
    for (const [src, dlt] of [["GA4", ga], ["Ads", ads], ["GSC", gsc]] as const) {
      for (const [metric, v] of Object.entries(dlt || {}) as [string, any][]) {
        const key = `${src} ${metric}`;
        merged[key] = { name: key, current: v.current ?? 0, mom: v.mom?.value ?? 0, yoy: v.yoy?.value ?? 0 };
      }
    }
    return Object.values(merged);
  })();

  return {
    summary: {
      headline: sessYoy != null
        ? `Sessions ${fmtPct(sessYoy)} jämfört med förra året`
        : "Period-jämförelse mellan nuvarande, förra månaden och förra året",
      period: t.periods?.current?.range,
      kpis: [
        { label: "Sessioner YoY", value: fmtPct(sessYoy), sub: "vs samma period förra året" },
        { label: "Intäkt YoY", value: fmtPct(revYoy) },
        { label: "GSC klick YoY", value: fmtPct(gsc.clicks?.yoy?.pct) },
        { label: "Ads spend YoY", value: fmtPct(ads.cost?.yoy?.pct) },
      ],
      bullets: [
        sessYoy != null && sessYoy > 10 ? "Stark trafiktillväxt YoY" :
          sessYoy != null && sessYoy < -10 ? "Trafiktapp YoY — undersök orsaken" : "Stabil trafik YoY",
        revYoy != null && revYoy > 0 ? `Intäkten växer ${fmtPct(revYoy)} YoY` : "Intäkt under press",
      ],
    },
    charts: [
      {
        id: "yoy_compare",
        type: "bar",
        title: "Aktuell period vs MoM vs YoY",
        xKey: "name",
        series: [
          { key: "current", label: "Nu", color: PALETTE[0] },
          { key: "mom", label: "Förra mån", color: PALETTE[1] },
          { key: "yoy", label: "Förra året", color: PALETTE[2] },
        ],
        data: trendChartData,
      },
    ],
    tables: [
      {
        id: "deltas",
        title: "Förändring per mätvärde",
        columns: [
          { key: "metric", label: "Mätvärde" },
          { key: "current", label: "Nuvarande", format: "num" },
          { key: "mom_pct", label: "MoM %", format: "pct1" },
          { key: "yoy_pct", label: "YoY %", format: "pct1" },
        ],
        rows: [...buildRows("GA4", ga), ...buildRows("Ads", ads), ...buildRows("GSC", gsc)],
      },
    ],
  };
}

// ---------- ROI / Attribution ----------
function tplRoi(p: Payload) {
  const attr = p.sections?.attribution?.data;
  const cr = p.sections?.cluster_roi?.data;
  if (!attr && !cr) return empty("ROI/Attribution", p.sections?.attribution?.reason || p.sections?.cluster_roi?.reason);

  const totals = attr?.totals || {};
  const channels = (attr?.channels || []) as any[];
  const clusters = (cr?.clusters || []) as any[];

  const charts: any[] = [];
  if (channels.length) {
    charts.push({
      id: "spend_vs_revenue",
      type: "bar",
      title: "Spend vs intäkt per kanal",
      xKey: "channel",
      series: [
        { key: "spend", label: "Spend", color: PALETTE[2] },
        { key: "revenue", label: "Intäkt", color: PALETTE[0] },
      ],
      data: channels.map((c) => ({ channel: c.channel, spend: c.spend || 0, revenue: c.revenue || 0 })),
    });
    charts.push({
      id: "roas",
      type: "bar",
      title: "ROAS per kanal",
      xKey: "channel",
      series: [{ key: "roas", label: "ROAS", color: PALETTE[1] }],
      data: channels.map((c) => ({ channel: c.channel, roas: Math.round((c.roas || 0) * 100) / 100 })),
    });
  }
  if (clusters.length) {
    charts.push({
      id: "cluster_uplift",
      type: "bar",
      title: "Topp 10 kluster — uplift potential",
      xKey: "name",
      series: [{ key: "uplift", label: "Uplift kr", color: PALETTE[0] }],
      data: clusters.slice(0, 10).map((c) => ({ name: c.name, uplift: c.uplift_potential_sek || 0 })),
    });
  }

  return {
    summary: {
      headline: totals.blended_roas
        ? `Blended ROAS ${totals.blended_roas} på ${fmtSek(totals.spend)} spend`
        : `Uplift-potential ${fmtSek(cr?.total_uplift_potential_sek)} från sökord`,
      period: attr?.period,
      kpis: [
        { label: "Spend", value: fmtSek(totals.spend) },
        { label: "Intäkt", value: fmtSek(totals.revenue) },
        { label: "Blended ROAS", value: totals.blended_roas != null ? `${totals.blended_roas}x` : "—" },
        { label: "Sökord-uplift", value: fmtSek(cr?.total_uplift_potential_sek), sub: "potential vid pos 3" },
      ],
      bullets: [
        channels[0] ? `Bästa ROAS: ${[...channels].sort((a, b) => (b.roas || 0) - (a.roas || 0))[0]?.channel}` : "Ingen kanal-data",
        clusters[0] ? `Största kluster-uplift: ${clusters[0].name} (${fmtSek(clusters[0].uplift_potential_sek)})` : "Ingen kluster-data",
      ],
    },
    charts,
    tables: [
      ...(channels.length ? [{
        id: "channels",
        title: "Kanal-attribution",
        columns: [
          { key: "channel", label: "Kanal" },
          { key: "spend", label: "Spend", format: "sek" },
          { key: "revenue", label: "Intäkt", format: "sek" },
          { key: "roas", label: "ROAS", format: "decimal2" },
          { key: "spend_share", label: "Spend-andel", format: "pct100" },
        ],
        rows: channels,
      }] : []),
      ...(clusters.length ? [{
        id: "clusters",
        title: "Kluster — ROI & uplift",
        columns: [
          { key: "name", label: "Kluster" },
          { key: "keyword_count", label: "Sökord", format: "num" },
          { key: "total_volume", label: "Volym", format: "num" },
          { key: "avg_position", label: "Snitt-pos", format: "decimal1" },
          { key: "actual_revenue_sek", label: "Faktisk intäkt", format: "sek" },
          { key: "estimated_value_sek", label: "Estimat", format: "sek" },
          { key: "uplift_potential_sek", label: "Uplift", format: "sek" },
        ],
        rows: clusters,
      }] : []),
    ],
  };
}

function tplGeneric(p: Payload) {
  return {
    summary: {
      headline: `Rapport: ${p.report_type}`,
      kpis: [],
      bullets: ["Standardmall ej definierad för denna rapporttyp."],
    },
    charts: [],
    tables: [],
  };
}

function empty(title: string, reason?: string) {
  return {
    summary: { headline: `${title} kunde inte byggas`, kpis: [], bullets: [reason || "Datakälla saknas"] },
    charts: [],
    tables: [],
  };
}
