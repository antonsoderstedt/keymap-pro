# Keyword Intelligence v2.1 — kalibrering + aktiva actions

Gör scoring kundspecifik (egen GSC-CTR + project_goals) och aktiverar opportunity-knapparna. Inga DB-migrationer.

## Filer som ändras

1. `supabase/functions/keyword-universe/index.ts`
2. `supabase/functions/_shared/keyword-intel/scoring.ts`
3. `src/pages/workspace/WorkspaceKeywordUniverse.tsx`
4. `src/components/results/KeywordTable.tsx`

## Steg

### 1. Parallell datahämtning + GSC-kalibrering (`keyword-universe/index.ts`)
- Ersätt enskild `customers`-query med `Promise.all` för `customers`, `project_goals`, senaste `gsc_snapshots`.
- Bygg `gscByKeyword`-Map för fuzzy-lookup.
- Bygg `calibratedCtr[1..10]` från GSC (impressions ≥100, vikt mot AWR-default när <50 rows). `gscCalibrated=true` om ≥50 kalibrerbara rader.

### 2. Utöka `ScoringContext` (`scoring.ts`)
- Nya fält: `calibratedCtr?: number[]`, `gscByKeyword?: Map<...>`.
- `expectedCtr(serpFeatures, ctx)` använder genomsnitt av pos 1–3 från projektets kurva, annars 0.18.
- `forecastRevenue(..., ctx)` skickas vidare till `expectedCtr` och använder `goals.aov_sek` / `goals.margin`.
- `scoreKeyword` anropar `forecastRevenue` med `ctx`.

### 3. `is_already_ranking` + `ranking_position` (`keyword-universe/index.ts` PASS 4)
- Fuzzy GSC-match (exakt → substring ±15 tecken) i mapping-loopen.
- Lägg till `is_already_ranking`, `ranking_position`, `ranking_ctr` på varje keyword-objekt.

### 4. `scoring_metadata` + `engineVersion` i result (`keyword-universe/index.ts`)
- Lägg till `engineVersion: "v2.1"` och `scoring_metadata` (gsc_calibrated, gsc_keyword_count, goals_available, workspace_type, ctr_source, aov_sek, conversion_type).

### 5. Aktiva opportunity-actions (`WorkspaceKeywordUniverse.tsx`)
- `handleOpportunityAction(op)`:
  - `negative_candidate` / `scalable_winner` / `account_gap` → `navigate` till `/clients/:id/google-ads` med rätt tab + toast.
  - `adgroup_candidate` → CSV-export (Google Ads Editor-format, top 3 exact + resten phrase), download.
  - SEO-typer (`quick_dominance`, `cluster_consolidation`, `striking_distance_cluster`, `service_gap`, `high_score_underserved`) → `insert` i `action_items`.
- Ersätt disabled-knapp med aktiv knapp som visar `op.action_label` (Download-ikon för CSV).

### 6. Kalibreringsstatus i UI (`WorkspaceKeywordUniverse.tsx`)
- Liten rad under stat-korten: CTR-källa (kalibrerad/AWR), goals-källa, `engineVersion`.

### 7. Ranking-badge i `KeywordTable.tsx`
- `#position`-badge i keyword-cellen, färg efter pos (≤3 grön, ≤10 amber, annars muted), tooltip "Rankar #N i Google (GSC)".

## Verifiering

- Edge-funktionen deployas (`keyword-universe`); ny körning ska returnera `engineVersion: "v2.1"` och `scoring_metadata.gsc_calibrated`.
- I UI: knappar på opportunities är klickbara, CSV laddas ner för adgroup-kandidater, ranking-badges syns på sökord som redan rankar.
- Inga DB-ändringar krävs (använder befintliga `project_goals`, `gsc_snapshots`, `action_items`).
