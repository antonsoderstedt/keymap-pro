// Renderar template-payload som .pptx per rapporttyp.
// Tar { artifact_id } eller { project_id, payload } och returnerar binär .pptx.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// @ts-ignore – default export från ESM
import pptxgen from "https://esm.sh/pptxgenjs@3.12.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

// Slay Station-paletten
const COLORS = {
  bg: "0d0d0f",
  panel: "1a1a1d",
  border: "2a2a2e",
  text: "eaeaea",
  textMuted: "9a9a9f",
  primary: "b8f542",
  accent2: "5ab0ff",
  accent3: "ff7a59",
  accent4: "c084fc",
  accent5: "facc15",
};
const SERIES_PALETTE = [COLORS.primary, COLORS.accent2, COLORS.accent3, COLORS.accent4, COLORS.accent5, "34d399", "f472b6"];

const FONT_HEAD = "Calibri";
const FONT_BODY = "Calibri";
const FONT_MONO = "Consolas";

const SLIDE_W = 13.333; // 16:9
const SLIDE_H = 7.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let artifact: any = null;
    if (body.artifact_id) {
      const { data, error } = await supabase
        .from("workspace_artifacts").select("*").eq("id", body.artifact_id).maybeSingle();
      if (error) throw error;
      artifact = data;
    } else if (body.payload) {
      artifact = { name: body.name || "Rapport", payload: body.payload };
    } else {
      return j({ error: "artifact_id eller payload krävs" }, 400);
    }
    if (!artifact?.payload?.template) return j({ error: "Rapporten saknar template" }, 400);

    const tpl = artifact.payload.template;
    const reportType = artifact.payload.report_type || "report";

    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    pres.author = "Slay Station";
    pres.title = artifact.name;

    addTitleSlide(pres, artifact.name, reportType, artifact.payload.generated_at, artifact.payload.overall_status);
    addSummarySlide(pres, tpl.summary);
    for (const chart of tpl.charts || []) addChartSlide(pres, chart);
    for (const table of tpl.tables || []) addTableSlide(pres, table);

    const buf = await pres.write({ outputType: "uint8array", compression: true }) as Uint8Array;
    const filename = `${slug(artifact.name)}.pptx`;

    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("render-pptx", e);
    return j({ error: e.message || String(e) }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// ---------- Slides ----------
function addTitleSlide(pres: any, name: string, reportType: string, generatedAt?: string, status?: string) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };

  // Lime accent-block top-left
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.4, h: SLIDE_H, fill: { color: COLORS.primary }, line: { color: COLORS.primary },
  });

  slide.addText("SLAY STATION · RAPPORT", {
    x: 0.9, y: 0.6, w: 11, h: 0.4,
    fontFace: FONT_MONO, fontSize: 11, color: COLORS.primary, bold: true, charSpacing: 4,
  });

  slide.addText(name, {
    x: 0.9, y: 1.2, w: 11.5, h: 2.2,
    fontFace: FONT_HEAD, fontSize: 48, color: COLORS.text, bold: true,
  });

  slide.addText(humanReportType(reportType), {
    x: 0.9, y: 3.6, w: 11, h: 0.5,
    fontFace: FONT_BODY, fontSize: 18, color: COLORS.textMuted, italic: true,
  });

  const meta = [
    generatedAt ? `Genererad: ${new Date(generatedAt).toLocaleString("sv-SE")}` : null,
    status ? `Status: ${status}` : null,
  ].filter(Boolean).join("   ·   ");
  if (meta) slide.addText(meta, {
    x: 0.9, y: SLIDE_H - 0.7, w: 11, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, color: COLORS.textMuted,
  });
}

