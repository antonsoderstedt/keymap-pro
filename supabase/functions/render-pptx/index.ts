// Renderar template-payload som .pptx per rapporttyp.
// Tar { artifact_id } eller { project_id, payload } och returnerar binär .pptx.
// Stödjer slides[]-arkitektur (nya rapporter) + bakåtkompatibel summary/charts/tables (gamla).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// Polyfill för pptxgenjs som internt använder `new Image()` (DOM API) i bild-pipeline.
// Deno saknar Image, så vi stubbar den till en async-load som alltid lyckas.
// @ts-ignore
if (typeof (globalThis as any).Image === "undefined") {
  // @ts-ignore
  (globalThis as any).Image = class {
    onload: ((ev?: any) => void) | null = null;
    onerror: ((ev?: any) => void) | null = null;
    width = 1; height = 1; naturalWidth = 1; naturalHeight = 1;
    private _src = "";
    get src() { return this._src; }
    set src(v: string) {
      this._src = v;
      queueMicrotask(() => { try { this.onload && this.onload(); } catch (_) {} });
    }
  };
}
// @ts-ignore – default export från ESM
import pptxgen from "https://esm.sh/pptxgenjs@3.12.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

// Slay Station-paletten (default; överrids av brand kit)
const BASE_COLORS = {
  bg: "0d0d0f",
  panel: "1a1a1d",
  panel2: "151518",
  border: "2a2a2e",
  text: "eaeaea",
  textMuted: "9a9a9f",
  primary: "b8f542",
  accent2: "5ab0ff",
  accent3: "ff7a59",
  accent4: "c084fc",
  accent5: "facc15",
  success: "34d399",
  danger: "f87171",
};
type Colors = typeof BASE_COLORS;

const FONT_HEAD = "Calibri";
const FONT_BODY = "Calibri";
const FONT_MONO = "Consolas";

const SLIDE_W = 13.333; // 16:9
const SLIDE_H = 7.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const isSelfTest = url.searchParams.get("self_test") === "1" || url.searchParams.get("test") === "1";
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true || body.validate_only === true || (isSelfTest && body.dry_run !== false);

    // ---- Self-test mode: build synthetic payload covering all 13 slide types ----
    if (isSelfTest) {
      const tpl = buildSelfTestTemplate();
      const validation = validateTemplate(tpl);
      const renderResults = dryRun ? null : await tryRenderTemplate(tpl);
      return j({
        mode: "self_test",
        slide_types_covered: Array.from(new Set(tpl.slides.map((s: any) => s.type))),
        slide_count: tpl.slides.length,
        validation,
        render: renderResults,
        ok: validation.ok && (!renderResults || renderResults.ok),
      }, validation.ok ? 200 : 422);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let artifact: any = null;
    if (body.artifact_id) {
      const { data, error } = await supabase
        .from("workspace_artifacts").select("*").eq("id", body.artifact_id).maybeSingle();
      if (error) throw error;
      artifact = data;
    } else if (body.payload) {
      artifact = { name: body.name || "Rapport", payload: body.payload, project_id: body.project_id };
    } else {
      return j({ error: "artifact_id eller payload krävs" }, 400);
    }
    if (!artifact?.payload?.template) return j({ error: "Rapporten saknar template" }, 400);

    const tpl = artifact.payload.template;
    const reportType = artifact.payload.report_type || "report";

    // Validate template before rendering (catches missing data keys early)
    const validation = validateTemplate(tpl);
    if (!validation.ok) console.warn("render-pptx validation issues", validation);
    if (dryRun) {
      return j({ mode: "validate_only", report_type: reportType, validation, ok: validation.ok }, validation.ok ? 200 : 422);
    }

    // Brand kit override
    const colors: Colors = { ...BASE_COLORS };
    let logoBase64: string | null = null;
    let logoMime = "image/png";
    const pid = artifact.project_id || artifact.payload?.project_id;
    if (pid) {
      try {
        const { data: bk } = await supabase.from("brand_kits").select("palette,logo_url").eq("project_id", pid).maybeSingle();
        const pal = (bk?.palette as any) || {};
        if (pal.primary) colors.primary = String(pal.primary).replace("#", "").toUpperCase().slice(0, 6);
        if (pal.secondary) colors.accent2 = String(pal.secondary).replace("#", "").toUpperCase().slice(0, 6);
        if (bk?.logo_url) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const r = await fetch(bk.logo_url, { signal: ctrl.signal });
            clearTimeout(t);
            if (r.ok) {
              const buf = new Uint8Array(await r.arrayBuffer());
              logoMime = r.headers.get("content-type") || (bk.logo_url.endsWith(".jpg") || bk.logo_url.endsWith(".jpeg") ? "image/jpeg" : "image/png");
              let bin = "";
              for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
              logoBase64 = btoa(bin);
            }
          } catch (e) { console.warn("logo fetch failed", e); }
        }
      } catch (e) { console.warn("brand_kits fetch failed", e); }
    }

    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    pres.author = "Slay Station";
    pres.title = artifact.name;

    // Nya slides[]-arkitekturen
    if (Array.isArray(tpl.slides) && tpl.slides.length) {
      for (const s of tpl.slides) renderSlide(pres, s, colors, logoBase64, logoMime, artifact);
    } else {
      // Legacy: linjär flow
      addTitleSlide(pres, artifact.name, reportType, artifact.payload.generated_at, artifact.payload.overall_status, colors, logoBase64, logoMime);
      addSummarySlide(pres, tpl.summary, colors);
      for (const chart of tpl.charts || []) addChartSlide(pres, chart, colors);
      for (const table of tpl.tables || []) addTableSlide(pres, table, colors);
    }

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
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// ---------- Slide dispatcher ----------
function renderSlide(pres: any, s: any, colors: Colors, logo: string | null, logoMime: string, artifact: any) {
  switch (s.type) {
    case "cover":         return renderCoverSlide(pres, s, colors, logo, logoMime, artifact);
    case "kpi_summary":   return renderKpiSummarySlide(pres, s, colors);
    case "chart":         return renderChartSlide(pres, s, colors);
    case "chart_split":   return renderChartSplitSlide(pres, s, colors);
    case "table":         return renderTableSlide(pres, s, colors);
    case "insight":       return renderInsightSlide(pres, s, colors);
    case "two_col":       return renderTwoColSlide(pres, s, colors);
    case "next_steps":    return renderNextStepsSlide(pres, s, colors);
    case "divider":       return renderDividerSlide(pres, s, colors);
    case "missing_data":  return renderMissingDataSlide(pres, s, colors);
    default:              return renderInsightSlide(pres, { ...s, type: "insight" }, colors);
  }
}

