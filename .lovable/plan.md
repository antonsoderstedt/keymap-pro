# Ads-First Opportunity Engine

Claude AI:s feedback har två konkreta poänger som vi följer:

1. **Ta bort "garantera minst 5 opportunities"** — det maskerar tomma universum istället för att vara ärligt.
2. **Lägg till Ads-specifika opportunity-typer** — alla nuvarande sex är SEO-tänkta. Verktyget ska driva Google Ads-action.

Visionen är ett *Google Ads keyword-monster* som matar in segment + befintligt konto + konkurrentdata och spottar ut **kampanjstruktur direkt redo att tryckas live**. Inte SEO-planering.

## Vad vi behåller från förra rundan

- Percentil-baserade trösklar (kdP25/scoreP90 etc.) — solid grund.
- `final_score` som primär gate — återanvänder v2-scoring.
- De 6 SEO-orienterade typerna finns kvar; de kompletteras, ersätts inte.

## Det som ändras

### 1. Ärligare resultat

Ta bort fallback-blocket i `opportunities.ts` som tvingar fram 5 st. Visa det som faktiskt finns. Lägg istället till en *soft floor*: om < 3 opportunities och universumet har ≥ 50 scored kw → sänk `scoreP90`-kravet till `scoreP75` för `high_score_underserved` (en gång). Det är adaptivt utan att vara fejkad fyllning.

### 2. Fyra nya Ads-opportunity-typer

Alla läses från Lovable Cloud-tabeller som redan finns och länkas till `analyses.project_id`:

| Typ | Källa | Trigger | Action-output |
|---|---|---|---|
| `account_gap` | `auction_insights_snapshots.rows` ∪ befintliga sökord i kontot | Konkurrent har > 30 % impression share på en domän/term som **inte** finns som keyword i Ads-kontot | "Lägg till annonsgrupp X med dessa 5 sökord" |
| `adgroup_candidate` | universumets kluster | Kluster med ≥ 5 kw, medel-score ≥ p50, samma intent + dimension | Färdig annonsgrupp-spec: namn, exakt/fras/bred-uppdelning, negativa |
| `negative_candidate` | `ads_diagnostics_runs.report` (search-terms-rule) | Sökord med > 100 impressions, 0 konverteringar, > 30 dagar | Account-level negativ-lista |
| `scalable_winner` | `ads_diagnostics_runs.report` (cost/conv-rule) | Sökord under target CPA + impression-share-lost-budget > 10 % | "Höj budget +X kr/dag på kampanj Y" |

För kunder utan Ads-koppling visas dessa fyra typer inte alls — de skippas tyst (samma input/output-kontrakt, bara fler typer i unionen).

### 3. UI uppdatering

`WorkspaceKeywordUniverse.tsx` opportunity-tab grupperas i två sektioner:
- **Google Ads (action)** → de 4 nya typerna med direkta CTA-knappar (`Skapa annonsgrupp`, `Lägg till negativ`, `Höj budget`).
- **Strategiska (planering)** → de 6 befintliga SEO-typerna.

Score + intäkt p50 visas på alla opportunity-keywords (enligt förra plan).

## Filer som ändras

| Fil | Ändring |
|---|---|
| `supabase/functions/_shared/keyword-intel/opportunities.ts` | Ta bort minimum-N-fallback. Lägg till 4 nya detektor-funktioner som tar `auctionInsights[]` + `adsDiagnosticsReport` som extra input. |
| `supabase/functions/keyword-universe/index.ts` | Innan `discoverOpportunities()`: hämta senaste `auction_insights_snapshots` + `ads_diagnostics_runs.report` för projektet och skicka in. |
| `src/lib/types.ts` | Utöka `Opportunity['type']`-union med `account_gap \| adgroup_candidate \| negative_candidate \| scalable_winner`. |
| `src/pages/workspace/WorkspaceKeywordUniverse.tsx` | Två-sektion-layout + per-typ CTA-knappar (knapparna kan vara stub-länkar till `/ads-hub` i steg 1). |

## Tekniska detaljer

- Inga DB-migrationer. Inga nya secrets. Inga ändringar i scoring-kontraktet.
- `discoverOpportunities()`-signaturen utökas med en optional `adsContext`-param — om null körs bara SEO-typerna (bakåtkompatibelt).
- `account_gap` matchar på normaliserad keyword-text (lowercase, trim) mellan auction-insights `rows[].domain/keyword` och universumets `keywords[].keyword`.
- `adgroup_candidate` återanvänder befintlig kluster-aggregering — bara nytt filter + structured output.
- `negative_candidate` + `scalable_winner` läser `report.findings[]` från senaste `ads_diagnostics_runs` (en query, ingen ny edge-call).

## Effekt

- Staldirect.se: får både SEO-strategiska opportunities **och** konkreta "lägg till denna annonsgrupp i konto X"-rader från auction insights.
- Inget verktyg på marknaden gör segment + auction + diagnostics → kampanjstruktur i en vy. Det är differentieringen.
- Om Ads-data saknas: tomt block + CTA "Koppla Google Ads för att låsa upp action-opportunities".

## Vad vi medvetet INTE gör i denna runda

- Ingen autoexekvering av mutations (`Höj budget` är förslag, inte action). Det kommer i nästa steg när vi vill koppla mot `ads-mutate`.
- Ingen ny segment-intelligence-modul (SNI-vinkeln Claude lyfte) — den hör hemma i ett separat planeringssteg eftersom den kräver nya prompter och en ny tabell för segment-profiles.