function addSummarySlide(pres: any, summary: any) {
  if (!summary) return;
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };
  addSlideHeader(pres, slide, "Sammanfattning", summary.period);

  slide.addText(summary.headline || "", {
    x: 0.5, y: 1.2, w: 12.3, h: 1.0,
    fontFace: FONT_HEAD, fontSize: 28, color: COLORS.text, bold: true, valign: "top",
  });

  // KPI-kort
  const kpis = (summary.kpis || []).slice(0, 4);
  if (kpis.length) {
    const cardW = (12.3 - (kpis.length - 1) * 0.2) / kpis.length;
    const cardY = 2.5;
    const cardH = 1.6;
    kpis.forEach((k: any, i: number) => {
      const x = 0.5 + i * (cardW + 0.2);
      slide.addShape(pres.ShapeType.roundRect, {
        x, y: cardY, w: cardW, h: cardH,
        fill: { color: COLORS.panel }, line: { color: COLORS.border, width: 1 },
        rectRadius: 0.08,
      });
      slide.addText(k.label, {
        x: x + 0.2, y: cardY + 0.15, w: cardW - 0.4, h: 0.3,
        fontFace: FONT_MONO, fontSize: 9, color: COLORS.textMuted, bold: true, charSpacing: 2,
      });
      slide.addText(String(k.value ?? "—"), {
        x: x + 0.2, y: cardY + 0.5, w: cardW - 0.4, h: 0.7,
        fontFace: FONT_HEAD, fontSize: 28, color: COLORS.primary, bold: true,
      });
      if (k.sub) slide.addText(String(k.sub), {
        x: x + 0.2, y: cardY + 1.2, w: cardW - 0.4, h: 0.3,
        fontFace: FONT_BODY, fontSize: 10, color: COLORS.textMuted,
      });
    });
  }

  // Bullets
  const bullets = (summary.bullets || []).slice(0, 6);
  if (bullets.length) {
    slide.addText(bullets.map((b: string) => ({ text: b, options: { bullet: { code: "25A0" }, color: COLORS.text } })), {
      x: 0.5, y: 4.4, w: 12.3, h: 2.6,
      fontFace: FONT_BODY, fontSize: 14, color: COLORS.text, paraSpaceAfter: 8,
    });
  }
}

function addChartSlide(pres: any, chart: any) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };
  addSlideHeader(pres, slide, chart.title || "Diagram");

  const data = chart.data || [];
  if (!data.length) {
    slide.addText("Ingen data tillgänglig", {
      x: 0.5, y: 3, w: 12.3, h: 0.5, fontFace: FONT_BODY, fontSize: 16, color: COLORS.textMuted, align: "center",
    });
    return;
  }

  const chartOpts: any = {
    x: 0.5, y: 1.2, w: 12.3, h: 5.8,
    chartColors: chart.series?.map((s: any, i: number) => s.color?.replace("#", "") || SERIES_PALETTE[i % SERIES_PALETTE.length]) || SERIES_PALETTE,
    showLegend: true,
    legendFontFace: FONT_BODY,
    legendFontSize: 11,
    legendColor: COLORS.text,
    legendPos: "b",
    catAxisLabelFontFace: FONT_MONO,
    catAxisLabelFontSize: 9,
    catAxisLabelColor: COLORS.textMuted,
    valAxisLabelFontFace: FONT_MONO,
    valAxisLabelFontSize: 9,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { color: COLORS.border, style: "solid", size: 1 },
    catAxisLineColor: COLORS.border,
    valAxisLineColor: COLORS.border,
    plotArea: { fill: { color: COLORS.panel } },
    chartArea: { fill: { color: COLORS.bg }, border: { pt: 0, color: COLORS.bg } },
  };

  if (chart.type === "pie") {
    const series = chart.series[0];
    const labels = data.map((d: any) => String(d[chart.xKey] ?? ""));
    const values = data.map((d: any) => Number(d[series.key]) || 0);
    const colorOverrides = data.map((d: any, i: number) =>
      (d.color || SERIES_PALETTE[i % SERIES_PALETTE.length]).replace("#", ""));
    slide.addChart(pres.ChartType.pie, [{ name: series.label, labels, values }], {
      ...chartOpts,
      chartColors: colorOverrides,
      showPercent: true,
      dataLabelFontFace: FONT_MONO, dataLabelFontSize: 10, dataLabelColor: COLORS.text,
    });
    return;
  }

  const labels = data.map((d: any) => String(d[chart.xKey] ?? ""));
  const chartType = chart.type === "line" ? pres.ChartType.line
                    : chart.type === "area" ? pres.ChartType.area
                    : pres.ChartType.bar;

  const series = (chart.series || []).map((s: any) => ({
    name: s.label, labels, values: data.map((d: any) => Number(d[s.key]) || 0),
  }));

  slide.addChart(chartType, series, {
    ...chartOpts,
    barDir: "col",
    barGrouping: "clustered",
    showValue: false,
  });
}