// ---------- Headers / footers ----------
function addSlideHeader(pres: any, slide: any, title: string, colors: Colors, period?: string) {
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.08, fill: { color: colors.primary }, line: { color: colors.primary } });
  slide.addText(title, { x: 0.5, y: 0.25, w: 9, h: 0.7, fontFace: FONT_HEAD, fontSize: 24, color: colors.text, bold: true });
  slide.addText("SLAY STATION" + (period ? `   ·   ${period}` : ""), {
    x: SLIDE_W - 5, y: 0.35, w: 4.5, h: 0.4,
    fontFace: FONT_MONO, fontSize: 10, color: colors.textMuted, align: "right", charSpacing: 2,
  });
}
// Källa-metadata per kanal: label + accentfärg-nyckel i Colors
const SOURCE_META: Record<string, { label: string; colorKey: keyof Colors }> = {
  gsc:          { label: "GSC",         colorKey: "primary" },
  ga4:          { label: "GA4",         colorKey: "accent2" },
  ads:          { label: "GOOGLE ADS",  colorKey: "accent5" },
  google_ads:   { label: "GOOGLE ADS",  colorKey: "accent5" },
  semrush:      { label: "SEMRUSH",     colorKey: "accent3" },
  dataforseo:   { label: "DATAFORSEO",  colorKey: "accent4" },
  ai:           { label: "AI",          colorKey: "accent4" },
  analyses:     { label: "ANALYS",      colorKey: "success" },
  scb:          { label: "SCB",         colorKey: "textMuted" },
  kpi_targets:  { label: "KPI-MÅL",     colorKey: "textMuted" },
  diagnostics:  { label: "DIAGNOSTIK",  colorKey: "danger" },
};

function inferSourceCodesFromText(text?: string): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const codes: string[] = [];
  const push = (c: string) => { if (!codes.includes(c)) codes.push(c); };
  if (/(search console|gsc)/.test(t)) push("gsc");
  if (/(analytics 4|ga4)/.test(t)) push("ga4");
  if (/(google ads|\bads\b)/.test(t)) push("ads");
  if (/semrush/.test(t)) push("semrush");
  if (/dataforseo/.test(t)) push("dataforseo");
  if (/(lovable ai|ai-syntes|ai-poäng|ai-analys)/.test(t)) push("ai");
  if (/(sökordsanalys|analys)/.test(t) && !codes.includes("ai")) push("analyses");
  if (/scb/.test(t)) push("scb");
  if (/kpi-mål/.test(t)) push("kpi_targets");
  if (/diagnostics|diagnostik/.test(t)) push("diagnostics");
  return codes;
}

// Sammanfattar exakt vilka datakällor en slide bygger på.
// Visar färgade pill-badges + ev. period (t.ex. "28D") till höger.
function addDataSourceFooter(pres: any, slide: any, s: any, colors: Colors) {
  // Strukturerad lista har företräde, annars härleds från fri-text data_source
  const codes: string[] = (Array.isArray(s.sources) && s.sources.length)
    ? s.sources : inferSourceCodesFromText(s.data_source);
  // Period kan komma från s.period eller härledas från data_source ("· 28D")
  const periodMatch = typeof s.data_source === "string" ? s.data_source.match(/·\s*([\d]{1,3}\s*[DWMd])/i) : null;
  const period: string | undefined = s.period || (periodMatch ? periodMatch[1].toUpperCase() : undefined);

  if (!codes.length && !period) return;

  // Footer-bar: tunn rad högst 0.5" från botten
  const footerY = SLIDE_H - 0.42;
  // Vänster: "DATAKÄLLOR"-etikett
  slide.addText("DATAKÄLLOR", {
    x: 0.5, y: footerY, w: 1.4, h: 0.28,
    fontFace: FONT_MONO, fontSize: 8, color: colors.textMuted, bold: true, charSpacing: 3, valign: "middle",
  });

  // Pills
  let cursorX = 1.95;
  const pillH = 0.28;
  for (const code of codes.slice(0, 6)) {
    const meta = SOURCE_META[code] || { label: code.toUpperCase(), colorKey: "textMuted" as keyof Colors };
    const accent = colors[meta.colorKey];
    const pillW = Math.max(0.55, 0.18 + meta.label.length * 0.085);
    if (cursorX + pillW > SLIDE_W - 1.5) break; // håll plats för period
    slide.addShape(pres.ShapeType.roundRect, {
      x: cursorX, y: footerY, w: pillW, h: pillH,
      fill: { color: colors.panel }, line: { color: accent, width: 0.75 }, rectRadius: 0.04,
    });
    // Liten färg-prick
    slide.addShape(pres.ShapeType.ellipse, {
      x: cursorX + 0.08, y: footerY + 0.09, w: 0.1, h: 0.1,
      fill: { color: accent }, line: { color: accent },
    });
    slide.addText(meta.label, {
      x: cursorX + 0.22, y: footerY, w: pillW - 0.28, h: pillH,
      fontFace: FONT_MONO, fontSize: 8, color: colors.text, bold: true, charSpacing: 1, valign: "middle",
    });
    cursorX += pillW + 0.1;
  }

  // Höger: period
  if (period) {
    slide.addText(`PERIOD · ${period}`, {
      x: SLIDE_W - 2.2, y: footerY, w: 1.7, h: pillH,
      fontFace: FONT_MONO, fontSize: 8, color: colors.textMuted, align: "right", charSpacing: 2, valign: "middle",
    });
  }
}

