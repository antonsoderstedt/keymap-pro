# Sprint 1 — Google Ads Launchpad + Semrush

Bygger ovanpå befintligt Keyword Universe. Inget rivs ner. Allt tillgängligt från `/project/:id/results/universe`.

---

## Vad du får när det är klart

1. **Google Ads Editor-export (ZIP)** — laddas upp direkt i Editor, klart att publicera.
2. **AI-genererade Responsive Search Ads** — 15 headlines + 4 descriptions per ad group + extensions.
3. **Strategi-sektion** — budget, bud-strategi, prioritetsordning, landningssidekrav.
4. **Semrush-berikning** — riktig KD%, SERP features, konkurrent-gap ovanpå DataForSEO.
5. **Spara-knapp för DataForSEO/Semrush-credentials** (redan finns för DataForSEO, lägger till Semrush).

---

## 1. Semrush-integration

### Secret
- Be om `SEMRUSH_API_KEY` via secret-prompt (du har Standard API: 50k units/månad).

### Ny edge function: `enrich-semrush`
- Input: `{ keywords: string[], domain?: string }`
- För varje kw: `phrase_kd` endpoint → KD%, `phrase_these` → SERP features, `phrase_organic` (top 10) → vilka domäner rankar
- Cache i ny tabell `semrush_metrics` (samma mönster som `keyword_metrics`, 30 dagars TTL)
- Konkurrent-gap: kör `domain_organic` på domain + varje konkurrent (från `projects.competitors`) → markera kw som "konkurrent rankar, du gör inte" = hög prioritet

### Integration i `keyword-universe`
- Efter DataForSEO-enrichment: anropa `enrich-semrush` på top N kw (begränsat efter scale: focused=200, broad=600, max=1500 för att spara units)
- Lägg till på `UniverseKeyword`: `kd?: number`, `serpFeatures?: string[]`, `competitorGap?: boolean`, `topRankingDomains?: string[]`

### UI
- Ny kolumn "KD%" i universe-tabellen (färgkodad: grön <30, gul 30–60, röd >60)
- Filter: "Konkurrent-gap" toggle + "KD max" slider
- Badge på SERP features (Featured snippet, People also ask, Shopping etc.)

---

## 2. AI Ads Builder

### Ny edge function: `generate-ads`
- Input: `{ project_id, ad_group_keywords: { ad_group: string, keywords: string[] }[] }`
- För varje ad group → AI-anrop (gemini-2.5-pro) som genererar:
  - 15 headlines (max 30 tecken vardera, validerat)
  - 4 descriptions (max 90 tecken)
  - 4 sitelinks med beskrivning
  - 6 callouts (max 25 tecken)
  - Final URL (från `recommendedLandingPage`)
  - Path1, Path2 (max 15 tecken)
- Validering server-side: trimma/regenerera om över längd
- Output sparas i ny tabell `ad_drafts (analysis_id, ad_group, payload jsonb)`

### Ad group-gruppering
- Återanvänd `recommendedAdGroup` från Universe; om saknas, gruppera per `cluster` + `intent=commercial|transactional`
- Bara kw med `channel ∈ {Google Ads}` och `searchVolume > 0`

---

## 3. Google Ads Editor-export

### Frontend-funktion (i `KeywordUniverse.tsx`): `exportGoogleAdsEditor()`
Genererar ZIP (jszip) med 5 CSV:er enligt Google Ads Editor bulk-format:

| Fil | Kolumner |
|-----|----------|
| `campaigns.csv` | Campaign, Budget, Bid Strategy Type, Campaign Type, Networks, Languages, Locations, Status |
| `ad_groups.csv` | Campaign, Ad Group, Max CPC, Status |
| `keywords.csv` | Campaign, Ad Group, Keyword, Match Type, Max CPC, Final URL, Status |
| `negative_keywords.csv` | Campaign, Ad Group, Keyword, Match Type, Status |
| `responsive_search_ads.csv` | Campaign, Ad Group, Headline 1..15, Description 1..4, Final URL, Path 1, Path 2, Status |

