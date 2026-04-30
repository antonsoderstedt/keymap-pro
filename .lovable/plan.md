# Performance & Rankings — trend, effekt och måluppföljning

## Vad du får

En ny sida `/clients/:id/performance` (även länkad från Executive Dashboard) som svarar på fyra frågor i en enda vy:

1. **"Hur går vår organiska trafik?"** — trendgraf över klick + impressions + snittposition (4-12 veckor).
2. **"Vilken effekt fick åtgärden vi gjorde?"** — markörer på grafen vid datum då åtgärder implementerades, med före/efter-jämförelse.
3. **"Vad rankar vi på idag?"** — tabell med våra viktigaste sökord: nuvarande position, förändring senaste perioden, klick, impressions, värde i SEK/år.
4. **"Hur ligger vi till mot målet?"** — mål-progressbar (t.ex. "75% av topp-sökord ska vara i topp 10" — vi är på 42%).

## Sektioner i vyn

```text
┌─────────────────────────────────────────────────────────────────────┐
│ KPI: klick / impressions / snittpos / topp10-% — alla med Δ vs förra│
├─────────────────────────────────────────────────────────────────────┤
│ Trendgraf (4/12/26 v) — klick + impressions, markörer vid actions   │
│   ◆ "Ny landningssida pris-kalkylator" (12 mar)                     │
│   ◆ "Optimerade title-tags x14" (28 mar)                            │
├─────────────────────────────────────────────────────────────────────┤
│ Måluppföljning (3-4 mål med progressbars)                           │
├─────────────────────────────────────────────────────────────────────┤
│ Ranking-tracker tabell — sortera på Δ pos, värde, kluster           │
│   sökord | pos nu | Δ | klick | imp | URL | värde/år | sparkline    │
├─────────────────────────────────────────────────────────────────────┤
│ Vinnare & förlorare — topp 5 ord som gått upp resp. ner mest        │
└─────────────────────────────────────────────────────────────────────┘
```

## Datakällor

Allt finns redan — vi behöver inte hämta nytt:

- **Trend & rankings**: `gsc_snapshots` (vi har snapshots med `date` per rad och query-rader). Snittpos räknas från queries.
- **Åtgärds-annoteringar**: `action_items` där `implemented_at` är satt. Title + datum visas som ◆ på grafen.
- **Effektmätning**: `action_outcomes` (delta_pct, baseline vs current) som redan loggas av `measure-action-impact`-funktionen.
- **Värde per sökord**: `lib/revenue.ts` (estimateKeywordValue) × projektets `revenue_settings`.
- **Mål**: `kpi_targets` (befintlig tabell med metric/target_value/timeframe).

## Tekniskt

**Nya filer:**
- `src/pages/workspace/PerformanceTracker.tsx` — huvudsida.
- `src/components/workspace/PerformanceTrendChart.tsx` — Recharts area + reference dots för actions.
- `src/components/workspace/RankingTrackerTable.tsx` — sökord-tabell med sortering, sparkline per ord.
- `src/components/workspace/GoalsProgress.tsx` — visar `kpi_targets` med live-värden + progress.
- `src/components/workspace/PerformanceKpis.tsx` — top KPI-kort.
- `src/lib/performance.ts` — pure helpers: bygg trend, jämför perioder, räkna mål-progress, parsa GSC-rader till ranking-rader.

**Edge function (ny):**
- `supabase/functions/gsc-fetch-history/index.ts` — kör en GSC query med dimensions=`["date"]` för 90/180 dgr och en med `["date","query"]` så vi får trend per dag och kan bygga sparklines per sökord. Sparas som extra snapshot-rader. Triggas via knapp "Hämta historik" + från cron en gång per vecka.

**Cron (lägg till):**
- En befintlig nattlig snapshot-uppdatering finns redan via Google-fetch i andra flöden. Vi lägger till `gsc-fetch-history` i veckokörningen som redan finns (måndag 04:30) så historiken alltid är fräsch inför briefingen.

**Routing:**
- `App.tsx`: `<Route path="performance" element={<PerformanceTracker />} />`
- `WorkspaceSidebar.tsx`: nytt item "Performance & mål" under "Översikt" med ikon `LineChart`.

**Mål-modal:**
- I `GoalsProgress` finns en "Lägg till mål"-dialog som skriver till `kpi_targets`.
- Förvalda mål-mallar:
  - "X% av topp-sökorden i topp 10"
  - "Total organisk klick/månad ≥ N"
  - "Snittposition ≤ N"
  - "Y nya sökord i topp 20"

**Effektberäkning:**
- För varje implementerad action: hämta GSC-data 28 dgr före `implemented_at` och 28 dgr efter (eller nu om <28 dgr passerat). Visa Δ klick, Δ pos och estimerat värde av Δ.
- Befintlig `measure-action-impact`-funktion utökas: tar både `before_window` och `after_window` som arg och uppdaterar `action_outcomes` med både absoluta och procentuella deltan.

## Varför inga DB-ändringar behövs

`kpi_targets`, `action_items.implemented_at`, `action_outcomes`, `gsc_snapshots` och `project_revenue_settings` finns redan med rätt struktur och RLS. Allt vi gör är ny UI + en ny edge function som skriver till befintliga tabeller.

## Vad du kan göra direkt efter det är byggt

1. Sätt 2-3 mål för projektet (t.ex. "snittpos ≤ 8 om 90 dgr").
2. Markera implementerade åtgärder i Action Tracker — de dyker upp som markörer på trendgrafen automatiskt.
3. Se vinnare/förlorare-listan veckovis och prioritera om utifrån vad som faktiskt rör sig.
