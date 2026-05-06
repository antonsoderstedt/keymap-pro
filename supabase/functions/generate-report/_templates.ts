// Spec-driven slide-arkitektur för rapporter.
// buildTemplate(payload) → { slides: SlideSpec[] }
// render-pptx läser slides[] och dispatcher per typ.

export type SlideType =
  | "cover"
  | "kpi_summary"
  | "chart"
  | "chart_split"
  | "table"
  | "insight"
  | "two_col"
  | "next_steps"
  | "divider"
  | "missing_data";

export interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}

export interface ChartSpec {
  id: string;
  type: "bar" | "line" | "pie" | "area" | "bar_horizontal";
  title?: string;
  xKey: string;
  series: { key: string; label: string; color?: string }[];
  data: any[];
}

export interface TableSpec {
  id: string;
  title?: string;
  subtitle?: string;
  columns: { key: string; label: string; format?: string; highlight?: string }[];
  rows: any[];
  max_rows?: number;
}

export interface NextStep {
  action: string;
  estimated_value_sek?: number;
  effort: "låg" | "medel" | "hög";
  timeline?: string;
}

export interface SlideSpec {
  type: SlideType;
  title?: string;
  subtitle?: string;
  headline?: string;
  kpis?: KpiItem[];
  bullets?: string[];
  chart?: ChartSpec;
  insight_text?: string;
  table?: TableSpec;
  left_bullets?: string[];
  next_steps?: NextStep[];
  total_value?: number;
  missing_source?: string;
  missing_resolution?: string;
  missing_fix_url?: string;
  data_source?: string;
  period?: string;
}

export interface TemplateOutput {
  slides: SlideSpec[];
  // Bakåtkompatibilitet — frontend ReportTemplateView läser fortfarande dessa
  summary?: any;
  charts?: any[];
  tables?: any[];
}

type Section = { status: string; reason?: string; fix?: string; fix_url?: string; data?: any };
type Payload = {
  report_type: string;
  sections?: Record<string, Section>;
  trend?: any;
  generated_at?: string;
  overall_status?: string;
  ai_insights?: Record<string, any>;
  project_domain?: string;
  report_name?: string;
  period_label?: string;
  sources?: string[];
};

export const PALETTE = ["#b8f542", "#5ab0ff", "#ff7a59", "#c084fc", "#facc15", "#34d399", "#f472b6"];

// ---------- Hjälpare ----------
export function fmtSek(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kr`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k kr`;
  return `${Math.round(n)} kr`;
}
export function fmtNum(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
export function fmtPct(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
function pct(a?: number, b?: number): string {
  if (!a || !b) return "—";
  const diff = ((a - b) / b) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
}
function formatPeriod(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long" });
}
export function humanReportType(t: string): string {
  const labels: Record<string, string> = {
    executive: "Executive Månadsrapport",
    seo_performance: "SEO Performance",
    ga4_traffic: "GA4 Trafikrapport",
    keyword_universe: "Sökordsanalys",
    segments: "Segmentrapport",
    share_of_voice: "Share of Voice",
    auction_insights: "Auction Insights",
    competitor: "Konkurrentrapport",
    content_gap: "Content Gap",
    cannibalization: "Kannibaliseringsanalys",
    paid_vs_organic: "Paid vs Organic",
    yoy: "YoY / MoM Trend",
    roi: "ROI & Attribution",
  };
  return labels[t] || t;
}

function coverSlide(p: Payload): SlideSpec {
  return {
    type: "cover",
    title: p.report_name || humanReportType(p.report_type),
    subtitle: p.project_domain || "",
    period: p.period_label || formatPeriod(p.generated_at),
    data_source: (p.sources || []).join(", ").toUpperCase() || undefined,
  };
}

function missingSlide(title: string, source: string, resolution: string): SlideSpec {
  return {
    type: "missing_data",
    title,
    missing_source: source,
    missing_resolution: resolution,
  };
}

function nextStepsSlide(steps: NextStep[], totalValue?: number): SlideSpec {
  return {
    type: "next_steps",
    title: "Rekommenderade nästa steg",
    next_steps: steps.slice(0, 3),
    total_value: totalValue,
  };
}

function deriveLegacyShape(slides: SlideSpec[]): { summary: any; charts: any[]; tables: any[] } {
  const kpiSlide = slides.find((s) => s.type === "kpi_summary");
  const charts = slides.filter((s) => s.chart).map((s) => ({ ...s.chart, title: s.chart!.title || s.title }));
  const tables = slides.filter((s) => s.table).map((s) => ({ ...s.table, title: s.table!.title || s.title }));
  return {
    summary: {
      headline: kpiSlide?.headline || slides[0]?.title || "",
      kpis: kpiSlide?.kpis || [],
      bullets: kpiSlide?.bullets || [],
      period: undefined,
    },
    charts,
    tables,
  };
}

// ---------- buildTemplate ----------
export function buildTemplate(payload: Payload): TemplateOutput {
  let result: TemplateOutput;
  switch (payload.report_type) {
    case "share_of_voice":    result = tplSov(payload); break;
    case "auction_insights":  result = tplAuction(payload); break;
    case "yoy":               result = tplYoy(payload); break;
    case "roi":               result = tplRoi(payload); break;
    case "executive":         result = tplExecutive(payload); break;
    case "seo_performance":   result = tplSeoPerformance(payload); break;
    case "ga4_traffic":       result = tplGa4Traffic(payload); break;
    case "keyword_universe":  result = tplKeywordUniverse(payload); break;
    case "segments":          result = tplSegments(payload); break;
    case "competitor":        result = tplCompetitor(payload); break;
    case "content_gap":       result = tplContentGap(payload); break;
    case "cannibalization":   result = tplCannibalization(payload); break;
    case "paid_vs_organic":   result = tplPaidVsOrganic(payload); break;
    default:                  result = tplGeneric(payload); break;
  }
  if (result.slides[0]?.type !== "cover") {
    result.slides.unshift(coverSlide(payload));
  }
  const legacy = deriveLegacyShape(result.slides);
  return { ...result, ...legacy };
}

// ---------- Executive ----------
function tplExecutive(p: Payload): TemplateOutput {
  const d = p.sections?.executive?.data;
  const ai = p.ai_insights?.executive;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Executive Månadsrapport", "GSC + GA4", "Koppla Google Search Console och Google Analytics 4 under Inställningar → Kopplingar"),
    ]
  };

  const gscC = d.gsc?.current || {};
  const gscP = d.gsc?.previous || {};
  const ga4C = d.ga4?.current || {};
  const openActions = (d.actions?.open || []) as any[];
  const topKws = (d.top_keywords || []) as any[];
  const targets = (d.targets || []) as any[];
  const topDiagnoses = (d.top_diagnoses || []) as any[];

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Månadsöversikt",
      headline: ai?.report_headline || `${fmtNum(gscC.clicks)} organiska klick · ${pct(gscC.clicks, gscP.clicks)} vs förra perioden`,
      kpis: [
        { label: "ORGANISKA KLICK", value: fmtNum(gscC.clicks), sub: pct(gscC.clicks, gscP.clicks) + " vs förra", trend: (gscC.clicks || 0) >= (gscP.clicks || 0) ? "up" : "down" },
        { label: "SESSIONER (GA4)", value: fmtNum(ga4C.sessions || ga4C.totalUsers), sub: "unika besök" },
        { label: "SNITTPOSITION", value: gscC.avgPosition ? Number(gscC.avgPosition).toFixed(1) : "—", sub: "Google organiskt" },
        { label: "ÖPPNA ÅTGÄRDER", value: String(openActions.length), sub: `${openActions.filter((a: any) => a.priority === "high" || a.priority === "critical").length} högt prioriterade` },
      ],
      bullets: [
        ai?.key_insight || ((gscC.clicks || 0) > (gscP.clicks || 0)
          ? `Organisk trafik ökade ${pct(gscC.clicks, gscP.clicks)} — driven av förbättrade positioner och nytt innehåll`
          : `Organisk trafik minskade ${pct(gscC.clicks, gscP.clicks)} — kräver uppmärksamhet`),
        openActions.length > 0 ? `${openActions.length} åtgärder väntar på implementering` : "Inga öppna åtgärder — bra jobbat!",
      ].filter(Boolean) as string[],
      period: d.period_label,
      data_source: "GOOGLE SEARCH CONSOLE + GA4",
    },
    {
      type: "chart",
      title: "Organiska klick — period vs föregående",
      chart: {
        id: "clicks_trend",
        type: "bar",
        xKey: "period",
        series: [
          { key: "clicks", label: "Klick", color: PALETTE[0] },
          { key: "impressions_k", label: "Visningar (k)", color: PALETTE[1] },
        ],
        data: [
          { period: "Förra perioden", clicks: gscP.clicks || 0, impressions_k: Math.round((gscP.impressions || 0) / 1000) },
          { period: "Nuvarande", clicks: gscC.clicks || 0, impressions_k: Math.round((gscC.impressions || 0) / 1000) },
        ],
      },
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    },
    ...(targets.length > 0 ? [{
      type: "chart" as SlideType,
      title: "KPI-mål: Status",
      chart: {
        id: "goals_progress",
        type: "bar_horizontal" as const,
        xKey: "label",
        series: [
          { key: "actual", label: "Utfall", color: PALETTE[0] },
          { key: "target", label: "Mål", color: PALETTE[5] },
        ],
        data: targets.slice(0, 6).map((t: any) => ({
          label: t.label,
          actual: t.actual_value || 0,
          target: t.target_value || 0,
        })),
      },
      data_source: "KPI-MÅL · INSTÄLLNINGAR",
    }] : []),
    ...(topDiagnoses.length > 0 ? [{
      type: "two_col" as SlideType,
      title: "Topp möjligheter denna månad",
      subtitle: `Identifierat estimerat värde: ${fmtSek(topDiagnoses.reduce((s: number, x: any) => s + (x.estimated_value_sek || 0), 0))}`,
      table: {
        id: "top_opportunities",
        columns: [
          { key: "title", label: "Möjlighet" },
          { key: "category", label: "Kategori" },
          { key: "estimated_value_sek", label: "Värde/mån", format: "sek" },
          { key: "severity", label: "Prio" },
        ],
        rows: topDiagnoses.slice(0, 6),
      },
      data_source: "SEO + ADS DIAGNOSTICS",
    }] : []),
    {
      type: "chart",
      title: "Topp 8 sidor — organiska klick",
      chart: {
        id: "top_pages",
        type: "bar_horizontal",
        xKey: "page",
        series: [{ key: "clicks", label: "Klick", color: PALETTE[0] }],
        data: ((d.gsc?.top_pages || []) as any[]).slice(0, 8).map((r: any) => ({
          page: (r.page || r.keys?.[0] || "").split("/").slice(-2).join("/") || "/",
          clicks: r.clicks || 0,
        })),
      },
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    },
    ...(topKws.length > 0 ? [{
      type: "table" as SlideType,
      title: "Topp 10 prioriterade sökord",
      table: {
        id: "top_keywords",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "searchVolume", label: "Vol/mån", format: "num" },
          { key: "cpc", label: "CPC kr", format: "decimal2" },
          { key: "intent", label: "Intent" },
          { key: "channel", label: "Kanal" },
          { key: "priority", label: "Prio" },
        ],
        rows: topKws,
        max_rows: 10,
      },
      data_source: "SÖKORDSANALYS · DATAFORSEO",
    }] : []),
    {
      type: "insight",
      title: "Analys & Rekommendation",
      headline: ai?.report_headline || "Vad datan berättar",
      insight_text: ai?.insight_text || ai?.key_insight || "Anslut Lovable AI för AI-genererade insikter.",
      kpis: [
        { label: "VIKTIGASTE MÖJLIGHET", value: ai?.opportunity_value ? fmtSek(ai.opportunity_value) : "—", sub: ai?.opportunity_short || ai?.opportunity_text },
        { label: "VIKTIGASTE RISK", value: ai?.risk_level || "—", sub: ai?.risk_short || ai?.risk_text },
      ],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(
      ai?.next_steps || [
        { action: "Kör SEO-diagnostik för att identifiera optimeringsmöjligheter", effort: "låg", timeline: "Denna vecka" },
        { action: "Implementera topp-3 åtgärder från diagnostikmotorn", effort: "medel", timeline: "0-14 dagar" },
        { action: "Bygg content brief för bästa sökordskluster", effort: "hög", timeline: "14-30 dagar" },
      ],
      ai?.total_value
    ),
  ];

  return { slides };
}

