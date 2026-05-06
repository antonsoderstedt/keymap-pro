
# Kompletta rapporter — spec-driven slides

Bygg om rapport-pipelinen från en rigid `{summary, charts, tables}`-modell till en `slides: SlideSpec[]`-arkitektur där varje slide har en typ och egen data. Lägg till AI-genererade insikter och Brand Kit-stöd i PPTX-renderaren.

Ändringarna håller sig till tre filer + bakåtkompatibilitet för redan sparade artifacts.

---

## Anpassningar mot uppladdad spec

Två avvikelser som följer projektets verklighet — resten är trogen specen:

1. **AI: Lovable AI Gateway istället för `GEMINI_API_KEY`.**  
   Projektets standard är Lovable AI (`LOVABLE_API_KEY` finns redan som secret, ingen `GEMINI_API_KEY`). Vi anropar `https://ai.gateway.lovable.dev/v1/chat/completions` med modell `google/gemini-2.5-flash` och `response_format: { type: "json_object" }`. Samma prompt, samma JSON-schema, samma fallback-beteende.

2. **Brand kit-kolumner ligger i JSONB.**  
   Specen läser `primary_color`, `secondary_color`, `logo_url` som flata kolumner. I databasen finns istället `palette` (JSONB med `primary`, `secondary`, …) och `logo_url` som flat kolumn. Render-pptx hämtar `palette, logo_url` och plockar `palette.primary` / `palette.secondary`.

---

## Del 1 — `_templates.ts` (största filen)

Skriv om i sin helhet med:

- Nya typer: `SlideType`, `SlideSpec`, `KpiItem`, `ChartSpec`, `TableSpec`, `NextStep`, `TemplateOutput` enligt specen.
- `buildTemplate(payload)` switchar på `payload.report_type` till 13 mallfunktioner, lägger automatiskt till cover-slide om mallen inte gör det själv, och returnerar `{ slides }`. För bakåtkompatibilitet behåller vi även en härledd `summary`-shape (tom om slides används).
- Hjälpare: `coverSlide`, `missingSlide`, `nextStepsSlide`, `formatPeriod`, `pct`, `fmtNum`, `fmtSek`, `humanReportType`, `PALETTE`.
- 13 mallfunktioner enligt specen:
  - `tplExecutive`, `tplSeoPerformance`, `tplGa4Traffic`, `tplKeywordUniverse`, `tplSegments`, `tplCompetitor`, `tplContentGap`, `tplCannibalization`, `tplPaidVsOrganic` — alla med `coverSlide → kpi_summary → 1-2 charts → 1-2 tables → insight → next_steps`.
  - `tplSov`, `tplAuction`, `tplYoy`, `tplRoi` — migreras från nuvarande `{summary, charts, tables}`-shape till samma slides-mönster (kpi_summary + de befintliga chart/table-blocken + insight + next_steps).
  - `tplGeneric` fallback för okända typer.
- `tplCannibalization` returnerar "frisk"-slide om `d.cannibalized_keywords?.length === 0`.
- Alla mallar returnerar `missingSlide` om datasektionen saknas.

## Del 2 — `generate-report/index.ts`

- Lägg till 9 nya `case`-block för `executive`, `seo_performance`, `ga4_traffic`, `keyword_universe`, `segments`, `competitor`, `content_gap`, `cannibalization`, `paid_vs_organic` som hämtar data från befintliga snapshot-tabeller (`gsc_snapshots`, `ga4_snapshots`, `analyses` (för keyword universe / segments / content_gap), `backlink_gaps`, `auction_insights_snapshots`, `action_items` med `source_type` SEO/Ads-diagnos) och anropar `mark(key, status, reason?, data)` med samma struktur som befintliga case.
- Efter `switch`: hämta projektet (`projects.name, domain`), berika `payload` med `project_domain`, `report_name`, `period_label`, `sources`.
- Efter datainsamling, **innan** `buildTemplate`: kör `aiInsights = await generateAiInsights(report_type, sections, payload)` om `LOVABLE_API_KEY` finns. Sätt `payload.ai_insights = aiInsights`. Wrappa i try/catch — AI-fel ska aldrig stoppa rapporten.
- Ny funktion `generateAiInsights(reportType, sections, payload)`:
  - Komprimerar varje OK/partial-sektions data till max ~2000 tecken JSON.
  - POSTar till Lovable AI Gateway med `model: "google/gemini-2.5-flash"`, `response_format: { type: "json_object" }`, max ~1000 tokens.
  - System-prompt: "Du är en erfaren digital marknadsanalytiker… svara med JSON enligt schema".
  - Schemat returnerar `{ [reportType]: { report_headline, key_insight, opportunity_text, opportunity_value, opportunity_short, risk_text, risk_level, risk_short, insight_text, total_value, next_steps:[{action,estimated_value_sek,effort,timeline}] } }`.
  - Returnerar `{}` vid 429/402/fel — mallarna har redan fallback-text.

