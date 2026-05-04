
# Startfas — Slay Station v2 (Fas 0 + faktakoll/sömlöshet)

Bygger grunden för hela SPEC v2.0 och löser samtidigt akuta UX-problemen i pre-launch (Norrtälje-felet, kan inte ta action, måste fylla i data två gånger, 0-volym-brus).

Levereras i ett svep. Helheten (Fas 1–8) ligger kvar som norra stjärna och tas i kommande sprintar.

## Vad vi bygger

### 1. Datamodell + helpers

**Migration** (en sammanhängande):
```sql
ALTER TABLE projects ADD COLUMN workspace_type text NOT NULL DEFAULT 'b2b_manufacturer'
  CHECK (workspace_type IN ('b2b_manufacturer','d2c_brand','local_service','b2b_service','ecommerce'));

CREATE TABLE project_goals (
  id uuid PK, project_id uuid UNIQUE → projects,
  conversion_type text DEFAULT 'purchase' CHECK (...),
  conversion_label text,
  conversion_value numeric DEFAULT 1000,
  conversion_rate_pct numeric DEFAULT 2,
  primary_goal text DEFAULT 'acquisition',
  strategy_split jsonb DEFAULT '{"acquisition":70,"retention":20,"awareness":10}',
  brand_terms text[] DEFAULT '{}',
  ...
);  -- + RLS

CREATE TABLE project_baselines (
  id uuid PK, project_id uuid → projects,
  snapshot_date date, metrics jsonb, source text DEFAULT 'auto', ...
);  -- + RLS

ALTER TABLE keyword_metrics ADD COLUMN strategy_quadrant text DEFAULT 'acquire_nonbrand';
ALTER TABLE prelaunch_briefs ADD COLUMN fact_check jsonb;
ALTER TABLE prelaunch_blueprints
  ADD COLUMN selected_keywords jsonb DEFAULT '[]',
  ADD COLUMN ads_plan jsonb;
```

**Nya helpers (frontend):**
- `src/lib/workspaceConfig.ts` — 5 kundtyper × dimensioner, setup-fält, default-konvertering, klusterprompt-hint
- `src/lib/goalsEngine.ts` — `monthlyKeywordValue()`, `classifyKeyword()` (brand vs non-brand, retention vs acquisition), `CONVERSION_LABELS`
- `src/hooks/useProjectCapabilities.ts` — `{ hasGA4, hasGSC, hasAds, hasAnalysis, hasPrelaunch, hasGoals, hasBaseline, ... }` (parallella queries)
- `src/hooks/useProjectGoals.ts` — läs/skriv goals med fallback till `project_revenue_settings`

### 2. Faktakoll (löser Norrtälje direkt)

**Ny edge function `prelaunch-factcheck`:**
```
input: { brief_id }
flow:
  1. Hämta brief från DB
  2. AI (Gemini 2.5 Pro) extraherar 3–7 verifierbara påståenden ur business_idea/usp/competitors
     med metadata: { claim, type: 'uniqueness'|'competitor'|'feature'|'market_position', search_queries, locations }
  3. För varje påstående parallellt:
     a. DataForSEO SERP — Google-sökning på relevanta queries
     b. DataForSEO Maps Pack — om type='uniqueness' eller workspace_type='local_service'
     c. Firecrawl — skrapa topp 2-3 konkurrentsidor från SERP-träffarna
  4. AI syntetiserar verdict per påstående:
     { verdict: 'verified'|'contradicted'|'partially_true'|'unverifiable',
       evidence: '...', sources: [{url, snippet, source_type}], recommendation: '...' }
  5. UPDATE prelaunch_briefs SET fact_check = {...} WHERE id = $1
```

**Uppdaterad `prelaunch-research`:**
- Om `fact_check` finns: prepend till syntes-prompten:
  ```
  VERIFIED FACTS — use these instead of client claims when they conflict:
  • "enda kliniken i Norrtälje med injections" → CONTRADICTED.
    Bevis: 3 konkurrenter hittade. Basera analysen på 4 kliniker totalt.
  ```
- Resultat: marknadsanalys, sökord, strategi byggs på verifierad verklighet, inte klientens påståenden.

**UI i `PrelaunchBlueprint.tsx`:**
- Nytt **Faktakort** överst i resultat-tabben (rött/grönt per påstående, källor expanderbara, AI-rekommendation)
- "Kör faktakoll på nytt"-knapp
- Faktakollen körs automatiskt som första steg när brief skickas

### 3. Sömlös pipeline — sökordsval + recompute

