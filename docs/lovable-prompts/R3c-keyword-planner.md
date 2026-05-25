# R3c — Google Ads Keyword Planner integration (Lovable prompt)

## Mål
Lägg till möjligheten att hämta keyword-idéer direkt från Google Ads **KeywordPlanIdeaService** (GenerateKeywordIdeas) för ett projekt, persistera dem som en separat datakälla, och göra dem tillgängliga som "verified demand" i Keyword Universe (idea-status = `verified`, dataSource = `real`).

Detta ersätter **inget** befintligt — det utökar.

## Boundary (MUST NOT)
- **Inga ändringar** i scoring/`opportunity-score-build`, `commercial-intent-build`, eller `decision-context-build`.
- **Inga ändringar** i LLM-prompts.
- **Inga ändringar** i UI utanför Keyword Universe-sidan + Datakällor-status.
- **Ingen** ny scope för OAuth — återanvänd befintlig `google-oauth` + `google_ads_connections`.
- **Inga ändringar** i `KeywordUniverse.tsx` tab-strip (R3b lämnas orörd) — Keyword Planner-data renderas i ett separat avsnitt OVANFÖR universe-flikens filter-kort, eller bakom egen knapp.

## Scope

### 1. Migration
Skapa migration `supabase/migrations/<timestamp>_keyword_planner_ideas.sql`:

```sql
create table public.keyword_planner_ideas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null,
  seed_keyword text,                          -- null when seeded from URL only
  seed_url text,                              -- null when seeded from keywords only
  keyword text not null,
  language_code text not null,                -- e.g. '1015' (Swedish) or 'sv'
  location_code text not null,                -- '2752' for Sweden
  avg_monthly_searches integer,
  competition text,                           -- 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  competition_index integer,                  -- 0..100
  low_top_of_page_bid_micros bigint,
  high_top_of_page_bid_micros bigint,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_kpi_project_keyword on public.keyword_planner_ideas (project_id, keyword);
create index idx_kpi_project_run on public.keyword_planner_ideas (project_id, run_id, fetched_at desc);
create unique index uq_kpi_project_run_keyword on public.keyword_planner_ideas (project_id, run_id, keyword);

alter table public.keyword_planner_ideas enable row level security;

create policy "members can read kpi" on public.keyword_planner_ideas
  for select using (public.is_project_member(project_id));
create policy "service role writes kpi" on public.keyword_planner_ideas
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
```

Lägg INTE till i `supabase_realtime` publication. Lägg INTE till någon `model_version`-kolumn — Keyword Planner är rå-data, inte härledd.

### 2. Edge function `supabase/functions/ads-keyword-planner/index.ts`

**Pattern: följ `supabase/functions/ads-search-terms/index.ts` och `supabase/functions/ads-fetch-auction-insights/index.ts` exakt** vad gäller:
- CORS-headers
- Anon klient + `is_project_member` RPC auth
- Service-role klient för DB-skrivningar
- Hämta refresh_token från `google_ads_connections` för projektets ägare/operatör
- Token refresh via befintlig hjälpare
- Felhantering: 401 reauth → returnera `{ ok: false, reason: "reauth_required" }`

**POST body:**
```ts
{
  project_id: string,
  customer_id: string,                       // 'XXX-XXX-XXXX' eller plain
  login_customer_id?: string,                // MCC override
  seed_keywords?: string[],                  // max 20
  seed_url?: string,                         // optional
  language_code?: string,                    // default '1015' (sv)
  location_codes?: string[],                 // default ['2752'] (Sverige)
  include_adult?: boolean,                   // default false
  max_ideas?: number                         // hard cap 1000, default 200
}
```

**Validering:** måste finnas minst en av `seed_keywords` eller `seed_url`. Returnera 400 annars.

**Anrop:** Google Ads API `KeywordPlanIdeaService.GenerateKeywordIdeas` v17 (eller senaste stabila), endpoint `https://googleads.googleapis.com/v17/customers/{customer_id}:generateKeywordIdeas`.