// ---------- Cover ----------
function renderCoverSlide(pres: any, s: any, colors: Colors, logo: string | null, logoMime: string, artifact: any) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.4, h: SLIDE_H, fill: { color: colors.primary }, line: { color: colors.primary } });
  slide.addText("SLAY STATION · RAPPORT", {
    x: 0.9, y: 0.6, w: 11, h: 0.4, fontFace: FONT_MONO, fontSize: 11, color: colors.primary, bold: true, charSpacing: 4,
  });
  slide.addText(s.title || artifact?.name || "Rapport", {
    x: 0.9, y: 1.2, w: 11.5, h: 2.2, fontFace: FONT_HEAD, fontSize: 48, color: colors.text, bold: true,
  });
  if (s.subtitle) slide.addText(s.subtitle, {
    x: 0.9, y: 3.6, w: 11, h: 0.5, fontFace: FONT_BODY, fontSize: 18, color: colors.textMuted, italic: true,
  });
  const meta = [s.period, s.data_source].filter(Boolean).join("   ·   ");
  if (meta) slide.addText(meta, {
    x: 0.9, y: SLIDE_H - 0.7, w: 11, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: colors.textMuted,
  });
  if (logo) {
    try {
      slide.addImage({ data: `data:${logoMime};base64,${logo}`, x: SLIDE_W - 1.8, y: SLIDE_H - 1.4, w: 1.4, h: 0.9 });
    } catch (e) { console.warn("addImage logo", e); }
  }
}

// ---------- KPI summary ----------
function renderKpiSummarySlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || "Sammanfattning", colors, s.period);
  if (s.headline) slide.addText(s.headline, {
    x: 0.5, y: 1.1, w: 12.3, h: 0.9, fontFace: FONT_HEAD, fontSize: 26, color: colors.text, bold: true,
  });

  const kpis = (s.kpis || []).slice(0, 4);
  if (kpis.length) {
    const cardW = (12.3 - (kpis.length - 1) * 0.2) / kpis.length;
    const cardY = 2.2; const cardH = 1.6;
    kpis.forEach((k: any, i: number) => {
      const x = 0.5 + i * (cardW + 0.2);
      slide.addShape(pres.ShapeType.roundRect, { x, y: cardY, w: cardW, h: cardH, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.08 });
      slide.addText(k.label, { x: x + 0.2, y: cardY + 0.15, w: cardW - 0.4, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.textMuted, bold: true, charSpacing: 2 });
      slide.addText(String(k.value ?? "—"), { x: x + 0.2, y: cardY + 0.5, w: cardW - 0.4, h: 0.7, fontFace: FONT_HEAD, fontSize: 26, color: colors.primary, bold: true });
      const sub = k.sub ? String(k.sub) : "";
      const arrow = k.trend === "up" ? "▲ " : k.trend === "down" ? "▼ " : "";
      const trendColor = k.trend === "up" ? colors.success : k.trend === "down" ? colors.danger : colors.textMuted;
      if (sub) slide.addText(arrow + sub, { x: x + 0.2, y: cardY + 1.2, w: cardW - 0.4, h: 0.3, fontFace: FONT_BODY, fontSize: 10, color: trendColor });
    });
  }

  const bullets = (s.bullets || []).slice(0, 6);
  if (bullets.length) {
    slide.addText(bullets.map((b: string) => ({ text: b, options: { bullet: { code: "25A0" }, color: colors.text } })), {
      x: 0.5, y: 4.2, w: 12.3, h: 2.7, fontFace: FONT_BODY, fontSize: 14, color: colors.text, paraSpaceAfter: 8,
    });
  }
  addDataSourceFooter(pres, slide, s, colors);
}