## Del 3 — `render-pptx/index.ts`

- Hämta brand kit efter att artifact lästs in:
  ```ts
  const pid = artifact.project_id || artifact.payload?.project_id;
  const { data: bk } = await supabase
    .from("brand_kits")
    .select("palette, logo_url")
    .eq("project_id", pid)
    .maybeSingle();
  ```
  Bygg `brandColors` genom att override:a `COLORS.primary` och `COLORS.accent2` från `bk.palette?.primary` / `bk.palette?.secondary` (strippa `#`, uppercase). Hämta logo via `fetch(bk.logo_url)` med 5s timeout, base64-encoda. Misslyckas hämtningen — fortsätt utan logo.
- Ny dispatcher `renderSlide(pres, spec, colors, logoBase64, logoMime)` som routar på `spec.type` till:
  - `renderCoverSlide` — befintlig `addTitleSlide`-stil men tar emot `colors` + lägger logo nere till vänster om base64 finns.
  - `renderKpiSummarySlide` — befintlig `addSummarySlide`-logik, parametriserad med `colors`.
  - `chart` → befintlig `addChartSlide` med `colors` + `data_source`-footer.
  - `renderChartSplitSlide` — vänster halvbreds chart, höger insight-text-panel.
  - `table` → befintlig `addTableSlide` parametriserad.
  - `renderInsightSlide` — headline + insight-text-panel + upp till 3 KPI-kort höger.
  - `renderTwoColSlide` — vänster bullets/text, höger tabell.
  - `renderNextStepsSlide` — 3 numrerade åtgärdskort med effort-badge och totalvärde-footer.
  - `renderDividerSlide` — fullbredd sektionstitel.
  - `renderMissingDataSlide` — centrerad CTA-panel med källa + resolution.
- Ny hjälpare `addDataSourceFooter(slide, source, colors)` som alla slide-typer kallar om `spec.data_source` finns.
- Huvudloopen i `Deno.serve`:
  ```ts
  if (Array.isArray(tpl.slides)) {
    for (const s of tpl.slides) renderSlide(pres, s, brandColors, logoBase64, logoMime);
  } else {
    // Legacy: nuvarande linjära flow för gamla artifacts
  }
  ```
- Utöka `humanReportType` med alla 13 etiketter.

## Del 4 — verifiering

Efter implementation:
1. Bygg-output (TypeScript-fel) ska vara rent.
2. Anropa `generate-report` för minst två rapporttyper (en med data, en utan) via `supabase--curl_edge_functions` och bekräfta att `payload.template.slides` är en array med rätt slide-typer.
3. Anropa `render-pptx` med `artifact_id` från (2) och bekräfta 200 + binär .pptx.

---

## Tekniska detaljer

**Filer som ändras:**
- `supabase/functions/generate-report/_templates.ts` — full omskrivning till slides-arkitektur
- `supabase/functions/generate-report/index.ts` — 9 nya case-block + AI-insikter + payload-berikning
- `supabase/functions/render-pptx/index.ts` — slide-dispatcher + 6 nya renderare + brand kit + data-source-footer

**Filer som INTE ändras:**
- Inga migrationer
- Ingen frontend (`ReportTemplateView.tsx` läser fortfarande summary/charts/tables — frontend-preview blir tom-ish för nya rapporter, men det är acceptabelt enligt specen som fokuserar på .pptx)
- Inga andra edge functions

**Bakåtkompatibilitet:**
- `render-pptx` faller tillbaka till befintlig linjär rendering om `tpl.slides` saknas → gamla artifacts fungerar oförändrat.
- `_templates.ts` exporterar fortfarande `buildTemplate` med samma signatur.

**Secrets:**
- Använder `LOVABLE_API_KEY` (redan satt). Ingen ny secret behövs.

**Datakällor per rapport (sammanfattning):**
- `executive` → `gsc_snapshots` (current+previous), `ga4_snapshots`, `action_items` (open + sorterade på `expected_impact_sek`), `kpi_targets`
- `seo_performance` → `gsc_snapshots`, `analyses.keyword_universe_json`, `audit_findings` (kategori SEO)
- `ga4_traffic` → `ga4_snapshots`, `channel_attribution_snapshots`
- `keyword_universe`, `content_gap`, `segments` → senaste `analyses.keyword_universe_json` / `result_json`
- `competitor` → `backlink_gaps`, gap-keywords från `analyses`
- `cannibalization` → härled från `gsc_snapshots.rows` (samma keyword på flera URLs)
- `paid_vs_organic` → `gsc_snapshots` + `ads_audits`