**Headers:**
- `Authorization: Bearer <access_token>`
- `developer-token: <DEVELOPER_TOKEN>` (från Deno.env)
- `login-customer-id: <login_customer_id>` (om angivet)
- `Content-Type: application/json`

**Request body:**
```json
{
  "language": "languageConstants/1015",
  "geoTargetConstants": ["geoTargetConstants/2752"],
  "includeAdultKeywords": false,
  "keywordPlanNetwork": "GOOGLE_SEARCH",
  "keywordSeed": { "keywords": ["seed1", "seed2"] }
}
```
(eller `urlSeed`/`keywordAndUrlSeed` baserat på input).

**Response-mappning:**
- Generera `run_id = crypto.randomUUID()`
- För varje `result` i response: extrahera `text`, `keywordIdeaMetrics.avgMonthlySearches`, `competition`, `competitionIndex`, `lowTopOfPageBidMicros`, `highTopOfPageBidMicros`.
- Slice till `max_ideas`.
- Bulk-insert via service-role klient (chunks om 500).
- Returnera `{ ok: true, run_id, count, ideas: [...] }`.

**Limits:** max 1000 idéer per anrop. Max 1 anrop per projekt per 60 sekunder (in-memory rate limit eller skip — best-effort).

**Inga LLM-anrop. Ingen scoring. Bara rå datainhämtning.**

### 3. Hook `src/hooks/useKeywordPlannerIdeas.ts`

```ts
export function useKeywordPlannerIdeas(projectId: string | null) {
  // Returnerar { runs: KeywordPlannerRun[], loading, error, fetch: (params) => Promise<...>, refresh }
  // runs grupperar idéer per run_id, sorterar på fetched_at desc.
  // fetch() anropar edge-funktionen och refreshar listan.
}
```

Typdefinitioner i `src/lib/types.ts`:
```ts
export interface KeywordPlannerIdea {
  id: string;
  project_id: string;
  run_id: string;
  seed_keyword: string | null;
  seed_url: string | null;
  keyword: string;
  language_code: string;
  location_code: string;
  avg_monthly_searches: number | null;
  competition: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  competition_index: number | null;
  low_top_of_page_bid_micros: number | null;
  high_top_of_page_bid_micros: number | null;
  fetched_at: string;
  created_at: string;
}

export interface KeywordPlannerRun {
  run_id: string;
  fetched_at: string;
  seed_keywords: string[];
  seed_url: string | null;
  count: number;
  ideas: KeywordPlannerIdea[];
}
```

### 4. UI: `src/components/universe/KeywordPlannerPanel.tsx`

Ny komponent — **monteras i KeywordUniverse universe-tabben, OVANFÖR det befintliga filter-kortet, i en `Collapsible` som är default-stängd**.

Header: "Google Ads Keyword Planner" + ShieldCheck-ikon + chip med antal idéer i senaste run + "Hämta nya idéer"-knapp.

Innehåll vid expand:
- Form: seed-keywords (multi-input chips, max 20), seed-url (optional), location (select från befintlig location-lista — default Sverige 2752), language (default svenska 1015), max_ideas (slider 50–1000, default 200).
- Submit-knapp "Hämta från Google" (disabled om varken seeds eller url).
- Loading state: spinner + "Hämtar från Google Ads..."
- Vid 401/reauth: visa "Koppla om Google Ads" CTA (återanvänd `reconnectGoogle` från `@/lib/googleOAuth`).
- Lista över senaste runs (max 5 visas, resten i "Visa fler"-länk). Varje run: header med seeds + tid + count, expanderbart tabell med kolumner: Keyword, Avg månadssök, Konkurrens (LOW/MED/HIGH med färgad chip), CPC-spann (low–high i SEK, konvertera från micros via /1_000_000), "Lägg till i universe"-knapp per rad.

"Lägg till i universe"-funktionalitet: **lämna som no-op + TODO-kommentar i denna sprint**. Faktisk merge-till-universe är R3c-followup. Knappen ska finnas men bara visa `toast({title: "Kommer i nästa sprint"})`.