// ---------- Chart ----------
function chartOptsBase(colors: Colors, chart: any) {
  const colorList = (chart.series || []).map((sr: any, i: number) => (sr.color || ["b8f542","5ab0ff","ff7a59","c084fc","facc15","34d399"][i % 6]).replace("#", ""));
  return {
    chartColors: colorList,
    showLegend: true, legendFontFace: FONT_BODY, legendFontSize: 11, legendColor: colors.text, legendPos: "b",
    catAxisLabelFontFace: FONT_MONO, catAxisLabelFontSize: 9, catAxisLabelColor: colors.textMuted,
    valAxisLabelFontFace: FONT_MONO, valAxisLabelFontSize: 9, valAxisLabelColor: colors.textMuted,
    catGridLine: { style: "none" }, valGridLine: { color: colors.border, style: "solid", size: 1 },
    catAxisLineColor: colors.border, valAxisLineColor: colors.border,
    plotArea: { fill: { color: colors.panel } }, chartArea: { fill: { color: colors.bg }, border: { pt: 0, color: colors.bg } },
  };
}
function renderChartSlide(pres: any, s: any, colors: Colors) {
  const chart = s.chart;
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || chart?.title || "Diagram", colors);
  drawChart(pres, slide, chart, colors, { x: 0.5, y: 1.2, w: 12.3, h: 5.7 });
  addDataSourceFooter(pres, slide, s, colors);
}
function renderChartSplitSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || s.chart?.title || "Diagram", colors);
  drawChart(pres, slide, s.chart, colors, { x: 0.5, y: 1.2, w: 6.5, h: 5.7 });
  // Insight panel höger
  slide.addShape(pres.ShapeType.roundRect, { x: 7.3, y: 1.2, w: 5.5, h: 5.7, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.08 });
  slide.addText("INSIKT", { x: 7.6, y: 1.4, w: 5, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.primary, bold: true, charSpacing: 3 });
  slide.addText(s.insight_text || "—", { x: 7.6, y: 1.8, w: 5, h: 5, fontFace: FONT_BODY, fontSize: 14, color: colors.text, valign: "top" });
  addDataSourceFooter(pres, slide, s, colors);
}
function drawChart(pres: any, slide: any, chart: any, colors: Colors, pos: any) {
  if (!chart || !(chart.data || []).length) {
    slide.addText("Ingen data tillgänglig", { ...pos, fontFace: FONT_BODY, fontSize: 16, color: colors.textMuted, align: "center" });
    return;
  }
  const opts = { ...chartOptsBase(colors, chart), ...pos };
  if (chart.type === "pie") {
    const series = chart.series[0];
    const labels = chart.data.map((d: any) => String(d[chart.xKey] ?? ""));
    const values = chart.data.map((d: any) => Number(d[series.key]) || 0);
    const colorOverrides = chart.data.map((d: any, i: number) => (d.color || ["b8f542","5ab0ff","ff7a59","c084fc","facc15","34d399"][i % 6]).replace("#", ""));
    slide.addChart(pres.ChartType.pie, [{ name: series.label, labels, values }], {
      ...opts, chartColors: colorOverrides, showPercent: true,
      dataLabelFontFace: FONT_MONO, dataLabelFontSize: 10, dataLabelColor: colors.text,
    });
    return;
  }
  const labels = chart.data.map((d: any) => String(d[chart.xKey] ?? ""));
  const series = (chart.series || []).map((sr: any) => ({ name: sr.label, labels, values: chart.data.map((d: any) => Number(d[sr.key]) || 0) }));
  const ct = chart.type === "line" ? pres.ChartType.line : chart.type === "area" ? pres.ChartType.area : pres.ChartType.bar;
  slide.addChart(ct, series, { ...opts, barDir: chart.type === "bar_horizontal" ? "bar" : "col", barGrouping: "clustered" });
}

// ---------- Table ----------
function renderTableSlide(pres: any, s: any, colors: Colors) {
  const t = s.table;
  if (!t?.columns?.length) return;
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || t.title || "Tabell", colors);
  drawTable(pres, slide, t, colors, { x: 0.5, y: 1.2, w: 12.3, h: 5.7 });
  if (t.subtitle) slide.addText(t.subtitle, { x: 0.5, y: 0.95, w: 12.3, h: 0.25, fontFace: FONT_BODY, fontSize: 11, color: colors.textMuted, italic: true });
  addDataSourceFooter(pres, slide, s, colors);
}
function drawTable(pres: any, slide: any, table: any, colors: Colors, pos: any) {
  const cols = table.columns;
  const maxRows = table.max_rows || 18;
  const rows = (table.rows || []).slice(0, maxRows);
  const header = cols.map((c: any) => ({
    text: c.label,
    options: { bold: true, color: colors.bg, fill: { color: colors.primary }, fontFace: FONT_MONO, fontSize: 10, align: "left", valign: "middle" },
  }));
  const tableRows = [header, ...rows.map((r: any, ri: number) => cols.map((c: any) => ({
    text: fmtCell(r[c.key], c.format),
    options: {
      color: colors.text, fill: { color: ri % 2 === 0 ? colors.panel : colors.panel2 },
      fontFace: FONT_MONO, fontSize: 10,
      align: typeof r[c.key] === "number" || /^(num|sek|pct|decimal)/.test(c.format || "") ? "right" : "left",
      valign: "middle",
    },
  }))) ];
  slide.addTable(tableRows, { ...pos, colW: cols.map(() => pos.w / cols.length), rowH: 0.32, border: { type: "solid", pt: 0.5, color: colors.border }, autoPage: false });
  if ((table.rows || []).length > rows.length) {
    slide.addText(`Visar topp ${rows.length} av ${table.rows.length} rader`, {
      x: pos.x, y: pos.y + pos.h + 0.1, w: pos.w, h: 0.25, fontFace: FONT_MONO, fontSize: 9, color: colors.textMuted, align: "right",
    });
  }
}