// ---------- SEO Performance ----------
function tplSeoPerformance(p: Payload): TemplateOutput {
  const d = p.sections?.seo_performance?.data;
  const ai = p.ai_insights?.seo_performance;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("SEO Performance", "Google Search Console", "Koppla Search Console under Inställningar → Kopplingar"),
    ]
  };

  const t = d.totals || {};
  const pt = d.prev_totals || {};
  const topPages = (d.top_pages || []) as any[];
  const topKws = (d.top_keywords || []) as any[];
  const strikingDistance = topKws.filter((k: any) => (k.position || 0) >= 4 && (k.position || 0) <= 15 && (k.impressions || 0) > 100);

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Organisk söksprestation",
      headline: ai?.report_headline || `${fmtNum(t.clicks)} klick · ${fmtNum(t.impressions)} visningar`,
      kpis: [
        { label: "KLICK", value: fmtNum(t.clicks), sub: pct(t.clicks, pt.clicks) + " vs förra", trend: (t.clicks || 0) >= (pt.clicks || 0) ? "up" : "down" },
        { label: "VISNINGAR", value: fmtNum(t.impressions), sub: pct(t.impressions, pt.impressions), trend: (t.impressions || 0) >= (pt.impressions || 0) ? "up" : "down" },
        { label: "CTR", value: t.ctr ? `${(t.ctr * 100).toFixed(1)}%` : (t.clicks && t.impressions ? `${(t.clicks / t.impressions * 100).toFixed(1)}%` : "—"), sub: "Branschsnitt ~3%" },
        { label: "SNITTPOSITION", value: t.avgPosition ? Number(t.avgPosition).toFixed(1) : "—", sub: pt.avgPosition ? `Förra: ${Number(pt.avgPosition).toFixed(1)}` : "" },
      ],
      bullets: [
        ai?.key_insight || (topPages[0] ? `Bästa sida: ${(topPages[0].page || "").split("/").pop() || "/"} med ${fmtNum(topPages[0].clicks)} klick` : ""),
        strikingDistance.length > 0 ? `${strikingDistance.length} sökord på position 4-15 — potential för snabb ranking-förbättring` : "",
      ].filter(Boolean) as string[],
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    },
    ...(d.intent_distribution ? [{
      type: "chart_split" as SlideType,
      title: "Sökordsuniversum: Fördelning per intent",
      chart: {
        id: "intent_pie",
        type: "pie" as const,
        xKey: "intent",
        series: [{ key: "count", label: "Sökord" }],
        data: Object.entries(d.intent_distribution || {}).map(([k, v], i) => ({
          intent: k === "informational" ? "Informationell" : k === "commercial" ? "Kommersiell" : k === "transactional" ? "Transaktionell" : k === "navigational" ? "Navigations" : k,
          count: v,
          color: PALETTE[i % PALETTE.length],
        })),
      },
      insight_text: ai?.insight_text || `Universum innehåller ${fmtNum(d.universe_summary?.total)} sökord, ${fmtNum(d.universe_summary?.enriched)} berikade med volymdata.`,
      data_source: "DATAFORSEO + SEMRUSH",
    }] : []),
    {
      type: "chart",
      title: "Topp 10 sidor — organiska klick",
      chart: {
        id: "top_pages_bar",
        type: "bar_horizontal",
        xKey: "page",
        series: [{ key: "clicks", label: "Klick", color: PALETTE[0] }],
        data: topPages.slice(0, 10).map((r: any) => ({
          page: (r.page || r.keys?.[0] || "").split("/").slice(-2).join("/") || "/",
          clicks: r.clicks || 0,
        })),
      },
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    },
    ...(strikingDistance.length > 0 ? [{
      type: "table" as SlideType,
      title: `Striking Distance: ${strikingDistance.length} sökord nära topp 3`,
      subtitle: "Position 4-15 med >100 visningar — lättaste vägarna till mer trafik",
      table: {
        id: "striking_distance",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "position", label: "Position", format: "decimal1", highlight: "orange" },
          { key: "impressions", label: "Visningar", format: "num" },
          { key: "clicks", label: "Klick", format: "num" },
          { key: "ctr", label: "CTR", format: "pct100" },
        ],
        rows: strikingDistance.slice(0, 15).sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0)).map((k: any) => ({
          ...k,
          keyword: k.keyword || k.keys?.[0],
        })),
      },
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    }] : []),
    {
      type: "table",
      title: "Topp 20 sökord efter visningar",
      table: {
        id: "top_keywords",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "clicks", label: "Klick", format: "num" },
          { key: "impressions", label: "Visningar", format: "num" },
          { key: "ctr", label: "CTR", format: "pct100" },
          { key: "position", label: "Position", format: "decimal1" },
        ],
        rows: topKws.slice(0, 20).map((r: any) => ({ keyword: r.keyword || r.keys?.[0], ...r })),
      },
      data_source: "GOOGLE SEARCH CONSOLE · 28D",
    },
    ...(d.seo_diagnoses?.length > 0 ? [{
      type: "table" as SlideType,
      title: "SEO-diagnostik: Topp fynd",
      subtitle: `Identifierat värde: ${fmtSek(d.seo_diagnoses.reduce((s: number, x: any) => s + (x.estimated_value_sek || 0), 0))}`,
      table: {
        id: "seo_diagnoses",
        columns: [
          { key: "title", label: "Diagnos" },
          { key: "category", label: "Kategori" },
          { key: "estimated_value_sek", label: "Värde/mån", format: "sek" },
          { key: "severity", label: "Allvarlighet" },
        ],
        rows: d.seo_diagnoses.slice(0, 8),
      },
      data_source: "SEO DIAGNOSTICS ENGINE",
    }] : []),
    {
      type: "insight",
      title: "Analys: Vad SEO-datan berättar",
      headline: ai?.opportunity_text || "Nästa steg för att öka organisk trafik",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för djupare analys.",
      kpis: [
        { label: "POTENTIELL TRAFIKÖKNING", value: strikingDistance.length > 0 ? `+${strikingDistance.length} sökord` : "—", sub: "om striking distance optimeras" },
        { label: "VIKTIGASTE RISK", value: ai?.risk_level || "—", sub: ai?.risk_short || "" },
      ],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Optimera topp 5 striking distance-sidor (mer djup, bättre intern länkning)", effort: "låg", estimated_value_sek: 8000, timeline: "0-14 dagar" },
      { action: "Skapa landningssida för bästa gap-sökord", effort: "medel", estimated_value_sek: 15000, timeline: "14-30 dagar" },
      { action: "Bygg 3-5 backlinks från branschrelevanta sajter", effort: "hög", estimated_value_sek: 25000, timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- GA4 Traffic ----------
function tplGa4Traffic(p: Payload): TemplateOutput {
  const d = p.sections?.ga4_traffic?.data;
  const ai = p.ai_insights?.ga4_traffic;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("GA4 Trafikrapport", "Google Analytics 4", "Koppla GA4 under Inställningar → Kopplingar"),
    ]
  };

  const t = d.totals || {};
  const channels = (d.channels || []) as any[];
  const topPages = (d.top_pages || []) as any[];

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "GA4 Trafiköversikt",
      headline: ai?.report_headline || `${fmtNum(t.sessions)} sessioner · ${fmtNum(t.totalUsers || t.users)} unika besökare`,
      kpis: [
        { label: "SESSIONER", value: fmtNum(t.sessions), sub: "totalt" },
        { label: "ANVÄNDARE", value: fmtNum(t.totalUsers || t.users), sub: "unika" },
        { label: "ENGAGEMANG", value: t.engagementRate ? `${(t.engagementRate * 100).toFixed(0)}%` : "—", sub: "engagement rate" },
        { label: "KONVERTERINGAR", value: fmtNum(t.conversions), sub: t.eventCount ? `${fmtNum(t.eventCount)} events` : "" },
      ],
      bullets: [
        ai?.key_insight || (channels[0] ? `Topp-kanal: ${channels[0].channel} med ${fmtNum(channels[0].sessions)} sessioner` : ""),
      ].filter(Boolean) as string[],
      data_source: "GOOGLE ANALYTICS 4",
    },
    ...(channels.length > 0 ? [{
      type: "chart" as SlideType,
      title: "Sessioner per kanal",
      chart: {
        id: "channels_pie",
        type: "pie" as const,
        xKey: "channel",
        series: [{ key: "sessions", label: "Sessioner" }],
        data: channels.slice(0, 8).map((c: any, i: number) => ({
          channel: c.channel || c.source || "Okänd",
          sessions: c.sessions || 0,
          color: PALETTE[i % PALETTE.length],
        })),
      },
      data_source: "GA4 · 28D",
    }] : []),
    ...(topPages.length > 0 ? [{
      type: "table" as SlideType,
      title: "Topp 15 sidor",
      table: {
        id: "top_pages",
        columns: [
          { key: "page", label: "Sida" },
          { key: "sessions", label: "Sessioner", format: "num" },
          { key: "users", label: "Användare", format: "num" },
          { key: "conversions", label: "Konv.", format: "num" },
        ],
        rows: topPages.slice(0, 15),
      },
      data_source: "GA4 · 28D",
    }] : []),
    {
      type: "insight",
      title: "Trafikanalys",
      headline: ai?.opportunity_text || "Vad trafikdata berättar",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för djupare analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Identifiera topp-3 läckande sidor och förbättra CTA", effort: "låg", timeline: "0-14 dagar" },
      { action: "Skala upp bästa kanalen med mer innehåll/spend", effort: "medel", timeline: "14-30 dagar" },
      { action: "A/B-testa primär konverteringssida", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Keyword Universe ----------
function tplKeywordUniverse(p: Payload): TemplateOutput {
  const d = p.sections?.keyword_universe?.data;
  const ai = p.ai_insights?.keyword_universe;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Sökordsanalys", "Sökordsuniversum", "Kör sökordsanalys-wizarden för att generera ditt sökordsuniversum"),
    ]
  };

  const clusters = (d.clusters || []) as any[];
  const topKws = (d.top_keywords || []) as any[];
  const totalVolume = clusters.reduce((s: number, c: any) => s + (c.total_volume || 0), 0);

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Sökordsuniversum",
      headline: ai?.report_headline || `${clusters.length} kluster · ${fmtNum(d.total_keywords)} sökord`,
      kpis: [
        { label: "KLUSTER", value: String(clusters.length), sub: "tematiska grupper" },
        { label: "SÖKORD", value: fmtNum(d.total_keywords), sub: "totalt i universum" },
        { label: "TOTAL VOLYM", value: fmtNum(totalVolume), sub: "sök/mån" },
        { label: "BERIKADE", value: fmtNum(d.enriched_keywords), sub: "med volym/CPC" },
      ],
      bullets: [
        ai?.key_insight || (clusters[0] ? `Största kluster: "${clusters[0].name}" med ${clusters[0].keyword_count || (clusters[0].keywords || []).length} sökord` : ""),
      ].filter(Boolean) as string[],
      data_source: "DATAFORSEO + SEMRUSH",
    },
    ...(clusters.length > 0 ? [{
      type: "chart" as SlideType,
      title: "Topp 10 kluster — sökordsvolym",
      chart: {
        id: "clusters_volume",
        type: "bar_horizontal" as const,
        xKey: "name",
        series: [{ key: "volume", label: "Volym/mån", color: PALETTE[0] }],
        data: clusters.slice(0, 10).map((c: any) => ({
          name: (c.name || c.cluster || "").slice(0, 30),
          volume: c.total_volume || 0,
        })),
      },
      data_source: "DATAFORSEO",
    }] : []),
    ...(clusters.length > 0 ? [{
      type: "table" as SlideType,
      title: "Alla kluster — översikt",
      table: {
        id: "clusters",
        columns: [
          { key: "name", label: "Kluster" },
          { key: "keyword_count", label: "Sökord", format: "num" },
          { key: "total_volume", label: "Volym/mån", format: "num" },
          { key: "avg_cpc", label: "Snitt-CPC", format: "decimal2" },
        ],
        rows: clusters.map((c: any) => ({
          name: c.name || c.cluster,
          keyword_count: c.keyword_count || (c.keywords || []).length,
          total_volume: c.total_volume || 0,
          avg_cpc: c.avg_cpc || 0,
        })),
      },
      data_source: "DATAFORSEO + SEMRUSH",
    }] : []),
    ...(topKws.length > 0 ? [{
      type: "table" as SlideType,
      title: "Topp 20 sökord efter prioritet",
      table: {
        id: "top_kws",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "searchVolume", label: "Volym", format: "num" },
          { key: "cpc", label: "CPC", format: "decimal2" },
          { key: "intent", label: "Intent" },
          { key: "kd", label: "KD%", format: "decimal1" },
        ],
        rows: topKws.slice(0, 20),
      },
      data_source: "DATAFORSEO + SEMRUSH",
    }] : []),
    {
      type: "insight",
      title: "Sökordsstrategisk analys",
      headline: ai?.opportunity_text || "Din viktigaste sökordsopportunitet",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för strategisk sökordsanalys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Skapa content brief för topp-klustret", effort: "låg", timeline: "Denna vecka" },
      { action: "Bygg landningssidor för topp-10 prioriterade sökord", effort: "hög", timeline: "30-60 dagar" },
      { action: "Stäng topp-5 competitor gaps med KD < 30", effort: "medel", timeline: "14-30 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Segments ----------
function tplSegments(p: Payload): TemplateOutput {
  const d = p.sections?.segments?.data;
  const ai = p.ai_insights?.segments;

  if (!d?.segments?.length) return {
    slides: [
      coverSlide(p),
      missingSlide("Segmentrapport", "Sökordsanalys med segment", "Kör sökordsanalys-wizarden för att generera kundssegment"),
    ]
  };

  const segs = (d.segments || []) as any[];

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Marknadssegmentanalys",
      headline: ai?.report_headline || `${segs.length} identifierade segment — sorterade efter möjlighetspoäng`,
      kpis: [
        { label: "SEGMENT", value: String(segs.length), sub: "identifierade kundtyper" },
        { label: "TOPP OPPORTUNITY", value: segs[0] ? `${segs[0].opportunityScore || segs[0].score || "—"}/10` : "—", sub: segs[0]?.name || "" },
        { label: "TOTALT IDENTIFIERADE", value: fmtNum(segs.reduce((s: number, seg: any) => s + (seg.size || 0), 0)), sub: "potentiella kunder" },
        { label: "UNIKA SNI-KODER", value: String(new Set(segs.map((s: any) => s.sniCode).filter(Boolean)).size), sub: "branscher" },
      ],
      bullets: (segs.slice(0, 3) as any[]).map((s: any) => `${s.name}: Score ${s.opportunityScore || s.score || "—"}/10 · ${fmtNum(s.size)} företag · SNI ${s.sniCode || "—"}`),
      data_source: "SCB + AI-ANALYS",
    },
    {
      type: "chart",
      title: "Opportunity Score per segment",
      chart: {
        id: "opportunity_scores",
        type: "bar_horizontal",
        xKey: "name",
        series: [{ key: "score", label: "Score (0-10)", color: PALETTE[0] }],
        data: segs.map((s: any) => ({ name: (s.name || "").slice(0, 25), score: s.opportunityScore || s.score || 0 })),
      },
      data_source: "AI-POÄNGSÄTTNING",
    },
    {
      type: "table",
      title: "Alla segment — detaljvy",
      table: {
        id: "segments",
        columns: [
          { key: "name", label: "Segment" },
          { key: "opportunityScore", label: "Score", format: "decimal1" },
          { key: "sniCode", label: "SNI-kod" },
          { key: "size", label: "Företag", format: "num" },
          { key: "insight", label: "Insikt" },
        ],
        rows: segs.map((s: any) => ({ ...s, opportunityScore: s.opportunityScore || s.score })),
      },
      data_source: "SCB + AI-ANALYS",
    },
    {
      type: "insight",
      title: "Marknadsstrategisk rekommendation",
      headline: ai?.opportunity_text || "Vilket segment ska vi attackera först?",
      insight_text: ai?.insight_text || ai?.key_insight || (segs[0] ? `Segment "${segs[0].name}" har högst opportunity score och representerar ${fmtNum(segs[0].size)} potentiella kunder. Fokusera innehåll och sökordsoptimering mot detta segment.` : "Aktivera AI-insikter för rekommendation."),
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: `Skapa sökordsinnehåll riktat mot segment "${segs[0]?.name || "topp-segment"}"`, effort: "medel", timeline: "0-30 dagar" },
      { action: "Bygg kundspecifika landningssidor per topp-3 segment", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Competitor ----------
function tplCompetitor(p: Payload): TemplateOutput {
  const d = p.sections?.competitor?.data;
  const ai = p.ai_insights?.competitor;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Konkurrentrapport", "Backlink-analys + Semrush", "Kör Teknisk SEO-analys med konkurrentlista i Sökord & innehåll → Teknisk SEO"),
    ]
  };

  const gaps = (d.gap_domains || []) as any[];
  const gapKws = (d.gap_keywords || []) as any[];
  const totalGapVolume = gapKws.reduce((s: number, k: any) => s + (k.searchVolume || 0), 0);

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Konkurrentanalys",
      headline: ai?.report_headline || `${gaps.length} domäner att kontakta · ${gapKws.length} sökordsgap`,
      kpis: [
        { label: "VÅR AUTHORITY SCORE", value: d.own_authority ? String(d.own_authority) : "—", sub: "0-100 skalan" },
        { label: "BACKLINK-GAP DOMÄNER", value: String(gaps.length), sub: "länkar till konkurrenter" },
        { label: "SÖKORDSGAP", value: String(gapKws.length), sub: "sökord vi saknar" },
        { label: "TOTAL GAPVOLYM", value: fmtNum(totalGapVolume), sub: "sökningar/mån" },
      ],
      bullets: [
        ai?.key_insight || (gaps[0] ? `Starkaste gap-domän: ${gaps[0].domain} (Authority ${gaps[0].authority})` : ""),
        gapKws[0] ? `Bästa gap-sökord: "${gapKws[0].keyword}" (${fmtNum(gapKws[0].searchVolume)}/mån)` : "",
      ].filter(Boolean) as string[],
      data_source: "SEMRUSH + DATAFORSEO",
    },
    ...(gaps.length > 0 ? [{
      type: "chart" as SlideType,
      title: "Topp 10 gap-domäner — Authority Score",
      chart: {
        id: "gap_domains_bar",
        type: "bar_horizontal" as const,
        xKey: "domain",
        series: [{ key: "authority", label: "Authority Score", color: PALETTE[2] }],
        data: gaps.slice(0, 10).map((d: any) => ({ domain: (d.domain || "").slice(0, 25), authority: d.authority || 0 })),
      },
      data_source: "SEMRUSH · DOMAIN ANALYTICS",
    }] : []),
    ...(gapKws.length > 0 ? [{
      type: "chart_split" as SlideType,
      title: "Gap-sökord per svårighetsgrad",
      chart: {
        id: "gap_kd_pie",
        type: "pie" as const,
        xKey: "difficulty",
        series: [{ key: "count", label: "Antal" }],
        data: [
          { difficulty: "Lätt (KD<30)", count: gapKws.filter((k: any) => (k.kd || 100) < 30).length, color: PALETTE[0] },
          { difficulty: "Medel (30-60)", count: gapKws.filter((k: any) => (k.kd || 0) >= 30 && (k.kd || 0) < 60).length, color: PALETTE[4] },
          { difficulty: "Svår (KD>60)", count: gapKws.filter((k: any) => (k.kd || 0) >= 60).length, color: PALETTE[2] },
        ].filter(d => d.count > 0),
      },
      insight_text: ai?.insight_text || `${gapKws.filter((k: any) => (k.kd || 100) < 30).length} av ${gapKws.length} gap-sökord har KD under 30 — dessa kan rankas inom 60-90 dagar med rätt innehåll.`,
      data_source: "DATAFORSEO + SEMRUSH",
    }] : []),
    ...(gapKws.length > 0 ? [{
      type: "table" as SlideType,
      title: "Topp 25 prioriterade gap-sökord (KD sorterat)",
      subtitle: "Lägst svårighetsgrad + högst volym = snabbast väg till ranking",
      table: {
        id: "gap_kws",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "searchVolume", label: "Volym/mån", format: "num" },
          { key: "kd", label: "KD%", format: "decimal1" },
          { key: "cpc", label: "CPC kr", format: "decimal2" },
          { key: "intent", label: "Intent" },
        ],
        rows: [...gapKws].sort((a: any, b: any) => (a.kd || 100) - (b.kd || 100)).slice(0, 25),
      },
      data_source: "DATAFORSEO + SEMRUSH",
    }] : []),
    ...(gaps.length > 0 ? [{
      type: "table" as SlideType,
      title: "Backlink-gap domäner att kontakta",
      table: {
        id: "gap_domains",
        columns: [
          { key: "domain", label: "Domän" },
          { key: "authority", label: "Authority Score", format: "num" },
          { key: "competitorCount", label: "Konkurrenter", format: "num" },
          { key: "backlinks", label: "Backlinks", format: "num" },
        ],
        rows: gaps.slice(0, 15),
      },
      data_source: "SEMRUSH · BACKLINK ANALYTICS",
    }] : []),
    {
      type: "insight",
      title: "Konkurrentstrategisk analys",
      headline: ai?.opportunity_text || "Hur vi stänger konkurrentgapet",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för konkurrentstrategisk analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: `Kontakta topp ${Math.min(gaps.length, 10)} gap-domäner med outreach-mail`, effort: "hög", estimated_value_sek: 30000, timeline: "0-30 dagar" },
      { action: "Skapa innehåll för topp-10 gap-sökord med KD < 30", effort: "medel", estimated_value_sek: 20000, timeline: "14-45 dagar" },
      { action: "Bygg topical authority i ditt starkaste kluster", effort: "hög", timeline: "30-90 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Content Gap ----------
function tplContentGap(p: Payload): TemplateOutput {
  const d = p.sections?.content_gap?.data;
  const ai = p.ai_insights?.content_gap;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Content Gap-rapport", "Sökordsanalys + GSC", "Kör sökordsanalys och koppla GSC för att identifiera content gaps"),
    ]
  };

  const gaps = (d.gaps || []) as any[];
  const totalGapVolume = gaps.reduce((s: number, g: any) => s + (g.searchVolume || g.volume || 0), 0);

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Content Gap-analys",
      headline: ai?.report_headline || `${gaps.length} sökord vi inte rankar på · ${fmtNum(totalGapVolume)} sökningar/mån`,
      kpis: [
        { label: "GAP-SÖKORD", value: String(gaps.length), sub: "vi rankar ej på" },
        { label: "TOTAL VOLYM", value: fmtNum(totalGapVolume), sub: "sökningar/mån" },
        { label: "ENKLA VINSTER", value: String(gaps.filter((g: any) => (g.kd || 100) < 30).length), sub: "KD < 30" },
        { label: "TOPP-INTENT", value: gaps[0]?.intent || "—", sub: "vanligast i gaps" },
      ],
      bullets: [
        ai?.key_insight || (gaps[0] ? `Bästa gap: "${gaps[0].keyword}" med ${fmtNum(gaps[0].searchVolume || gaps[0].volume)} sök/mån` : ""),
      ].filter(Boolean) as string[],
      data_source: "GSC + DATAFORSEO",
    },
    ...(gaps.length > 0 ? [{
      type: "table" as SlideType,
      title: "Topp 30 gap-sökord (volym sorterat)",
      table: {
        id: "gaps",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "searchVolume", label: "Volym/mån", format: "num" },
          { key: "kd", label: "KD%", format: "decimal1" },
          { key: "cpc", label: "CPC", format: "decimal2" },
          { key: "intent", label: "Intent" },
        ],
        rows: [...gaps].sort((a: any, b: any) => (b.searchVolume || b.volume || 0) - (a.searchVolume || a.volume || 0)).slice(0, 30),
      },
      data_source: "DATAFORSEO",
    }] : []),
    {
      type: "insight",
      title: "Content gap-strategi",
      headline: ai?.opportunity_text || "Vilket content vi ska skapa först",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för content gap-prioritering.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Skapa content brief för topp-3 enklaste gap-sökord", effort: "låg", timeline: "Denna vecka" },
      { action: "Publicera 5 nya artiklar för topp-volym gaps", effort: "medel", timeline: "14-30 dagar" },
      { action: "Bygg pillar page för största content-tema", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Cannibalization ----------
function tplCannibalization(p: Payload): TemplateOutput {
  const d = p.sections?.cannibalization?.data;
  const ai = p.ai_insights?.cannibalization;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Kannibaliseringsanalys", "Google Search Console", "Koppla GSC under Inställningar → Kopplingar"),
    ]
  };

  const cases = (d.cannibalized_keywords || []) as any[];

  if (cases.length === 0) {
    return {
      slides: [
        coverSlide(p),
        {
          type: "kpi_summary",
          title: "Kannibaliseringsanalys",
          headline: "Inga kannibaliseringsfall identifierade",
          kpis: [{ label: "STATUS", value: "FRISK", sub: "Inga URL-konflikter" }],
          bullets: ["Alla sökord har unika rankande sidor — bra sökordsarkitektur!"],
          data_source: "GOOGLE SEARCH CONSOLE",
        },
      ]
    };
  }

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Kannibaliseringsanalys",
      headline: ai?.report_headline || `${cases.length} sökord rankar med flera URLs — potentiell konflikt`,
      kpis: [
        { label: "KANNIBALISERADE SÖKORD", value: String(cases.length), sub: "flera URLs konkurrerar" },
        { label: "FÖRLORAD KLICK-POTENTIAL", value: fmtNum(cases.reduce((s: number, c: any) => s + (c.lost_clicks || 0), 0)), sub: "estimat" },
        { label: "VANLIGAST", value: cases[0]?.keyword || "—", sub: `${cases[0]?.urls?.length || 2} URLs` },
        { label: "URLs INVOLVERADE", value: String(new Set(cases.flatMap((c: any) => c.urls || [])).size), sub: "unika sidor" },
      ],
      bullets: [
        ai?.key_insight || `Vanligast är ${cases[0]?.keyword} som rankar med ${cases[0]?.urls?.length || "flera"} olika URLs`,
      ].filter(Boolean) as string[],
      data_source: "GOOGLE SEARCH CONSOLE",
    },
    {
      type: "table",
      title: "Alla kannibaliseringsfall",
      table: {
        id: "cannibalized",
        columns: [
          { key: "keyword", label: "Sökord" },
          { key: "url_count", label: "URLs", format: "num" },
          { key: "total_clicks", label: "Klick", format: "num" },
          { key: "total_impressions", label: "Visningar", format: "num" },
        ],
        rows: cases.map((c: any) => ({
          keyword: c.keyword,
          url_count: (c.urls || []).length,
          total_clicks: c.total_clicks || 0,
          total_impressions: c.total_impressions || 0,
        })),
      },
      data_source: "GOOGLE SEARCH CONSOLE",
    },
    {
      type: "insight",
      title: "Hur vi löser kannibaliseringen",
      headline: ai?.opportunity_text || "Konsolideringsstrategi",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för konsolideringsanalys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Identifiera primär URL för topp-3 kannibaliserade sökord", effort: "låg", timeline: "Denna vecka" },
      { action: "Konsolidera duplicerade sidor med 301-redirect", effort: "medel", timeline: "0-30 dagar" },
      { action: "Differentiera intent på kvarvarande sidor", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Paid vs Organic ----------
function tplPaidVsOrganic(p: Payload): TemplateOutput {
  const d = p.sections?.paid_vs_organic?.data;
  const ai = p.ai_insights?.paid_vs_organic;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Paid vs Organic", "GSC + Google Ads", "Koppla både Search Console och Google Ads under Inställningar → Kopplingar"),
    ]
  };

  const organic = d.organic || {};
  const paid = d.paid || {};

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Paid vs Organic",
      headline: ai?.report_headline || `${fmtNum(organic.clicks)} organiska vs ${fmtNum(paid.clicks)} betalda klick`,
      kpis: [
        { label: "ORGANISKA KLICK", value: fmtNum(organic.clicks), sub: "från GSC" },
        { label: "BETALDA KLICK", value: fmtNum(paid.clicks), sub: "från Google Ads" },
        { label: "ADS-SPEND", value: fmtSek(paid.cost), sub: "denna period" },
        { label: "ORGANIC SHARE", value: organic.clicks && paid.clicks ? `${Math.round((organic.clicks / (organic.clicks + paid.clicks)) * 100)}%` : "—", sub: "av total trafik" },
      ],
      bullets: [
        ai?.key_insight || (organic.clicks > paid.clicks ? "Organisk trafik dominerar — fortsätt investera i SEO" : "Betald trafik dominerar — utvärdera SEO-investering"),
      ].filter(Boolean) as string[],
      data_source: "GSC + GOOGLE ADS",
    },
    {
      type: "chart",
      title: "Klick: Organic vs Paid",
      chart: {
        id: "po_clicks",
        type: "bar",
        xKey: "channel",
        series: [{ key: "clicks", label: "Klick", color: PALETTE[0] }],
        data: [
          { channel: "Organic (SEO)", clicks: organic.clicks || 0 },
          { channel: "Paid (Ads)", clicks: paid.clicks || 0 },
        ],
      },
      data_source: "GSC + GOOGLE ADS",
    },
    {
      type: "insight",
      title: "Channel-mix-analys",
      headline: ai?.opportunity_text || "Var ligger den bästa marginalen?",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för channel-mix-analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Identifiera topp-3 sökord där SEO kan ersätta Ads-spend", effort: "låg", timeline: "0-14 dagar" },
      { action: "Bjud upp på sökord där SEO underlevererar", effort: "medel", timeline: "14-30 dagar" },
      { action: "Skapa SEO-content för dyraste Ads-sökord", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Share of Voice (migrerad till slides-format) ----------
function tplSov(p: Payload): TemplateOutput {
  const d = p.sections?.share_of_voice?.data;
  const ai = p.ai_insights?.share_of_voice;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Share of Voice", "GSC + Konkurrentlista", p.sections?.share_of_voice?.reason || "Anslut Search Console och konfigurera konkurrenter"),
    ]
  };

  const competitors = (d.competitors || []) as any[];
  const yourSov = Number(d.sov_pct || 0);
  const sortedCompetitors = [...competitors].sort((a, b) => (b.sov_pct || 0) - (a.sov_pct || 0));
  const top = sortedCompetitors.slice(0, 6);
  const otherSov = Math.max(0, 100 - yourSov - top.reduce((s, c) => s + (c.sov_pct || 0), 0));

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Share of Voice",
      headline: ai?.report_headline || `Du har ${yourSov.toFixed(1)}% Share of Voice i din nisch`,
      kpis: [
        { label: "DIN SOV", value: `${yourSov.toFixed(1)}%`, sub: d.your_domain },
        { label: "DINA VISNINGAR", value: fmtNum(d.your_impressions) },
        { label: "MARKNADSSTORLEK", value: fmtNum(d.total_market_impressions), sub: "totala visningar" },
        { label: "KONKURRENTER", value: `${competitors.length}`, sub: "spårade" },
      ],
      bullets: [
        ai?.key_insight || (sortedCompetitors[0] ? `Största konkurrent: ${sortedCompetitors[0].domain} (${(sortedCompetitors[0].sov_pct || 0).toFixed(1)}%)` : "Inga konkurrenter identifierade"),
        yourSov < 10 ? "SoV under 10% — stor tillväxtpotential" : yourSov < 25 ? "Etablerad men utmanare" : "Marknadsledare i nischen",
      ],
      data_source: "GSC + SEMRUSH",
    },
    {
      type: "chart_split",
      title: "Marknadsandel per aktör",
      chart: {
        id: "sov_split",
        type: "pie",
        xKey: "name",
        series: [{ key: "value", label: "SoV %" }],
        data: [
          { name: d.your_domain || "Du", value: yourSov, color: PALETTE[0] },
          ...top.map((c, i) => ({ name: c.domain, value: c.sov_pct || 0, color: PALETTE[(i + 1) % PALETTE.length] })),
          ...(otherSov > 0.5 ? [{ name: "Övriga", value: otherSov, color: "#3a3a3a" }] : []),
        ],
      },
      insight_text: ai?.insight_text || `Marknaden domineras av ${sortedCompetitors[0]?.domain || "ledande aktörer"}. Din position kräver fokus på ${yourSov < 15 ? "topical authority och innehåll" : "skala och varumärkesbyggande"}.`,
      data_source: "GSC + SEMRUSH",
    },
    {
      type: "chart",
      title: "Visningar per aktör (top 8)",
      chart: {
        id: "sov_bars",
        type: "bar",
        xKey: "name",
        series: [{ key: "impressions", label: "Visningar", color: PALETTE[0] }],
        data: [
          { name: d.your_domain || "Du", impressions: d.your_impressions || 0 },
          ...top.map((c) => ({ name: c.domain, impressions: c.impressions || 0 })),
        ],
      },
      data_source: "GSC + SEMRUSH",
    },
    {
      type: "table",
      title: "Konkurrenter rankade efter SoV",
      table: {
        id: "competitors",
        columns: [
          { key: "domain", label: "Domän" },
          { key: "sov_pct", label: "SoV %", format: "pct1" },
          { key: "impressions", label: "Visningar", format: "num" },
          { key: "clicks", label: "Klick", format: "num" },
          { key: "avg_position", label: "Snitt-pos", format: "decimal1" },
        ],
        rows: sortedCompetitors,
      },
      data_source: "GSC + SEMRUSH",
    },
    {
      type: "insight",
      title: "SoV-strategi",
      headline: ai?.opportunity_text || "Hur du flyttar marknadsandelar",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för SoV-strategisk analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Identifiera topp-konkurrentens 10 starkaste sökord", effort: "låg", timeline: "Denna vecka" },
      { action: "Skapa bättre innehåll för topp-3 konkurrent-sökord", effort: "medel", timeline: "14-45 dagar" },
      { action: "Bygg topical authority kring kärnsegment", effort: "hög", timeline: "30-90 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Auction Insights (migrerad till slides) ----------
function tplAuction(p: Payload): TemplateOutput {
  const d = p.sections?.auction_insights?.data;
  const ai = p.ai_insights?.auction_insights;

  if (!d) return {
    slides: [
      coverSlide(p),
      missingSlide("Auction Insights", "Google Ads", p.sections?.auction_insights?.reason || "Anslut Google Ads och vänta på auktionsdata"),
    ]
  };

  const totals = d.totals || {};
  const competitors = (d.competitors || []) as any[];
  const campaigns = (d.campaigns || []) as any[];
  const sortedComp = [...competitors].sort((a, b) => (b.impressionShare || 0) - (a.impressionShare || 0)).slice(0, 10);

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "Auction Insights",
      headline: ai?.report_headline || `Genomsnittlig Impression Share: ${(((totals.avg_is) || 0) * 100).toFixed(0)}%`,
      kpis: [
        { label: "AVG IS", value: `${((totals.avg_is || 0) * 100).toFixed(0)}%` },
        { label: "FÖRLORAD BUDGET", value: `${((totals.avg_lost_budget || 0) * 100).toFixed(0)}%` },
        { label: "FÖRLORAD RANK", value: `${((totals.avg_lost_rank || 0) * 100).toFixed(0)}%` },
        { label: "KONKURRENTER", value: `${competitors.length}` },
      ],
      bullets: [
        (totals.avg_lost_budget || 0) > 0.2 ? "Budget begränsar exponering — överväg höjning" : "Budget räcker till nuvarande nivå",
        (totals.avg_lost_rank || 0) > 0.15 ? "Rank-tapp: jobba på Quality Score / bud" : "Rank-tapp under kontroll",
        sortedComp[0] ? `Hetaste konkurrent: ${sortedComp[0].domain} (IS ${((sortedComp[0].impressionShare || 0) * 100).toFixed(0)}%)` : "Inga konkurrenter spårade",
      ],
      data_source: "GOOGLE ADS · AUCTION INSIGHTS",
    },
    {
      type: "chart",
      title: "Konkurrenter — Impression Share",
      chart: {
        id: "comp_is",
        type: "bar_horizontal",
        xKey: "domain",
        series: [{ key: "is_pct", label: "IS %", color: PALETTE[1] }],
        data: sortedComp.map((c) => ({ domain: c.domain, is_pct: Math.round((c.impressionShare || 0) * 1000) / 10 })),
      },
      data_source: "GOOGLE ADS",
    },
    {
      type: "chart_split",
      title: "Var vår exponering tar vägen",
      chart: {
        id: "is_split",
        type: "pie",
        xKey: "name",
        series: [{ key: "value", label: "Andel" }],
        data: [
          { name: "Vi visas", value: Math.round((totals.avg_is || 0) * 100), color: PALETTE[0] },
          { name: "Förlorat budget", value: Math.round((totals.avg_lost_budget || 0) * 100), color: PALETTE[2] },
          { name: "Förlorat rank", value: Math.round((totals.avg_lost_rank || 0) * 100), color: PALETTE[3] },
        ].filter((s) => s.value > 0),
      },
      insight_text: ai?.insight_text || `Vi syns i ${Math.round((totals.avg_is || 0) * 100)}% av relevanta auktioner. Resten förloras till ${(totals.avg_lost_budget || 0) > (totals.avg_lost_rank || 0) ? "budget-begränsningar" : "rank/kvalitetsproblem"}.`,
      data_source: "GOOGLE ADS",
    },
    {
      type: "table",
      title: "Konkurrent-översikt",
      table: {
        id: "competitors",
        columns: [
          { key: "domain", label: "Domän" },
          { key: "impressionShare", label: "IS", format: "pct100" },
          { key: "overlapRate", label: "Overlap", format: "pct100" },
          { key: "outrankingShare", label: "Outranking", format: "pct100" },
          { key: "topOfPageRate", label: "Top of page", format: "pct100" },
        ],
        rows: sortedComp,
      },
      data_source: "GOOGLE ADS",
    },
    ...(campaigns.length > 0 ? [{
      type: "table" as SlideType,
      title: "Kampanjer",
      table: {
        id: "campaigns",
        columns: [
          { key: "name", label: "Kampanj" },
          { key: "impressionShare", label: "IS", format: "pct100" },
          { key: "lostBudget", label: "Lost-budget", format: "pct100" },
          { key: "lostRank", label: "Lost-rank", format: "pct100" },
          { key: "cost", label: "Kostnad", format: "sek" },
        ],
        rows: campaigns,
      },
      data_source: "GOOGLE ADS",
    }] : []),
    {
      type: "insight",
      title: "Auktions-strategi",
      headline: ai?.opportunity_text || "Hur vi vinner fler auktioner",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för auktions-strategisk analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Höj budget på topp-3 budget-begränsade kampanjer", effort: "låg", timeline: "Denna vecka" },
      { action: "Optimera annonser och landningssidor för Quality Score", effort: "medel", timeline: "14-30 dagar" },
      { action: "Analysera konkurrenters annonstexter och differentiera", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- YoY (migrerad till slides) ----------
function tplYoy(p: Payload): TemplateOutput {
  const t = p.trend;
  const ai = p.ai_insights?.yoy;

  if (!t) return {
    slides: [
      coverSlide(p),
      missingSlide("YoY/MoM Trend", "GA4 + Ads + GSC", p.sections?.yoy_compute?.reason || "Anslut datakällor och se till att historik finns"),
    ]
  };

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
    const merged: Record<string, any> = {};
    for (const [src, dlt] of [["GA4", ga], ["Ads", ads], ["GSC", gsc]] as const) {
      for (const [metric, v] of Object.entries(dlt || {}) as [string, any][]) {
        const key = `${src} ${metric}`;
        merged[key] = { name: key, current: v.current ?? 0, mom: v.mom?.value ?? 0, yoy: v.yoy?.value ?? 0 };
      }
    }
    return Object.values(merged);
  })();

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "YoY / MoM Trend",
      headline: ai?.report_headline || (sessYoy != null ? `Sessions ${fmtPct(sessYoy)} jämfört med förra året` : "Period-jämförelse"),
      kpis: [
        { label: "SESSIONER YOY", value: fmtPct(sessYoy), sub: "vs förra året" },
        { label: "INTÄKT YOY", value: fmtPct(revYoy) },
        { label: "GSC KLICK YOY", value: fmtPct(gsc.clicks?.yoy?.pct) },
        { label: "ADS SPEND YOY", value: fmtPct(ads.cost?.yoy?.pct) },
      ],
      bullets: [
        sessYoy != null && sessYoy > 10 ? "Stark trafiktillväxt YoY" :
          sessYoy != null && sessYoy < -10 ? "Trafiktapp YoY — undersök orsaken" : "Stabil trafik YoY",
        revYoy != null && revYoy > 0 ? `Intäkten växer ${fmtPct(revYoy)} YoY` : "Intäkt under press",
      ],
      data_source: "GA4 + ADS + GSC",
    },
    {
      type: "chart",
      title: "Aktuell period vs MoM vs YoY",
      chart: {
        id: "yoy_compare",
        type: "bar",
        xKey: "name",
        series: [
          { key: "current", label: "Nu", color: PALETTE[0] },
          { key: "mom", label: "Förra mån", color: PALETTE[1] },
          { key: "yoy", label: "Förra året", color: PALETTE[2] },
        ],
        data: trendChartData,
      },
      data_source: "GA4 + ADS + GSC",
    },
    {
      type: "table",
      title: "Förändring per mätvärde",
      table: {
        id: "deltas",
        columns: [
          { key: "metric", label: "Mätvärde" },
          { key: "current", label: "Nuvarande", format: "num" },
          { key: "mom_pct", label: "MoM %", format: "pct1" },
          { key: "yoy_pct", label: "YoY %", format: "pct1" },
        ],
        rows: [...buildRows("GA4", ga), ...buildRows("Ads", ads), ...buildRows("GSC", gsc)],
      },
      data_source: "GA4 + ADS + GSC",
    },
    {
      type: "insight",
      title: "Trendanalys",
      headline: ai?.opportunity_text || "Vad trenden berättar",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för trendanalys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Identifiera vinnar-kanal som driver YoY-tillväxt", effort: "låg", timeline: "Denna vecka" },
      { action: "Skala upp investering i bästa kanalen", effort: "medel", timeline: "14-30 dagar" },
      { action: "Diversifiera kanal-mix för att minska risk", effort: "hög", timeline: "30-90 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- ROI (migrerad till slides) ----------
function tplRoi(p: Payload): TemplateOutput {
  const attr = p.sections?.attribution?.data;
  const cr = p.sections?.cluster_roi?.data;
  const ai = p.ai_insights?.roi;

  if (!attr && !cr) return {
    slides: [
      coverSlide(p),
      missingSlide("ROI & Attribution", "GA4 + Google Ads + Sökordsanalys", "Anslut datakällor och kör sökordsanalys"),
    ]
  };

  const totals = attr?.totals || {};
  const channels = (attr?.channels || []) as any[];
  const clusters = (cr?.clusters || []) as any[];

  const slides: SlideSpec[] = [
    coverSlide(p),
    {
      type: "kpi_summary",
      title: "ROI & Attribution",
      headline: ai?.report_headline || (totals.blended_roas
        ? `Blended ROAS ${totals.blended_roas} på ${fmtSek(totals.spend)} spend`
        : `Uplift-potential ${fmtSek(cr?.total_uplift_potential_sek)}`),
      kpis: [
        { label: "SPEND", value: fmtSek(totals.spend) },
        { label: "INTÄKT", value: fmtSek(totals.revenue) },
        { label: "BLENDED ROAS", value: totals.blended_roas != null ? `${totals.blended_roas}x` : "—" },
        { label: "SÖKORD-UPLIFT", value: fmtSek(cr?.total_uplift_potential_sek), sub: "potential vid pos 3" },
      ],
      bullets: [
        channels[0] ? `Bästa ROAS: ${[...channels].sort((a, b) => (b.roas || 0) - (a.roas || 0))[0]?.channel}` : "Ingen kanal-data",
        clusters[0] ? `Största kluster-uplift: ${clusters[0].name} (${fmtSek(clusters[0].uplift_potential_sek)})` : "Ingen kluster-data",
      ],
      data_source: "GA4 + GOOGLE ADS + ANALYSER",
    },
    ...(channels.length ? [{
      type: "chart" as SlideType,
      title: "Spend vs intäkt per kanal",
      chart: {
        id: "spend_vs_revenue",
        type: "bar" as const,
        xKey: "channel",
        series: [
          { key: "spend", label: "Spend", color: PALETTE[2] },
          { key: "revenue", label: "Intäkt", color: PALETTE[0] },
        ],
        data: channels.map((c) => ({ channel: c.channel, spend: c.spend || 0, revenue: c.revenue || 0 })),
      },
      data_source: "GA4 + GOOGLE ADS",
    }] : []),
    ...(channels.length ? [{
      type: "chart" as SlideType,
      title: "ROAS per kanal",
      chart: {
        id: "roas",
        type: "bar" as const,
        xKey: "channel",
        series: [{ key: "roas", label: "ROAS", color: PALETTE[1] }],
        data: channels.map((c) => ({ channel: c.channel, roas: Math.round((c.roas || 0) * 100) / 100 })),
      },
      data_source: "GA4 + GOOGLE ADS",
    }] : []),
    ...(clusters.length ? [{
      type: "chart" as SlideType,
      title: "Topp 10 kluster — uplift potential",
      chart: {
        id: "cluster_uplift",
        type: "bar_horizontal" as const,
        xKey: "name",
        series: [{ key: "uplift", label: "Uplift kr", color: PALETTE[0] }],
        data: clusters.slice(0, 10).map((c) => ({ name: c.name, uplift: c.uplift_potential_sek || 0 })),
      },
      data_source: "SÖKORDSANALYS",
    }] : []),
    ...(channels.length ? [{
      type: "table" as SlideType,
      title: "Kanal-attribution",
      table: {
        id: "channels",
        columns: [
          { key: "channel", label: "Kanal" },
          { key: "spend", label: "Spend", format: "sek" },
          { key: "revenue", label: "Intäkt", format: "sek" },
          { key: "roas", label: "ROAS", format: "decimal2" },
          { key: "spend_share", label: "Spend-andel", format: "pct100" },
        ],
        rows: channels,
      },
      data_source: "GA4 + GOOGLE ADS",
    }] : []),
    ...(clusters.length ? [{
      type: "table" as SlideType,
      title: "Kluster — ROI & uplift",
      table: {
        id: "clusters",
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
      },
      data_source: "SÖKORDSANALYS",
    }] : []),
    {
      type: "insight",
      title: "ROI-strategi",
      headline: ai?.opportunity_text || "Var pengarna betalar sig bäst",
      insight_text: ai?.insight_text || ai?.key_insight || "Aktivera AI-insikter för ROI-strategisk analys.",
      kpis: [],
      data_source: "AI-SYNTES · LOVABLE AI",
    },
    nextStepsSlide(ai?.next_steps || [
      { action: "Skala upp budget på högsta-ROAS-kanalen", effort: "låg", timeline: "Denna vecka" },
      { action: "Skapa innehåll för topp-3 uplift-kluster", effort: "medel", timeline: "14-30 dagar" },
      { action: "Pausa underpresterande kampanjer och omfördela budget", effort: "hög", timeline: "30-60 dagar" },
    ], ai?.total_value),
  ];

  return { slides };
}

// ---------- Generic fallback ----------
function tplGeneric(p: Payload): TemplateOutput {
  return {
    slides: [
      coverSlide(p),
      {
        type: "kpi_summary",
        title: "Rapport",
        headline: `Rapport: ${humanReportType(p.report_type)}`,
        kpis: [],
        bullets: ["Standardmall ej definierad för denna rapporttyp."],
      },
    ],
  };
}
