## Del 1 — Rebranding till Slay Station

Verktyget döps om från **KEYMAP** till **Slay Station** överallt där användaren ser namnet. Tagline-förslag: *"Din growth station för SEO, CRO & lansering."*

**Filer som uppdateras (endast user-facing text):**
- `index.html` — `<title>`, meta description, OG-taggar
- `src/components/workspace/WorkspaceSidebar.tsx` — om/när logon visas där
- `src/pages/Auth.tsx` + `src/pages/Clients.tsx` — header/branding
- `package.json` — `name: "slay-station"`
- `supabase/functions/weekly-briefing-send/index.ts` — mailmall avsändarnamn + text
- `mem://index.md` — Core: byt KEYMAP → Slay Station

Inga DB-tabeller, funktionsnamn eller URL:er ändras.

---

## Del 2 — Pre-launch Blueprint (ny modul)

Inspirerad direkt av Clinic P-paketet du laddade upp: **Marknadsanalys + Marknadsstrategi + Sajtspecifikation**. Användarens use case: kund saknar GSC/GA4-data och ska bygga ny sajt — vi behöver härleda allt från affärsidé + konkurrenter + geo.

### Användarflöde

```text
/clients/:id/prelaunch   (ny sidopanelpost: "Pre-launch Blueprint")

STEG 1 — BRIEF (formulär)
  • Affärsidé / verksamhetsbeskrivning (textarea)
  • Målgrupp + USP (textarea)
  • Geografiska marknader / städer / upptagningsområde (chips)
  • Konkurrentdomäner (2–5 st)
  • (valfritt) Planerad sidstruktur / wireframe-noter
  • Sparas som draft direkt → kan återupptas

STEG 2 — RESEARCH (auto, progressbar)
  • Firecrawl scrape + map per konkurrent → innehåll, sidstruktur, USP
  • SCB / SNI-uppslag av geo (frivillig — kan hoppas över)
  • DataForSEO seed-keywords ur AI-extraktion av brief + konkurrentinnehåll
  • DataForSEO ranked_keywords per konkurrent → keyword gap
  • Volym / CPC / KD via befintlig keyword_metrics-cache
  • Lovable AI (gemini-2.5-pro) för syntes och klustring

STEG 3 — RESULTAT (5 flikar, allt exporterbart)

  Tab A — Marknadsanalys
    • Sammanfattning + bedömningsmatris (faktor → bedömning)
    • Demografi & upptagningsområde (primärt/sekundärt)
    • Konkurrentkartläggning (direkta + indirekta + regionala)
    • Strategiska implikationer
    → Modellerat efter Clinic_P_Marknadsanalys.docx

  Tab B — Marknadsstrategi
    • Positionering + tonalitet (förslag, redigerbart)
    • Kanalstrategi (SEO/Paid/Social) med prioritet & timing
    • 12-mån mål-tabell (kännedom, bokningar, retention)
    • Innehållsplan 3–6 mån (pillar/support/blog)
    → Modellerat efter Clinic_P_Marknadsstrategi.docx (lättviktsversion)

  Tab C — Sökordsuniversum
    • Återanvänder befintlig universe-vy med taggen "pre-launch"
    • Klustrad lista med volym, KD, intent, konkurrent som rankar
    • Keyword gap-tabell

  Tab D — Sajtspecifikation
    • Sidstruktur (hierarki: top-level → sub)
    • Per sida: slug, H1, meta-title, primärt + sekundära sökord,
      intent, prio, est. månadstrafik vid pos 1–3 / 4–10
    • Personas (2–3 st, AI-genererade ur brief)
    → Modellerat efter Clinic_P_Sajtspecifikation.docx (kärnan, inte allt)

  Tab E — Trafik- & intäktsprognos
    • 3 scenarier (pessimistisk / realistisk / optimistisk)
    • Månad-för-månad: rankings → klick → konverteringar → SEK
    • Använder project_revenue_settings (CR, AOV, valuta)
    • Recharts area chart + tabell

EXPORT
  • PDF (per tab eller hela paketet)
  • CSV för sajtkartan (slug, H1, sökord, prio)
  • Action items: "Skapa pre-launch sajtkarta som backlog" → pushar
    raderna till action_items
```