// ---------- Insight ----------
function renderInsightSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || "Analys & Insikt", colors);
  if (s.headline) slide.addText(s.headline, { x: 0.5, y: 1.1, w: 12.3, h: 0.9, fontFace: FONT_HEAD, fontSize: 26, color: colors.text, bold: true });

  const kpis = (s.kpis || []).slice(0, 3);
  const hasKpis = kpis.length > 0;
  const textW = hasKpis ? 7.8 : 12.3;
  // Insight text panel
  slide.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 2.2, w: textW, h: 4.7, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.08 });
  slide.addText("INSIKT", { x: 0.8, y: 2.4, w: textW - 0.6, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.primary, bold: true, charSpacing: 3 });
  slide.addText(s.insight_text || "—", { x: 0.8, y: 2.8, w: textW - 0.6, h: 4, fontFace: FONT_BODY, fontSize: 14, color: colors.text, valign: "top", paraSpaceAfter: 6 });

  if (hasKpis) {
    const cardX = 8.5; const cardW = 4.3; const cardH = (4.7 - (kpis.length - 1) * 0.2) / kpis.length;
    kpis.forEach((k: any, i: number) => {
      const y = 2.2 + i * (cardH + 0.2);
      slide.addShape(pres.ShapeType.roundRect, { x: cardX, y, w: cardW, h: cardH, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.08 });
      slide.addText(k.label, { x: cardX + 0.2, y: y + 0.15, w: cardW - 0.4, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.textMuted, bold: true, charSpacing: 2 });
      slide.addText(String(k.value ?? "—"), { x: cardX + 0.2, y: y + 0.5, w: cardW - 0.4, h: 0.6, fontFace: FONT_HEAD, fontSize: 22, color: colors.primary, bold: true });
      if (k.sub) slide.addText(String(k.sub), { x: cardX + 0.2, y: y + cardH - 0.6, w: cardW - 0.4, h: 0.5, fontFace: FONT_BODY, fontSize: 10, color: colors.textMuted });
    });
  }
  addDataSourceFooter(pres, slide, s, colors);
}

// ---------- Two col ----------
function renderTwoColSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || "Översikt", colors);
  if (s.subtitle) slide.addText(s.subtitle, { x: 0.5, y: 0.95, w: 12.3, h: 0.25, fontFace: FONT_BODY, fontSize: 11, color: colors.textMuted, italic: true });
  const bullets = (s.left_bullets || s.bullets || []) as string[];
  if (bullets.length) {
    slide.addText(bullets.map((b) => ({ text: b, options: { bullet: { code: "25A0" }, color: colors.text } })), {
      x: 0.5, y: 1.3, w: 5.5, h: 5.5, fontFace: FONT_BODY, fontSize: 14, color: colors.text, paraSpaceAfter: 8,
    });
  } else if (s.insight_text) {
    slide.addText(s.insight_text, { x: 0.5, y: 1.3, w: 5.5, h: 5.5, fontFace: FONT_BODY, fontSize: 14, color: colors.text, valign: "top" });
  }
  if (s.table) drawTable(pres, slide, s.table, colors, { x: 6.3, y: 1.3, w: 6.5, h: 5.5 });
  addDataSourceFooter(pres, slide, s, colors);
}

// ---------- Next steps ----------
function renderNextStepsSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || "Rekommenderade nästa steg", colors);
  const steps = (s.next_steps || []).slice(0, 3);
  const cardW = (12.3 - (steps.length - 1) * 0.3) / Math.max(1, steps.length);
  const cardH = 4.5; const cardY = 1.5;
  steps.forEach((st: any, i: number) => {
    const x = 0.5 + i * (cardW + 0.3);
    slide.addShape(pres.ShapeType.roundRect, { x, y: cardY, w: cardW, h: cardH, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.08 });
    // Numreringscirkel
    slide.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: cardY + 0.3, w: 0.6, h: 0.6, fill: { color: colors.primary }, line: { color: colors.primary } });
    slide.addText(String(i + 1), { x: x + 0.3, y: cardY + 0.3, w: 0.6, h: 0.6, fontFace: FONT_HEAD, fontSize: 22, color: colors.bg, bold: true, align: "center", valign: "middle" });
    // Effort badge
    const effortColor = st.effort === "låg" ? colors.success : st.effort === "hög" ? colors.danger : colors.accent5;
    slide.addText(`EFFORT: ${(st.effort || "medel").toUpperCase()}`, { x: x + 1.0, y: cardY + 0.4, w: cardW - 1.2, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: effortColor, bold: true, charSpacing: 2 });
    // Action
    slide.addText(st.action || "—", { x: x + 0.3, y: cardY + 1.1, w: cardW - 0.6, h: 2.2, fontFace: FONT_HEAD, fontSize: 16, color: colors.text, bold: true, valign: "top" });
    // Värde
    if (st.estimated_value_sek) {
      slide.addText(fmtSek(st.estimated_value_sek), { x: x + 0.3, y: cardY + cardH - 1.3, w: cardW - 0.6, h: 0.5, fontFace: FONT_HEAD, fontSize: 20, color: colors.primary, bold: true });
      slide.addText("Estimerat månadsvärde", { x: x + 0.3, y: cardY + cardH - 0.8, w: cardW - 0.6, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.textMuted });
    }
    if (st.timeline) slide.addText(st.timeline, { x: x + 0.3, y: cardY + cardH - 0.4, w: cardW - 0.6, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: colors.textMuted, charSpacing: 1 });
  });
  if (s.total_value) {
    slide.addText(`Total potential: ${fmtSek(s.total_value)} / mån`, {
      x: 0.5, y: SLIDE_H - 0.7, w: 12.3, h: 0.4, fontFace: FONT_HEAD, fontSize: 16, color: colors.primary, bold: true, align: "center",
    });
  }
}

