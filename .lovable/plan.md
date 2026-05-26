# Performance Command Center — fullständig plan

## Mål
Gå från "teknisk dashboard" till **Performance Command Center**: marketern ska på 10 sekunder förstå (1) hur det går, (2) vad som ändrats, (3) varför, (4) vad som ska göras härnäst. All UI/frontend — ingen ny scoring/LLM-logik, ingen ny edge-function.

## Vad ChatGPT-reviewen redan fångar (jag tar in allt)
Header utan period/jämförelse · KPI utan delta/tolkning · graf utan kontext/växling · Ads för långt ner · Diagnos otydlig · saknad action-kö · datakällebanner för dominant · ingen exec-summary · ingen top pages/queries · ingen ROAS/Spend.

## Ytterligare problem jag hittade i koden
1. `PerformanceKpis.tsx` och `PerformanceTrendChart.tsx` finns **redan färdigbyggda** med delta-logik, annotation-markörer och metric-toggling — men är **oanvända**. Performance.tsx renderar en enkel `MetricStrip` + naken `AreaChart` istället. Vinst: noll nytt arbete för stora delar.
2. `usePerformanceData` hämtar bara *en* aktuell snapshot — ingen `previous`-period laddas, så KPI-deltas saknar källdata. Måste lösas innan delta-korten kan visa siffror.
3. `summarizePeriod` anropas med `[]` som rankings → `topTenShare` blir alltid 0 %. Bug, inte UX. Måste hämta query-rader för perioden.
4. "Senaste ändringar"-listan i botten är dubbel info — `PerformanceTrendChart` ritar redan annotation-punkter ◆ i grafen. Bättre att slå ihop dem visuellt.
5. `SourceFallback`-noden renderas som full banner *inuti varje sektion*. Tre stacka banners när allt är trasigt. Bör konsolideras till en **DataHealthStrip** i headern + inline-fallback bara när en sektion är blockerad.
6. Ads-sektionen visar bara `DiagnosisPanel` + kollapsade subsektioner — inga råa KPI:er (spend, conv, ROAS). `ads_results`/`campaign_metrics`-data finns i `AdsResultsTab` men ligger gömd bakom en collapse.
7. Range-pills "7/28/90" har ingen jämförelse-etikett och inget "Senast uppdaterad" på sidnivå.
8. `AccountHealthCard` (R5) finns redan — kan återanvändas för Ads-KPI-rad utan att bygga nytt.
9. Action-kön finns i `ActionsPipeline` + `action_items` — bara hämta top 3-5 `priority=high, status≠done` och rendera som cards.
10. Den befintliga texten "En läsbar översikt över SEO, Ads och GA4." är generisk — ska bytas mot statusrad.
11. `caps.hasAds` döljer hela Ads-sektionen — bör visa en CTA istället ("Anslut Google Ads") när inte ansluten.
12. Ingen filter för kanal/marknad/brand i nuläget — out of scope för v1 men noterat.

## Föreslagen ny struktur (en sida, scroll-läsbar)

```text
┌───────────────────────────────────────────────────────────────┐
│ HEADER                                                        │
│  Performance · Ståldirect                       [28d ▾] [vs] │
│  Period 1 maj–28 maj · jmf 3 apr–30 apr · uppdat. 14h        │
│  ● SEO ok  ● Ads ok  ⚠ Keyword Planner inaktuell             │
├───────────────────────────────────────────────────────────────┤
│ EXECUTIVE SUMMARY (2–4 meningar, autogen från KPI-deltas)    │
├───────────────────────────────────────────────────────────────┤
│ PRIORITERADE ÅTGÄRDER (max 4 cards + "Visa alla →")          │
├───────────────────────────────────────────────────────────────┤
│ KPI-RAD — SEO  (5 kort med delta)                            │
│ KPI-RAD — ADS  (5 kort: spend, conv, CPA, ROAS, IS)          │
├───────────────────────────────────────────────────────────────┤
│ TREND-GRAF (PerformanceTrendChart — toggle klick/imp/CTR/pos)│
│ + annotation-punkter ◆ för senaste ändringar                 │
├───────────────────────────────────────────────────────────────┤
│ SEO-INSIKTER  (2 kolumner)                                   │
│  Top sidor · Top sökord · Nära topp 10 · Hög imp/låg CTR    │
├───────────────────────────────────────────────────────────────┤
│ ADS-INSIKTER                                                  │
│  DiagnosisPanel · AccountHealthCard · subsektioner           │
├───────────────────────────────────────────────────────────────┤
│ GA4 KPI:er + kanalbreakdown                                  │
└───────────────────────────────────────────────────────────────┘
```