### 5. Datakällor-status (utöka befintlig)

I `useDataSourcesStatus` (`src/hooks/useDataSourcesStatus.ts`): lägg till `keyword_planner` som möjlig `source` i `SourceInfo`. Status härleds från senaste `keyword_planner_ideas`-row för projektet:
- `not_connected` om `google_ads_connections` saknas för projektet.
- `ok` om någon row finns yngre än 30 dagar.
- `stale` om senaste row är 30–90 dagar.
- `error`/`stale` om äldre än 90 dagar.

**Detta är ENDA befintliga filen som ändras utanför nya filer.** Resterande UI som konsumerar `SourceInfo` (`DataSourceAlerts`, `SourceFallback`) plockar automatiskt upp den nya källan.

### 6. Tester

Skapa `src/test/keyword-planner.test.ts`:
- Mock `useKeywordPlannerIdeas` returning seeded runs.
- Test att `KeywordPlannerPanel` renderar collapsed by default, expanderar vid klick, validerar input (disable submit utan seeds), formaterar micros korrekt till SEK, visar competition-chips med rätt färg.
- Mocka edge-svar i hook-test (om realistic) eller skippa edge-integration-test (det är operatör-verifiering).

Inget skarpt anrop mot Google Ads i tester.

### 7. Verifiering (vad du ska köra innan PR:en mergar)

```sh
npx vitest run
npx tsc --noEmit
```

Mål: alla befintliga tester (186/186) + nya keyword-planner-tester passerar. Ingen tsc-error.

## Filer som ändras / skapas

**Nya:**
- `supabase/migrations/<timestamp>_keyword_planner_ideas.sql`
- `supabase/functions/ads-keyword-planner/index.ts`
- `src/hooks/useKeywordPlannerIdeas.ts`
- `src/components/universe/KeywordPlannerPanel.tsx`
- `src/test/keyword-planner.test.ts`

**Modifierade:**
- `src/lib/types.ts` — `KeywordPlannerIdea`, `KeywordPlannerRun`
- `src/pages/KeywordUniverse.tsx` — montera `<KeywordPlannerPanel projectId={id} />` ovanför filter-kortet i universe-tabben (en (1) extra rad i JSX)
- `src/hooks/useDataSourcesStatus.ts` — lägg till `keyword_planner` source

**Modifieras INTE:** Allt annat. Speciellt:
- `src/lib/ideaStatus.ts`
- `src/components/keywords/*`
- Övriga edge functions
- Scoring-pipeline

## Acceptanskriterier
1. Operatör kan från Keyword Universe expandera Keyword Planner-panelen, skriva in 1–20 seed-keywords (eller en URL), klicka "Hämta från Google", och inom rimlig tid (<15s) se 50–1000 keyword-idéer från Google Ads.
2. Idéerna persisteras i `keyword_planner_ideas` så att de finns kvar mellan sessioner. Senaste 5 runs syns i panelen.
3. Vid utgången OAuth-token visas tydlig reauth-CTA. Vid Google Ads API-fel visas felmeddelandet (last_error) i panelen.
4. `useDataSourcesStatus(projectId)` returnerar nu även `keyword_planner` i sin source-lista. Global `DataSourceAlerts` plockar upp den utan ändring.
5. Inga tsc-errors. Befintliga 186 tester passerar. Nya tester passerar.
6. Inga ändringar i scoring-output för befintliga projekt (regression-säkert: vi rör ingenting i `opportunity_scores` eller `commercial_intent_labels`).

## Hemligheter
Använd befintliga env-vars:
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (för token refresh)

Om någon saknas → returnera tydligt felmeddelande, krascha inte.

## Out of scope (egna framtida sprintar)
- Merge av Keyword Planner-idéer in i `keyword_universe_json` (R3c-followup).
- Bulk-add till universe via en knapp per rad (no-op nu).
- Trendsökning / longitudinell utveckling (separat Trend-feature).
- Keyword Plan-budgetsimulering (separat feature).