// ---------- Divider ----------
function renderDividerSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: SLIDE_H / 2 - 0.04, w: SLIDE_W, h: 0.08, fill: { color: colors.primary }, line: { color: colors.primary } });
  slide.addText(s.title || "Sektion", { x: 0.5, y: 2.5, w: 12.3, h: 1.5, fontFace: FONT_HEAD, fontSize: 54, color: colors.text, bold: true, align: "center" });
  if (s.subtitle) slide.addText(s.subtitle, { x: 0.5, y: 4.2, w: 12.3, h: 0.6, fontFace: FONT_BODY, fontSize: 18, color: colors.textMuted, italic: true, align: "center" });
}

// ---------- Missing data ----------
function renderMissingDataSlide(pres: any, s: any, colors: Colors) {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };
  addSlideHeader(pres, slide, s.title || "Data saknas", colors);
  slide.addShape(pres.ShapeType.roundRect, { x: 1.5, y: 2.0, w: 10.3, h: 4.3, fill: { color: colors.panel }, line: { color: colors.border, width: 1 }, rectRadius: 0.1 });
  slide.addText("⚠  DATA SAKNAS", { x: 1.8, y: 2.25, w: 9.7, h: 0.4, fontFace: FONT_MONO, fontSize: 11, color: colors.accent5, bold: true, charSpacing: 3, align: "center" });
  slide.addText(`Källa: ${s.missing_source || "—"}`, { x: 1.8, y: 2.8, w: 9.7, h: 0.5, fontFace: FONT_HEAD, fontSize: 22, color: colors.text, bold: true, align: "center" });

  // "Så åtgärdar du" — etikett + förklaring
  slide.addText("SÅ ÅTGÄRDAR DU", { x: 1.8, y: 3.7, w: 9.7, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: colors.primary, bold: true, charSpacing: 3, align: "center" });
  slide.addText(s.missing_resolution || "Kontrollera kopplingar i Inställningar", {
    x: 1.8, y: 4.05, w: 9.7, h: 1.4, fontFace: FONT_BODY, fontSize: 14, color: colors.text, align: "center", valign: "top",
  });

  if (s.missing_fix_url) {
    slide.addText(`→  Öppna: ${s.missing_fix_url}`, {
      x: 1.8, y: 5.6, w: 9.7, h: 0.4, fontFace: FONT_MONO, fontSize: 11, color: colors.primary, bold: true, align: "center", charSpacing: 1,
    });
  }
}

// ---------- Legacy renderers (bakåtkompatibilitet) ----------
function addTitleSlide(pres: any, name: string, reportType: string, generatedAt: string | undefined, status: string | undefined, colors: Colors, logo: string | null, logoMime: string) {
  renderCoverSlide(pres, {
    title: name, subtitle: humanReportType(reportType),
    period: generatedAt ? `Genererad: ${new Date(generatedAt).toLocaleString("sv-SE")}` : undefined,
    data_source: status ? `Status: ${status}` : undefined,
  }, colors, logo, logoMime, { name });
}
function addSummarySlide(pres: any, summary: any, colors: Colors) {
  if (!summary) return;
  renderKpiSummarySlide(pres, { title: "Sammanfattning", headline: summary.headline, kpis: summary.kpis, bullets: summary.bullets, period: summary.period?.start ? `${summary.period.start} → ${summary.period.end || ""}` : undefined }, colors);
}
function addChartSlide(pres: any, chart: any, colors: Colors) {
  renderChartSlide(pres, { title: chart.title, chart }, colors);
}
function addTableSlide(pres: any, table: any, colors: Colors) {
  renderTableSlide(pres, { title: table.title, table }, colors);
}

// ---------- Format helpers ----------
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
function fmtSek(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kr`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k kr`;
  return `${Math.round(n)} kr`;
}
function humanReportType(t: string): string {
  const labels: Record<string, string> = {
    executive: "Executive Månadsrapport", seo_performance: "SEO Performance",
    ga4_traffic: "GA4 Trafikrapport", keyword_universe: "Sökordsanalys",
    segments: "Segmentrapport", share_of_voice: "Share of Voice",
    auction_insights: "Auction Insights", competitor: "Konkurrentrapport",
    content_gap: "Content Gap", cannibalization: "Kannibaliseringsanalys",
    paid_vs_organic: "Paid vs Organic", yoy: "YoY / MoM Trend", roi: "ROI & Attribution",
  };
  return labels[t] || t;
}

// ============================================================
// Validation & Self-Test
// ============================================================

const KNOWN_SLIDE_TYPES = new Set([
  "cover","kpi_summary","chart","chart_split","table","insight",
  "two_col","next_steps","divider","missing_data",
]);