### Kampanjstruktur (auto-genererad)
- 1 kampanj per `intent` (Commercial-SE, Transactional-SE) eller per huvuddimension
- Match types: Exakt + Phrase per kw (Broad utelämnas default, togglebar)
- Negativa: alla kw med `isNegative=true` läggs på kampanjnivå
- Geo-targeting: Sverige + universe.cities som locations
- Default budget: 100 SEK/dag/kampanj (editerbar i UI innan export)
- Default bid: max(CPC * 1.2, 5 SEK)

### UI
- Knapp "Exportera till Google Ads Editor" på Universe-sidan
- Modal: välj kampanjer, justera budget/bidstrategi, toggle Broad match, preview antal kw/ads
- Klick → triggar `generate-ads` om inte redan gjort, packar ZIP, ner-laddning

---

## 4. Strategi-sektion

### Ny edge function: `generate-strategy`
- Input: hela universe + ads + KD-data
- AI returnerar strukturerad JSON:
  ```
  {
    budgetSplit: [{campaign, monthlyBudget, rationale}],
    biddingStrategy: [{campaign, type: "tROAS"|"Maximize Conversions"|"Manual CPC", target, rationale}],
    launchOrder: [{phase, campaigns, week}],
    landingPageRequirements: [{adGroup, mustHaves: string[], cta, h1}],
    seoVsAdsAdvice: string,
    quickWins: [{keyword, action, why}],
    risks: string[]
  }
  ```

### UI: ny tab "Strategi" i KeywordUniverse-sidan
- Cards för varje sektion, exporterbar som PDF (jspdf, optional)

---

## 5. Database-migrations

```sql
create table semrush_metrics (
  keyword text, location_code int default 2752,
  kd numeric, serp_features jsonb, top_domains jsonb,
  updated_at timestamptz default now(),
  primary key (keyword, location_code)
);
alter table semrush_metrics enable row level security;
create policy "auth read" on semrush_metrics for select to authenticated using (true);

create table ad_drafts (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null,
  ad_group text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);
alter table ad_drafts enable row level security;
create policy "users via analysis project" on ad_drafts for all
  using (exists (select 1 from analyses a join projects p on p.id=a.project_id
                 where a.id=ad_drafts.analysis_id and p.user_id=auth.uid()));

create table strategy_drafts (
  analysis_id uuid primary key,
  payload jsonb not null,
  created_at timestamptz default now()
);
alter table strategy_drafts enable row level security;
create policy "users via analysis" on strategy_drafts for all
  using (exists (select 1 from analyses a join projects p on p.id=a.project_id
                 where a.id=strategy_drafts.analysis_id and p.user_id=auth.uid()));
```

---

## 6. Filer som ändras/skapas

**Nya:**
- `supabase/functions/enrich-semrush/index.ts`
- `supabase/functions/generate-ads/index.ts`
- `supabase/functions/generate-strategy/index.ts`
- `src/components/universe/AdsExportModal.tsx`
- `src/components/universe/StrategyTab.tsx`
- `src/lib/googleAdsExport.ts` (CSV+ZIP-builder)
- Migration för 3 tabeller

**Ändras:**
- `supabase/functions/keyword-universe/index.ts` (Semrush-pass)
- `src/pages/KeywordUniverse.tsx` (KD-kolumn, filter, knappar för Ads-export & Strategi-tab)
- `src/lib/types.ts` (UniverseKeyword + Ads/Strategy-typer)
- `package.json` (lägga till `jszip`)

---

## 7. Ordning

1. Semrush-secret prompt + `semrush_metrics` migration + `enrich-semrush`-funktion
2. Integrera Semrush i `keyword-universe` + UI-kolumn KD%
3. `ad_drafts` migration + `generate-ads`-funktion
4. `googleAdsExport.ts` + `AdsExportModal` + ZIP-export
5. `strategy_drafts` migration + `generate-strategy` + `StrategyTab`
6. End-to-end test med en befintlig analys

---

## Vad jag behöver av dig

**Endast en sak:** `SEMRUSH_API_KEY` (jag pingar dig via secret-prompten i steg 1). Hittas i Semrush → Profile → Subscription info → API → Get API key.

Säg **"kör"** så börjar jag på steg 1.