**Ny edge function `prelaunch-recompute`:**
- Input: `{ blueprint_id, selected_keywords: string[] }`
- Regenererar bara: sajtkarta, innehållsplan, ads-struktur, prognos från valda sökord
- Använder befintlig DataForSEO/Firecrawl-data — kör inte hela research-kedjan om
- UPDATE `prelaunch_blueprints` SET `selected_keywords`, `sitemap`, `strategy`, `forecast`

**UI uppdateringar i pre-launch resultat:**
- **Sökordsfliken**: checkboxes per sökord + "markera alla i kluster"-knapp
- **Sticky bottom-bar**: `X sökord valda · Estimerat värde Y kr/mån · [Använd valda sökord →]`
- **0-volym-toggle**: default `Volym ≥ 10`. Knapp "Visa 0-volym (X st)" + tooltip "Semantiskt relevanta — potential för framtida volym"
- **Stepper överst**: `Brief → Faktakoll → Marknad → Sökord → Strategi → Export` med klickbara steg
- Varje resultatflik: `Nästa →`-CTA längst ner som tar dig till nästa logiskt steg

### 4. Capability-baserad sidomeny

**`WorkspaceSidebar.tsx`:**
- Använd `useProjectCapabilities`
- Items utan förutsättningar: gråade + hänglås-ikon + tooltip "Koppla GA4 för att låsa upp" (klickbar → går till Inställningar)
- Ta bort badges ("ny", "preview", "premium")
- Pre-launch/Kom igång döljs när `hasAnalysis || hasPrelaunch`

**Onboarding-checklista** på Executive Dashboard (tillfällig tills hela Dashboard byggs om i Fas 1):
- 8-stegs progress med checkmark per slutförd kapabilitet
- Direkta CTA-knappar till varje saknad del
- Försvinner när allt är klart

### 5. Sökordsuniversum-fix

**`WorkspaceKeywordUniverse.tsx`:**
- Läs **både** `analyses` OCH `prelaunch_blueprints.keyword_universe`
- Om bara pre-launch finns: visa det istället för "Ingen analys körd"
- Tomt-state-knapp leder till **pre-launch / Kom igång** istället för att tvinga om-inmatning
- Action-knappar per sökord/kluster: "Skapa content brief", "Pusha till Åtgärder", "Exportera till Ads CSV"

## Tekniska detaljer

- **Edge functions**: alla nya följer befintligt mönster (CORS från `@supabase/supabase-js/cors`, service role för DB-skrivning, Zod-validering på input)
- **AI-modell**: `google/gemini-2.5-pro` via Lovable AI Gateway (`LOVABLE_API_KEY`) för faktakoll-syntes
- **DataForSEO**: använder befintliga `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`. SERP via `/v3/serp/google/organic/live/advanced`, Maps via `/v3/serp/google/maps/live/advanced`
- **Firecrawl**: använder befintlig `FIRECRAWL_API_KEY` (connector). Begränsar till topp 3 konkurrentsidor per påstående för att hålla körtiden < 25s
- **Timeout-hantering**: AbortController med 25s timeout per externt API-anrop, partial fallback om en källa failar (verdict blir 'partially_verified')
- **`project_revenue_settings`** behålls — `useProjectGoals` läser från `project_goals` med fallback

## Filer

**Nya:**
- `supabase/functions/prelaunch-factcheck/index.ts`
- `supabase/functions/prelaunch-recompute/index.ts`
- `src/lib/workspaceConfig.ts`
- `src/lib/goalsEngine.ts`
- `src/hooks/useProjectCapabilities.ts`
- `src/hooks/useProjectGoals.ts`
- `src/components/workspace/FactCheckCard.tsx`
- `src/components/workspace/PrelaunchStepper.tsx`
- `src/components/workspace/OnboardingChecklist.tsx`
- 1 migration

**Redigerade:**
- `src/pages/workspace/PrelaunchBlueprint.tsx` — faktakort, stepper, sökordsval, recompute-knapp, 0-volym-toggle
- `src/components/workspace/WorkspaceSidebar.tsx` — capability-låsning, badges bort
- `src/pages/workspace/WorkspaceKeywordUniverse.tsx` — pre-launch fallback, action-knappar
- `src/pages/workspace/Executive.tsx` — onboarding-checklista
- `supabase/functions/prelaunch-research/index.ts` — använder fact_check som hård kontext

## Vad detta INTE inkluderar (kommer i kommande faser)

- Navigation 18→7 (Fas 1)
- Goals-setup-UI och kundtypsväljare (Fas 3) — datamodellen finns, UI byggs senare
- Prelaunch-ads-plan med push till Google Ads (Fas 5)
- Cron + baseline-snapshot (Fas 6)
- Roller / project_members (Fas 7)
- React Query-migration, typ-säkerhet, mobil-sidebar (Fas 8)

Estimerad tid: 3–4 dagars implementation. Klart för godkännande.