type ValidationIssue = { slide: number; type: string; severity: "error" | "warning"; message: string };
type ValidationResult = { ok: boolean; slide_count: number; issues: ValidationIssue[]; types_seen: string[] };

function validateTemplate(tpl: any): ValidationResult {
  const issues: ValidationIssue[] = [];
  const slides: any[] = Array.isArray(tpl?.slides) ? tpl.slides : [];
  const seen = new Set<string>();

  if (!slides.length) {
    // Legacy shape — accept if summary or charts exist
    if (!tpl?.summary && !(tpl?.charts || []).length && !(tpl?.tables || []).length) {
      issues.push({ slide: -1, type: "root", severity: "error", message: "Template saknar slides[], summary, charts och tables" });
    }
    return { ok: issues.length === 0, slide_count: 0, issues, types_seen: [] };
  }

  slides.forEach((s: any, i: number) => {
    const idx = i + 1;
    const t = String(s?.type || "");
    seen.add(t);
    if (!KNOWN_SLIDE_TYPES.has(t)) {
      issues.push({ slide: idx, type: t, severity: "warning", message: `Okänd slide-typ '${t}' (faller tillbaka till insight)` });
    }
    switch (t) {
      case "cover":
        if (!s.title) issues.push({ slide: idx, type: t, severity: "warning", message: "cover saknar title" });
        break;
      case "kpi_summary":
        if (!Array.isArray(s.kpis) || s.kpis.length === 0) issues.push({ slide: idx, type: t, severity: "warning", message: "kpi_summary saknar kpis[]" });
        else s.kpis.forEach((k: any, ki: number) => {
          if (k?.label == null) issues.push({ slide: idx, type: t, severity: "error", message: `kpi[${ki}] saknar label` });
          if (k?.value === undefined) issues.push({ slide: idx, type: t, severity: "warning", message: `kpi[${ki}] saknar value` });
        });
        break;
      case "chart":
      case "chart_split":
        if (!s.chart) { issues.push({ slide: idx, type: t, severity: "error", message: "saknar chart-objekt" }); break; }
        validateChart(s.chart, idx, t, issues);
        if (t === "chart_split" && !s.insight_text) issues.push({ slide: idx, type: t, severity: "warning", message: "chart_split saknar insight_text" });
        break;
      case "table":
        if (!s.table) { issues.push({ slide: idx, type: t, severity: "error", message: "saknar table-objekt" }); break; }
        validateTable(s.table, idx, t, issues);
        break;
      case "insight":
        if (!s.insight_text && !s.headline) issues.push({ slide: idx, type: t, severity: "warning", message: "insight saknar både headline och insight_text" });
        break;
      case "two_col":
        if (!s.left_bullets && !s.bullets && !s.insight_text && !s.table) issues.push({ slide: idx, type: t, severity: "warning", message: "two_col saknar innehåll (bullets/insight_text/table)" });
        break;
      case "next_steps":
        if (!Array.isArray(s.next_steps) || s.next_steps.length === 0) issues.push({ slide: idx, type: t, severity: "warning", message: "next_steps saknar steg" });
        else s.next_steps.forEach((st: any, si: number) => {
          if (!st?.action) issues.push({ slide: idx, type: t, severity: "error", message: `next_steps[${si}] saknar action` });
        });
        break;
      case "divider":
        if (!s.title) issues.push({ slide: idx, type: t, severity: "warning", message: "divider saknar title" });
        break;
      case "missing_data":
        if (!s.missing_source) issues.push({ slide: idx, type: t, severity: "warning", message: "missing_data saknar missing_source" });
        break;
    }
  });

  const hasError = issues.some((x) => x.severity === "error");
  return { ok: !hasError, slide_count: slides.length, issues, types_seen: Array.from(seen) };
}

function validateChart(chart: any, idx: number, t: string, issues: ValidationIssue[]) {
  if (!chart.type) issues.push({ slide: idx, type: t, severity: "error", message: "chart saknar type" });
  if (!chart.xKey && chart.type !== "pie") issues.push({ slide: idx, type: t, severity: "warning", message: "chart saknar xKey" });
  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    issues.push({ slide: idx, type: t, severity: "error", message: "chart saknar series[]" });
  } else {
    chart.series.forEach((sr: any, si: number) => {
      if (!sr?.key) issues.push({ slide: idx, type: t, severity: "error", message: `chart.series[${si}] saknar key` });
      if (!sr?.label) issues.push({ slide: idx, type: t, severity: "warning", message: `chart.series[${si}] saknar label` });
    });
  }
  if (!Array.isArray(chart.data) || chart.data.length === 0) {
    issues.push({ slide: idx, type: t, severity: "warning", message: "chart.data tomt — slide visar 'Ingen data tillgänglig'" });
  } else if (Array.isArray(chart.series)) {
    // Stickprov: kontrollera att första raden har alla seriernas keys
    const sample = chart.data[0] || {};
    const missing = chart.series.filter((sr: any) => sr?.key && !(sr.key in sample)).map((sr: any) => sr.key);
    if (missing.length) issues.push({ slide: idx, type: t, severity: "warning", message: `chart.data saknar nycklar: ${missing.join(", ")}` });
    if (chart.xKey && !(chart.xKey in sample)) issues.push({ slide: idx, type: t, severity: "warning", message: `chart.data saknar xKey '${chart.xKey}'` });
  }
}

