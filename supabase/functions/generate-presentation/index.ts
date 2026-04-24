// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- helpers ----------
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const PALETTE = {
  bgDark: "0A0F1C",
  bgLight: "FFFFFF",
  surface: "F8FAFC",
  text: "0F172A",
  textInverse: "F8FAFC",
  muted: "64748B",
  primary: "6366F1",
  accent: "10B981",
  warning: "F59E0B",
  danger: "F43F5E",
  border: "E2E8F0",
};

const INTENT_LABELS: Record<string, string> = {
  informational: "Info", commercial: "Kommersiell", transactional: "Transaktionell", navigational: "Navigations",
};

// ---------- PPTX generation ----------
async function buildPptx(project: any, result: any, universe: any): Promise<Uint8Array> {
  const pptxgenMod: any = await import("https://esm.sh/pptxgenjs@3.12.0");
  const PptxGenJS = pptxgenMod.default ?? pptxgenMod;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
  pres.title = `${project?.name ?? "KEYMAP"} – Analysrapport`;

  const W = 13.33;
  const H = 7.5;

  const titleSlide = (s: any, title: string, subtitle?: string, dark = true) => {
    s.background = { color: dark ? PALETTE.bgDark : PALETTE.bgLight };
    s.addShape("rect", { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: PALETTE.primary }, line: { color: PALETTE.primary } });
    s.addText(title, {
      x: 0.6, y: 2.6, w: W - 1.2, h: 1.4,
      fontFace: "Inter Tight", fontSize: 56, bold: true,
      color: dark ? PALETTE.textInverse : PALETTE.text,
    });
    if (subtitle) {
      s.addText(subtitle, {
        x: 0.6, y: 4.1, w: W - 1.2, h: 0.6,
        fontFace: "Inter", fontSize: 18,
        color: dark ? "94A3B8" : PALETTE.muted,
      });
    }
  };

  const contentHeader = (s: any, sectionNo: string, title: string) => {
    s.background = { color: PALETTE.bgLight };
    s.addText(sectionNo, { x: 0.6, y: 0.4, w: 0.5, h: 0.4, fontFace: "JetBrains Mono", fontSize: 14, bold: true, color: PALETTE.primary });
    s.addText(title, { x: 1.1, y: 0.3, w: W - 2, h: 0.6, fontFace: "Inter Tight", fontSize: 28, bold: true, color: PALETTE.text });
    s.addShape("line", { x: 0.6, y: 1.0, w: W - 1.2, h: 0, line: { color: PALETTE.border, width: 1 } });
  };

  // Slide 1 — Cover
  const cover = pres.addSlide();
  titleSlide(cover, project?.name ?? "Analysrapport", `KEYMAP analys • ${new Date().toLocaleDateString("sv-SE")}`);

  // Slide 2 — Executive summary
  const sum = pres.addSlide();
  contentHeader(sum, "01", "Sammanfattning");
  sum.addText(result?.summary ?? "Ingen sammanfattning tillgänglig.", {
    x: 0.6, y: 1.4, w: W - 1.2, h: 4.5,
    fontFace: "Inter", fontSize: 18, color: PALETTE.text, valign: "top",
  });

  // Slide 3 — KPIs
  const totalVolume = (universe?.keywords ?? []).reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);
  const withCpc = (universe?.keywords ?? []).filter((k: any) => k.cpc != null);
  const avgCpc = withCpc.length > 0 ? withCpc.reduce((s: number, k: any) => s + (k.cpc ?? 0), 0) / withCpc.length : 0;
  const priorityCount = (universe?.keywords ?? []).filter((k: any) => k.priority === "high" && !k.isNegative).length;

  const kpiSlide = pres.addSlide();
  contentHeader(kpiSlide, "02", "Nyckeltal");
  const kpis = [
    { label: "TOTALA SÖKORD", value: (universe?.totalKeywords ?? result?.totalKeywords ?? 0).toLocaleString("sv-SE"), color: PALETTE.primary },
    { label: "MÅNADSVOLYM", value: totalVolume.toLocaleString("sv-SE"), color: PALETTE.accent },
    { label: "SNITT-CPC", value: avgCpc > 0 ? `${avgCpc.toFixed(2)} kr` : "—", color: PALETTE.warning },
    { label: "PRIORITERADE", value: String(priorityCount), color: PALETTE.danger },
  ];
  const cardW = (W - 1.2 - 0.6) / 4;
  kpis.forEach((k, i) => {
    const x = 0.6 + i * (cardW + 0.2);
    kpiSlide.addShape("roundRect", { x, y: 1.6, w: cardW, h: 2.4, rectRadius: 0.12, fill: { color: PALETTE.surface }, line: { color: PALETTE.border, width: 1 } });
    kpiSlide.addText(k.label, { x: x + 0.2, y: 1.8, w: cardW - 0.4, h: 0.4, fontFace: "Inter", fontSize: 11, bold: true, color: PALETTE.muted, charSpacing: 1.5 });
    kpiSlide.addText(k.value, { x: x + 0.2, y: 2.4, w: cardW - 0.4, h: 1.2, fontFace: "JetBrains Mono", fontSize: 36, bold: true, color: k.color });
  });

  // Slide 4 — Intent fördelning (pie chart)
  const intentCounts: Record<string, number> = {};
  (universe?.keywords ?? []).forEach((k: any) => {
    if (k.isNegative) return;
    intentCounts[k.intent] = (intentCounts[k.intent] ?? 0) + 1;
  });
  const intentEntries = Object.entries(intentCounts);
  if (intentEntries.length > 0) {
    const intentSlide = pres.addSlide();
    contentHeader(intentSlide, "03", "Sökord per intent");
    intentSlide.addChart(pres.ChartType.doughnut, [{
      name: "Intent",
      labels: intentEntries.map(([k]) => INTENT_LABELS[k] ?? k),
      values: intentEntries.map(([, v]) => v),
    }], {
      x: 0.6, y: 1.4, w: W - 1.2, h: 5.5,
      chartColors: ["6366F1", "10B981", "F59E0B", "F43F5E", "06B6D4"],
      showLegend: true, legendPos: "r", legendFontSize: 14, legendFontFace: "Inter",
      dataLabelFontSize: 12,
    });
  }

  // Slides 5+ — Per segment
  const segments = (result?.segments ?? []).slice().sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);
  segments.slice(0, 8).forEach((seg: any, i: number) => {
    const s = pres.addSlide();
    contentHeader(s, `04.${i + 1}`, seg.name);
    s.addShape("roundRect", { x: 0.6, y: 1.4, w: 2.2, h: 1.4, rectRadius: 0.1, fill: { color: PALETTE.primary } });
    s.addText(`${seg.opportunityScore}/10`, { x: 0.6, y: 1.5, w: 2.2, h: 1.2, fontFace: "JetBrains Mono", fontSize: 36, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    s.addText("OPPORTUNITY SCORE", { x: 0.6, y: 2.55, w: 2.2, h: 0.25, fontFace: "Inter", fontSize: 9, bold: true, color: "FFFFFFB0", align: "center", charSpacing: 1.5 });
    s.addText(`SNI ${seg.sniCode ?? "—"} · ${(seg.size ?? 0).toLocaleString("sv-SE")} företag`, {
      x: 3.0, y: 1.4, w: W - 3.6, h: 0.3, fontFace: "Inter", fontSize: 12, color: PALETTE.muted,
    });
    if (seg.insight) {
      s.addText(seg.insight, { x: 3.0, y: 1.8, w: W - 3.6, h: 1.0, fontFace: "Inter", fontSize: 14, italic: true, color: PALETTE.text, valign: "top" });
    }
    if (seg.primaryKeywords?.length) {
      const rows: any[][] = [
        [{ text: "Sökord", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
         { text: "Volym", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
         { text: "Intent", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
         { text: "Kanal", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } }],
      ];
      seg.primaryKeywords.slice(0, 8).forEach((kw: any) => {
        rows.push([
          { text: kw.keyword, options: { fontFace: "JetBrains Mono", fontSize: 11 } },
          { text: kw.volumeEstimate ?? "", options: { fontSize: 11 } },
          { text: kw.intent ?? "", options: { fontSize: 11 } },
          { text: kw.channel ?? "", options: { fontSize: 11 } },
        ]);
      });
      s.addTable(rows, { x: 0.6, y: 3.0, w: W - 1.2, colW: [4.5, 1.6, 2.0, W - 1.2 - 4.5 - 1.6 - 2.0], fontSize: 11, color: PALETTE.text, border: { type: "solid", color: PALETTE.border, pt: 0.5 } });
    }
  });

  // Top 10 priority keywords
  const top = (universe?.keywords ?? [])
    .filter((k: any) => k.priority === "high" && !k.isNegative)
    .sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 10);
  if (top.length > 0) {
    const s = pres.addSlide();
    contentHeader(s, "05", "Topp 10 prioriterade sökord");
    const rows: any[][] = [
      [{ text: "#", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
       { text: "Sökord", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
       { text: "Volym/mån", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
       { text: "CPC", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
       { text: "KD%", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } },
       { text: "Kanal", options: { bold: true, fill: { color: PALETTE.surface }, color: PALETTE.muted } }],
    ];
    top.forEach((k: any, i: number) => {
      rows.push([
        { text: String(i + 1), options: { fontFace: "JetBrains Mono", fontSize: 12, color: PALETTE.muted } },
        { text: k.keyword, options: { fontFace: "JetBrains Mono", fontSize: 12 } },
        { text: (k.searchVolume ?? 0).toLocaleString("sv-SE"), options: { fontSize: 12 } },
        { text: k.cpc != null ? k.cpc.toFixed(2) : "—", options: { fontSize: 12 } },
        { text: k.kd != null ? String(Math.round(k.kd)) : "—", options: { fontSize: 12 } },
        { text: k.channel ?? "—", options: { fontSize: 12 } },
      ]);
    });
    s.addTable(rows, { x: 0.6, y: 1.4, w: W - 1.2, colW: [0.6, 5.5, 1.8, 1.2, 1.0, 2.03], fontSize: 12, color: PALETTE.text, border: { type: "solid", color: PALETTE.border, pt: 0.5 } });
  }

  // Quick wins
  if (result?.quickWins?.length) {
    const s = pres.addSlide();
    contentHeader(s, "06", "Quick wins");
    const items = result.quickWins.slice(0, 6);
    const cardH = 1.6;
    items.forEach((q: any, i: number) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.6 + col * ((W - 1.2) / 2 + 0.2);
      const y = 1.4 + row * (cardH + 0.25);
      const w = (W - 1.2 - 0.2) / 2;
      s.addShape("roundRect", { x, y, w, h: cardH, rectRadius: 0.1, fill: { color: PALETTE.surface }, line: { color: PALETTE.accent, width: 1 } });
      s.addText(q.keyword, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.4, fontFace: "JetBrains Mono", fontSize: 14, bold: true, color: PALETTE.text });
      s.addText(q.action, { x: x + 0.2, y: y + 0.6, w: w - 0.4, h: 0.6, fontFace: "Inter", fontSize: 11, color: PALETTE.text });
      s.addText(`${q.channel} · ${q.intent}`, { x: x + 0.2, y: y + 1.2, w: w - 0.4, h: 0.3, fontFace: "Inter", fontSize: 10, color: PALETTE.muted });
    });
  }

  // Final
  const end = pres.addSlide();
  titleSlide(end, "Tack!", `Frågor? · ${new Date().toLocaleDateString("sv-SE")}`);

  const buf = await pres.write({ outputType: "uint8array" });
  return buf as Uint8Array;
}

// ---------- PDF generation ----------
async function buildPdf(project: any, result: any, universe: any): Promise<Uint8Array> {
  const pdfLib: any = await import("https://esm.sh/pdf-lib@1.17.1");
  const { PDFDocument, StandardFonts, rgb } = pdfLib;

  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Landscape A4-ish: 842 x 595
  const W = 842, H = 595;

  const c = {
    bgDark: rgb(0.039, 0.059, 0.110),
    text: rgb(0.059, 0.090, 0.165),
    muted: rgb(0.392, 0.455, 0.545),
    primary: rgb(0.388, 0.400, 0.945),
    accent: rgb(0.063, 0.725, 0.506),
    surface: rgb(0.973, 0.980, 0.988),
    border: rgb(0.886, 0.910, 0.941),
  };

  const drawText = (page: any, text: string, x: number, y: number, opts: any = {}) => {
    page.drawText(String(text ?? ""), {
      x, y: H - y, // top-down coordinates
      size: opts.size ?? 11,
      font: opts.bold ? helvBold : helv,
      color: opts.color ?? c.text,
      maxWidth: opts.maxWidth,
      lineHeight: opts.lineHeight ?? (opts.size ?? 11) * 1.3,
    });
  };

  const wrap = (s: string, font: any, size: number, maxW: number): string[] => {
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const titlePage = (title: string, subtitle: string) => {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: c.bgDark });
    p.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: c.primary });
    p.drawText(title, { x: 50, y: H - 240, size: 44, font: helvBold, color: rgb(0.973, 0.980, 0.988) });
    p.drawText(subtitle, { x: 50, y: H - 280, size: 14, font: helv, color: rgb(0.580, 0.639, 0.722) });
    return p;
  };

  const contentPage = (sectionNo: string, title: string) => {
    const p = doc.addPage([W, H]);
    p.drawText(sectionNo, { x: 50, y: H - 50, size: 12, font: helvBold, color: c.primary });
    p.drawText(title, { x: 90, y: H - 52, size: 22, font: helvBold, color: c.text });
    p.drawLine({ start: { x: 50, y: H - 70 }, end: { x: W - 50, y: H - 70 }, thickness: 1, color: c.border });
    return p;
  };

  // Cover
  titlePage(project?.name ?? "Analysrapport", `KEYMAP analys · ${new Date().toLocaleDateString("sv-SE")}`);

  // Summary
  if (result?.summary) {
    const p = contentPage("01", "Sammanfattning");
    const lines = wrap(result.summary, helv, 14, W - 100);
    lines.slice(0, 24).forEach((line, i) => {
      p.drawText(line, { x: 50, y: H - 110 - i * 22, size: 14, font: helv, color: c.text });
    });
  }

  // KPIs
  const totalVolume = (universe?.keywords ?? []).reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);
  const withCpc = (universe?.keywords ?? []).filter((k: any) => k.cpc != null);
  const avgCpc = withCpc.length > 0 ? withCpc.reduce((s: number, k: any) => s + (k.cpc ?? 0), 0) / withCpc.length : 0;
  const priorityCount = (universe?.keywords ?? []).filter((k: any) => k.priority === "high" && !k.isNegative).length;
  {
    const p = contentPage("02", "Nyckeltal");
    const kpis = [
      ["TOTALA SÖKORD", (universe?.totalKeywords ?? result?.totalKeywords ?? 0).toLocaleString("sv-SE"), c.primary],
      ["MÅNADSVOLYM", totalVolume.toLocaleString("sv-SE"), c.accent],
      ["SNITT-CPC", avgCpc > 0 ? `${avgCpc.toFixed(2)} kr` : "—", rgb(0.961, 0.620, 0.043)],
      ["PRIORITERADE", String(priorityCount), rgb(0.957, 0.247, 0.369)],
    ];
    const cardW = (W - 100 - 30) / 4;
    kpis.forEach(([label, value, color], i) => {
      const x = 50 + i * (cardW + 10);
      const y = H - 230;
      p.drawRectangle({ x, y, width: cardW, height: 130, color: c.surface, borderColor: c.border, borderWidth: 1 });
      p.drawText(label as string, { x: x + 16, y: y + 100, size: 10, font: helvBold, color: c.muted });
      p.drawText(value as string, { x: x + 16, y: y + 35, size: 32, font: helvBold, color: color as any });
    });
  }

  // Segments
  const segments = (result?.segments ?? []).slice().sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);
  segments.slice(0, 8).forEach((seg: any, idx: number) => {
    const p = contentPage(`03.${idx + 1}`, seg.name ?? "Segment");
    p.drawRectangle({ x: 50, y: H - 200, width: 130, height: 90, color: c.primary });
    p.drawText(`${seg.opportunityScore}/10`, { x: 65, y: H - 170, size: 28, font: helvBold, color: rgb(1, 1, 1) });
    p.drawText("OPPORTUNITY", { x: 65, y: H - 195, size: 8, font: helvBold, color: rgb(1, 1, 1, ) });
    p.drawText(`SNI ${seg.sniCode ?? "—"} · ${(seg.size ?? 0).toLocaleString("sv-SE")} företag`, { x: 200, y: H - 130, size: 11, font: helv, color: c.muted });
    if (seg.insight) {
      const lines = wrap(seg.insight, helv, 12, W - 250);
      lines.slice(0, 4).forEach((line, i) => p.drawText(line, { x: 200, y: H - 155 - i * 18, size: 12, font: helv, color: c.text }));
    }
    if (seg.primaryKeywords?.length) {
      let y = H - 240;
      p.drawText("Topp-sökord", { x: 50, y, size: 11, font: helvBold, color: c.muted });
      y -= 22;
      seg.primaryKeywords.slice(0, 8).forEach((kw: any) => {
        p.drawRectangle({ x: 50, y: y - 4, width: W - 100, height: 24, color: c.surface });
        p.drawText(kw.keyword ?? "", { x: 60, y: y + 4, size: 11, font: helv, color: c.text });
        p.drawText(`${kw.volumeEstimate ?? ""} · ${kw.intent ?? ""} · ${kw.channel ?? ""}`, { x: 400, y: y + 4, size: 10, font: helv, color: c.muted });
        y -= 28;
      });
    }
  });

  // Top 10
  const top = (universe?.keywords ?? [])
    .filter((k: any) => k.priority === "high" && !k.isNegative)
    .sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 10);
  if (top.length > 0) {
    const p = contentPage("04", "Topp 10 prioriterade sökord");
    let y = H - 110;
    p.drawText("#", { x: 50, y, size: 10, font: helvBold, color: c.muted });
    p.drawText("Sökord", { x: 90, y, size: 10, font: helvBold, color: c.muted });
    p.drawText("Volym", { x: 470, y, size: 10, font: helvBold, color: c.muted });
    p.drawText("CPC", { x: 580, y, size: 10, font: helvBold, color: c.muted });
    p.drawText("KD%", { x: 650, y, size: 10, font: helvBold, color: c.muted });
    p.drawText("Kanal", { x: 720, y, size: 10, font: helvBold, color: c.muted });
    y -= 8;
    p.drawLine({ start: { x: 50, y }, end: { x: W - 50, y }, thickness: 0.5, color: c.border });
    y -= 18;
    top.forEach((k: any, i: number) => {
      p.drawText(String(i + 1), { x: 50, y, size: 11, font: helvBold, color: c.muted });
      p.drawText(k.keyword ?? "", { x: 90, y, size: 11, font: helv, color: c.text });
      p.drawText((k.searchVolume ?? 0).toLocaleString("sv-SE"), { x: 470, y, size: 11, font: helv, color: c.text });
      p.drawText(k.cpc != null ? k.cpc.toFixed(2) : "—", { x: 580, y, size: 11, font: helv, color: c.text });
      p.drawText(k.kd != null ? String(Math.round(k.kd)) : "—", { x: 650, y, size: 11, font: helv, color: c.text });
      p.drawText(k.channel ?? "—", { x: 720, y, size: 11, font: helv, color: c.text });
      y -= 24;
    });
  }

  // Quick wins
  if (result?.quickWins?.length) {
    const p = contentPage("05", "Quick wins");
    const items = result.quickWins.slice(0, 6);
    items.forEach((q: any, i: number) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cardW = (W - 100 - 20) / 2;
      const cardH = 130;
      const x = 50 + col * (cardW + 20);
      const y = H - 110 - row * (cardH + 18);
      p.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: c.surface, borderColor: c.accent, borderWidth: 1 });
      p.drawText(q.keyword ?? "", { x: x + 14, y: y - 28, size: 13, font: helvBold, color: c.text });
      const lines = wrap(q.action ?? "", helv, 10, cardW - 28);
      lines.slice(0, 4).forEach((line, j) => p.drawText(line, { x: x + 14, y: y - 50 - j * 14, size: 10, font: helv, color: c.text }));
      p.drawText(`${q.channel ?? ""} · ${q.intent ?? ""}`, { x: x + 14, y: y - cardH + 14, size: 9, font: helvBold, color: c.muted });
    });
  }

  // End
  titlePage("Tack!", `Frågor? · ${new Date().toLocaleDateString("sv-SE")}`);

  const bytes = await doc.save();
  return bytes as Uint8Array;
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis_id, format } = await req.json();
    if (!analysis_id || !["pptx", "pdf"].includes(format)) {
      return new Response(JSON.stringify({ error: "analysis_id och format (pptx|pdf) krävs" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: analysis, error: aErr } = await supabase
      .from("analyses")
      .select("id, project_id, result_json, keyword_universe_json")
      .eq("id", analysis_id)
      .single();
    if (aErr || !analysis) throw new Error(aErr?.message || "Analys hittades inte");

    const { data: project } = await supabase
      .from("projects")
      .select("name, company")
      .eq("id", (analysis as any).project_id)
      .single();

    const result = (analysis as any).result_json;
    const universe = (analysis as any).keyword_universe_json;

    const bytes = format === "pptx"
      ? await buildPptx(project, result, universe)
      : await buildPdf(project, result, universe);

    return new Response(JSON.stringify({ file: bytesToBase64(bytes), format }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-presentation error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