function addTableSlide(pres: any, table: any) {
  const cols = table.columns || [];
  const rows = (table.rows || []).slice(0, 18); // ryms i en slide
  if (!cols.length) return;

  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };
  addSlideHeader(pres, slide, table.title || "Tabell");

  const header = cols.map((c: any) => ({
    text: c.label,
    options: {
      bold: true, color: COLORS.bg, fill: { color: COLORS.primary },
      fontFace: FONT_MONO, fontSize: 10, align: "left", valign: "middle",
    },
  }));

  const tableRows = [
    header,
    ...rows.map((r: any, ri: number) =>
      cols.map((c: any) => ({
        text: fmtCell(r[c.key], c.format),
        options: {
          color: COLORS.text,
          fill: { color: ri % 2 === 0 ? COLORS.panel : "151518" },
          fontFace: FONT_MONO, fontSize: 10,
          align: typeof r[c.key] === "number" || /^(num|sek|pct|decimal)/.test(c.format || "") ? "right" : "left",
          valign: "middle",
        },
      }))
    ),
  ];

  slide.addTable(tableRows, {
    x: 0.5, y: 1.2, w: 12.3, h: 5.8,
    colW: cols.map(() => 12.3 / cols.length),
    rowH: 0.32,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    autoPage: false,
  });

  if ((table.rows || []).length > rows.length) {
    slide.addText(`Visar topp ${rows.length} av ${table.rows.length} rader`, {
      x: 0.5, y: SLIDE_H - 0.4, w: 12.3, h: 0.3,
      fontFace: FONT_MONO, fontSize: 9, color: COLORS.textMuted, align: "right",
    });
  }
}

function addSlideHeader(pres: any, slide: any, title: string, period?: { start?: string; end?: string }) {
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: 0.08, fill: { color: COLORS.primary }, line: { color: COLORS.primary },
  });
  slide.addText(title, {
    x: 0.5, y: 0.25, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 24, color: COLORS.text, bold: true,
  });
  const periodTxt = period?.start ? `${period.start} → ${period.end || ""}` : "";
  slide.addText("SLAY STATION" + (periodTxt ? `   ·   ${periodTxt}` : ""), {
    x: SLIDE_W - 5, y: 0.35, w: 4.5, h: 0.4,
    fontFace: FONT_MONO, fontSize: 10, color: COLORS.textMuted, align: "right", charSpacing: 2,
  });
}

function fmtCell(v: any, f?: string): string {
  if (v == null || (typeof v === "number" && Number.isNaN(v))) return "—";
  const n = typeof v === "number" ? v : Number(v);
  switch (f) {
    case "sek": return Number.isFinite(n) ? (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k kr` : `${Math.round(n)} kr`) : String(v);
    case "num": return Number.isFinite(n) ? (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`) : String(v);
    case "pct1": return Number.isFinite(n) ? `${n.toFixed(1)}%` : String(v);
    case "pct100": return Number.isFinite(n) ? `${Math.round(n * 100)}%` : String(v);
    case "decimal1": return Number.isFinite(n) ? n.toFixed(1) : String(v);
    case "decimal2": return Number.isFinite(n) ? n.toFixed(2) : String(v);
    default: return typeof v === "number" ? n.toLocaleString("sv-SE") : String(v);
  }
}

function humanReportType(t: string): string {
  switch (t) {
    case "share_of_voice": return "Share of Voice";
    case "auction_insights": return "Auction Insights";
    case "yoy": return "YoY / MoM trend";
    case "roi": return "ROI & Attribution";
    default: return t;
  }
}