function validateTable(table: any, idx: number, t: string, issues: ValidationIssue[]) {
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    issues.push({ slide: idx, type: t, severity: "error", message: "table saknar columns[]" });
    return;
  }
  table.columns.forEach((c: any, ci: number) => {
    if (!c?.key) issues.push({ slide: idx, type: t, severity: "error", message: `table.columns[${ci}] saknar key` });
    if (!c?.label) issues.push({ slide: idx, type: t, severity: "warning", message: `table.columns[${ci}] saknar label` });
  });
  if (!Array.isArray(table.rows)) {
    issues.push({ slide: idx, type: t, severity: "warning", message: "table saknar rows[]" });
  } else if (table.rows.length > 0) {
    const sample = table.rows[0] || {};
    const missing = table.columns.filter((c: any) => c?.key && !(c.key in sample)).map((c: any) => c.key);
    if (missing.length) issues.push({ slide: idx, type: t, severity: "warning", message: `table.rows saknar nycklar: ${missing.join(", ")}` });
  }
}

async function tryRenderTemplate(tpl: any): Promise<{ ok: boolean; bytes?: number; error?: string; per_slide: Array<{ index: number; type: string; ok: boolean; error?: string }> }> {
  const perSlide: Array<{ index: number; type: string; ok: boolean; error?: string }> = [];
  const colors: Colors = { ...BASE_COLORS };
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "Self Test";
  for (let i = 0; i < tpl.slides.length; i++) {
    const s = tpl.slides[i];
    try {
      renderSlide(pres, s, colors, null, "image/png", { name: "Self Test" });
      perSlide.push({ index: i + 1, type: s.type, ok: true });
    } catch (e: any) {
      perSlide.push({ index: i + 1, type: s.type, ok: false, error: e?.message || String(e) });
    }
  }
  try {
    const buf = await pres.write({ outputType: "uint8array", compression: true }) as Uint8Array;
    return { ok: perSlide.every((x) => x.ok), bytes: buf.length, per_slide: perSlide };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), per_slide: perSlide };
  }
}

function buildSelfTestTemplate(): { slides: any[] } {
  const sampleChart = {
    type: "line", title: "Klick över tid", xKey: "date",
    data: [{ date: "v1", clicks: 120, impr: 1200 }, { date: "v2", clicks: 180, impr: 1800 }, { date: "v3", clicks: 150, impr: 1500 }],
    series: [{ key: "clicks", label: "Klick" }, { key: "impr", label: "Visningar" }],
  };
  const sampleTable = {
    title: "Toppsökord", columns: [
      { key: "kw", label: "Sökord", format: "text" },
      { key: "clicks", label: "Klick", format: "num" },
      { key: "ctr", label: "CTR", format: "pct1" },
    ],
    rows: [
      { kw: "exempel sökord", clicks: 320, ctr: 4.2 },
      { kw: "annat sökord", clicks: 210, ctr: 3.1 },
    ],
  };
  return {
    slides: [
      { type: "cover", title: "Self Test Rapport", subtitle: "Validering av alla slide-typer", period: "Okt 2025", data_source: "Syntetiskt" },
      { type: "divider", title: "Sektion 1", subtitle: "Översikt" },
      { type: "kpi_summary", title: "KPI-sammanfattning", headline: "Stark månad", kpis: [
        { label: "Klick", value: "12,3k", sub: "+18% MoM", trend: "up" },
        { label: "CTR", value: "4,2%", sub: "−0,3pp", trend: "down" },
        { label: "Pos", value: "12,4", sub: "stabil", trend: "flat" },
        { label: "ROI", value: "3,8x", sub: "+0,4x", trend: "up" },
      ], bullets: ["Bullet ett", "Bullet två", "Bullet tre"], data_source: "GSC + GA4", sources: ["gsc","ga4"], period: "28D" },
      { type: "chart", title: "Trafik över tid", chart: sampleChart, sources: ["gsc"], period: "28D" },
      { type: "chart_split", title: "Trafik + insikt", chart: sampleChart, insight_text: "Klicken växer snabbare än visningar — CTR förbättras.", sources: ["gsc","ai"], period: "28D" },
      { type: "table", title: "Topp sökord", table: sampleTable, sources: ["gsc","semrush"], period: "28D" },
      { type: "insight", title: "Analys", headline: "Vad vi ser", insight_text: "Lorem ipsum analys-text som beskriver insikt och kontext.", kpis: [
        { label: "Möjlighet", value: "+25%", sub: "klick" },
        { label: "Risk", value: "−5%", sub: "pos" },
      ], data_source: "AI" },
      { type: "two_col", title: "Översikt", subtitle: "Två kolumner", left_bullets: ["Punkt A", "Punkt B", "Punkt C"], table: sampleTable, data_source: "Mix" },
      { type: "next_steps", title: "Nästa steg", next_steps: [
        { action: "Optimera title-tags på topp 20 sidor", effort: "låg", estimated_value_sek: 45000, timeline: "2 veckor" },
        { action: "Bygg internlänkning kring kluster X", effort: "medel", estimated_value_sek: 120000, timeline: "1 mån" },
        { action: "Lansera ny landningssida", effort: "hög", estimated_value_sek: 280000, timeline: "2 mån" },
      ], total_value: 445000 },
      { type: "missing_data", title: "Data saknas", missing_source: "DataForSEO", missing_resolution: "Aktivera kopplingen i Inställningar.", missing_fix_url: "/settings/connections" },
    ],
  };
}