### Nya filer

```text
src/pages/workspace/PrelaunchBlueprint.tsx        wizard + resultatvy
src/components/prelaunch/BriefForm.tsx
src/components/prelaunch/MarketAnalysisView.tsx
src/components/prelaunch/StrategyView.tsx
src/components/prelaunch/SitemapPlanner.tsx       editerbar tabell
src/components/prelaunch/ContentRoadmap.tsx
src/components/prelaunch/TrafficForecast.tsx
src/lib/prelaunch.ts                              forecast-formler,
                                                   slug, prio-scoring,
                                                   CTR-kurva per pos
supabase/functions/prelaunch-research/index.ts    orkestrerar allt
```

### Nya tabeller (migration)

```sql
prelaunch_briefs (
  id uuid pk, project_id uuid, status text,
  business_idea text, target_audience text, usp text,
  competitors text[], locations text[], existing_sitemap jsonb,
  created_at, updated_at
)

prelaunch_blueprints (
  id uuid pk, brief_id uuid, project_id uuid,
  market_analysis jsonb,    -- strukturerad: summary, demographics,
                            --   competitors[], implications
  strategy jsonb,           -- positioning, channels[], goals[], content_plan[]
  keyword_universe jsonb,   -- samma form som analyses.keyword_universe_json
  sitemap jsonb,            -- [{slug, h1, meta_title, primary_kw,
                            --   secondary_kws[], intent, priority,
                            --   est_clicks_top3, est_clicks_top10}]
  personas jsonb,
  forecast jsonb,           -- {pessimistic|realistic|optimistic}: monthly[]
  created_at
)
```
RLS: ägarbaserat via `projects.user_id` (samma mönster som existerande tabeller).

### Edge function `prelaunch-research`

1. Validera brief (zod), markera status `researching`.
2. Parallellt per konkurrent: `firecrawlScrape({formats:['markdown','links','summary']})` + `firecrawlMap` (för sidstruktur).
3. AI-anrop 1 (gemini-2.5-pro, structured output): extrahera 25–40 seed-sökord + intent ur brief + konkurrentinnehåll, samt utkast till personas.
4. DataForSEO `keywords_for_keywords` → volym/CPC, geo-filtrerat per location code.
5. DataForSEO `competitors_domain` + `ranked_keywords` per konkurrent → gap.
6. Återanvänd befintlig `enrich-keywords`-cachelogik.
7. AI-anrop 2 (structured): klustring, sajtkarta, innehållsplan, marknadsanalys-text, strategi-text. Schema definierat som JSON tool-call så outputen är direkt lagringsbar.
8. JS: räkna forecast med standard CTR-kurva per position och `project_revenue_settings`.
9. Persist till `prelaunch_blueprints`, status `complete`.

### Integrationer som återanvänds
- `src/lib/revenue.ts` + `useProjectCurrency` för SEK/EUR
- Befintlig universe-renderare för Tab C
- `WorkspaceSidebar`: ny länk "Pre-launch Blueprint" under **Analys**
- Tomt-läge på `PerformanceTracker`: visar CTA "Ingen data än → kör Pre-launch Blueprint"
- Action items: "Skicka sajtkarta till backlog" skapar rader i `action_items`

### Routing
```text
/clients/:id/prelaunch                    (lista + ny brief)
/clients/:id/prelaunch/:blueprintId       (resultatvy)
```

### Vad jag medvetet hoppar över (kan adderas senare)
- Detaljerad influencer/UGC-strategi från Clinic P-strategin (mer relevant per bransch — håller strategitabben lättviktig)
- Juridiska guardrails-sektion
- QR-incheckning, medlemsmodell etc. (branschspecifikt — inte generaliserbart)

---

## Plan – så bygger jag

1. Migration: `prelaunch_briefs` + `prelaunch_blueprints` med RLS.
2. Edge function `prelaunch-research` med Firecrawl + DataForSEO + Lovable AI.
3. UI: wizard + 5 resultatflikar + export.
4. Routing + sidopanel + tomtläges-CTA på Performance.
5. Rebrand till Slay Station + uppdatera mem.

Säg "kör" så drar jag igång.