## Genomförande i 6 atomära steg

### Steg 1 — Data foundation (utan UI)
- Utöka `usePerformanceData`:
  - Hämta *två* GSC-snapshots för aktuell + jämförelseperiod (eller dela en stor snapshot via `lastNDays` med offset).
  - Bygg `rankings` via `buildRankings` så `summarizePeriod` kan räkna `topTenShare` korrekt.
  - Hämta `ads_results`/senaste `account_intelligence`-rad för spend/conv/ROAS.
  - Hämta top 5 `action_items` (`priority=high`, `status≠done`) för åtgärdskön.
- Inga DB-ändringar.

### Steg 2 — Header + DataHealthStrip
- Ny `PerformanceHeader`: titel + projektnamn, period-väljare flyttas in, jämförelse-etikett, "senast uppdaterad".
- Ny `DataHealthStrip`: tre prickar (SEO/Ads/GA4/Planner) i headern. Klick → popover med detaljer. Befintlig `SourceFallback`-banner används bara när en *hel sektion* är blockerad (state=`block`).

### Steg 3 — Executive summary + KPI-rad
- Ny `ExecutiveSummary`-komponent: deterministisk text byggd från KPI-deltas ("Organiska klick −18 %, CTR stabil, Ads-spend +12 %"). Ingen LLM.
- Återanvänd befintlig `PerformanceKpis` (har delta-logik). Lägg till `AdsKpis`-variant med spend/conv/CPA/ROAS/IS, samma visuella språk.

### Steg 4 — PrioritizedActions
- Ny `PrioritizedActions`-komponent som listar top 4 cards: titel, "varför viktigt" (från `decision_context`), impact-badge, datakälla-badge, "Visa detaljer →" som öppnar `ContextSheet`/Actions Pipeline.

### Steg 5 — Trend + SEO-insikter
- Byt naken `AreaChart` mot befintlig `PerformanceTrendChart` (metric toggle + annotations + insight-rad).
- Ny `SeoOpportunities` (2x2 grid): Top sidor, Top sökord, Nära topp 10 (pos 11–20), Hög imp/låg CTR. Allt härlett från redan hämtad `rankings`-data via `winnersAndLosers` + filter.

### Steg 6 — Ads-omstrukturering + copy-pass
- Lyft Ads över GA4. Visa `AccountHealthCard` + KPI-rad **före** `DiagnosisPanel`.
- `DiagnosisPanel` får tydligare meta-rad: "Analyserar: Ads, GA4, GSC · Senast körd: X · Resultat: Y kritiska / Z möjligheter".
- Ta bort dubbletten "Senaste ändringar"-listan i botten (data finns nu i trendgrafens annotation-rad).
- Copy-pass: "Snittpos." → "Genomsnittlig Google-position", "Topp 10" → "Andel sökord på sida 1", "Kör diagnos" → "Analysera kontot", etc.

## Filer som rörs

**Nya:**
- `src/components/workspace/performance/PerformanceHeader.tsx`
- `src/components/workspace/performance/DataHealthStrip.tsx`
- `src/components/workspace/performance/ExecutiveSummary.tsx`
- `src/components/workspace/performance/AdsKpis.tsx`
- `src/components/workspace/performance/PrioritizedActions.tsx`
- `src/components/workspace/performance/SeoOpportunities.tsx`

**Edit:**
- `src/pages/workspace/Performance.tsx` (orchestration + ny layout)
- `usePerformanceData`-hook flyttas till egen fil med utökad shape

**Återanvänds som de är:**
- `PerformanceKpis`, `PerformanceTrendChart`, `AccountHealthCard`, `DiagnosisPanel`, `SourceFallback`, `ContextSheet`

## Vad som **inte** ändras
- Inga DB-migrationer.
- Inga edge functions.
- Ingen scoring-/LLM-logik.
- Övriga workspace-sidor (Today, ActionsPipeline, AccountIntelligence, KeywordsHub).
- Routing i `workspaceRoutes.ts`.

## Acceptanskriterier
- KPI-kort visar delta vs föregående period.
- Headern visar period, jämförelseperiod, senast uppdaterad, data health-status.
- Ads-KPI:er (spend, conv, CPA, ROAS, IS) syns ovanför fold tillsammans med SEO-KPI:er.
- Prioriterade åtgärder ligger ovanför trendgrafen.
- "Senaste ändringar"-block i botten är borttaget (info finns i trendgrafens annotation-rad).
- Tre stacka SourceFallback-banners ersätts av en kompakt status i headern.
- Sidan får plats för KPI + summary + actions ovanför fold på 1019×927.

Säg till så bygger jag i build mode.