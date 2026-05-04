# Results-flödet — Komplett funktionsinventering

> Underlag för migrering av all funktionalitet från wizard-världen
> (`/project/:id/results` + `/project/:id/results/universe`) till
> workspace-världen (`/clients/:id/keywords`). Allt här ska finnas
> kvar i workspace-versionen — ingen funktion får tappas.

---

## 1. Övergripande flöde

### Routes idag (wizard-världen)

| Route | Komponent | Syfte |
|------|-----------|------|
| `/project/:id/results` | `src/pages/Results.tsx` | Storytelling-vy: Översikt → Segment → Sökord → Kanaler → Action. Hela "deck:et" man visar för kund. |
| `/project/:id/results/universe` | `src/pages/KeywordUniverse.tsx` | Power-användarvy: full filtrerad sökordstabell + tabbar för Briefs / Teknisk SEO / Strategi / Ads-export. |

De två sidorna delar **samma datakälla** (senaste `analyses`-rad för projektet) men exponerar olika nivåer av detalj. Results.tsx är "läs och förstå", KeywordUniverse.tsx är "filtrera och agera".

### Datakälla — `analyses`-tabellen

En analys-rad innehåller två stora JSON-blobbar som driver allt i Results-flödet:

| Kolumn | Driver | Innehåll (TypeScript-typ) |
|--------|--------|----------------------------|
| `analyses.result_json` | "Storyn" — segment, sammanfattning, quick wins, ads-struktur | `AnalysisResult` |
| `analyses.keyword_universe_json` | Det filtrerbara universumet med berikning från DataForSEO + Semrush | `KeywordUniverse` |
| `analyses.scan_data_json` | Webscan-resultat (per-domän kontext) | `ScanData[]` |
| `analyses.universe_scale` | `"focused" \| "broad" \| "max"` — används vid re-generering av universe | `UniverseScale` |
| `analyses.options` | Vilka steg som kördes i wizarden | `AnalysisOptions` |

`Results.tsx` hämtar **senast färdiga** rad (där `result_json IS NOT NULL`) och pollar var 5:e sekund om en nyare `pending`-rad finns. Detta beteende måste replikeras i workspace-versionen så att man inte tappar gamla resultat när en ny analys startas.

### Vad som ligger var

```
result_json (AnalysisResult)
├── summary               → OverviewSection (sammanfattningskort)
├── totalKeywords         → header + KPI-kort
├── segments[]            → SegmentsSection
├── quickWins[]           → ActionSection (flik "Quick wins")
├── keywords[]            → (legacy KeywordCluster — inte aktivt använd i nya sektionerna)
├── expansion[]           → (legacy)
├── adsStructure[]        → (legacy — ersätts nu av Google Ads Editor-export från universe)
└── keywordResearch?[]    → (legacy — driver KeywordResearchSection-komponenten)

keyword_universe_json (KeywordUniverse)
├── scale, generatedAt, totalKeywords, totalEnriched, cities
└── keywords[]            → KeywordsSection / ChannelsSection / ActionSection /
                            KeywordTable / AdsExportModal / ContentBriefsTab /
                            ClusterActionsTab — i princip allt nedanför Segments
```

**Viktigt vid migrering:** segments + quickWins + summary kommer från `result_json`. Allt annat agerande (filter, briefs, strategi, Google Ads-export, klusteråtgärder) drivs av `keyword_universe_json`. Workspace-vyn behöver båda.

---

## 2. Per komponent

### `src/pages/Results.tsx`

- **Syfte:** Top-level storytelling-sida. Sticky header med projekt-info + global Exportera-meny. Sidebar med ankarnavigation. Renderar 5 sektioner i ordning.
- **Props:** Inga (route-komponent, läser `:id` via `useParams`).
- **Datakällor (read):**
  - `projects` (kolumn `name`)
  - `analyses` (`id, result_json, keyword_universe_json, created_at`) — först senaste med `result_json` ej null, sedan ev. nyare pending utan resultat.
- **Datakällor (write):** Inga.
- **Edge functions:**
  - `generate-presentation` — invokeas av export-menyn med `{ analysis_id, format: "pptx" | "pdf" }`. Returnerar base64-kodad fil som laddas ner client-side.
- **Användarinteraktioner / actions:**
  - `<- Tillbaka` → `/project/:id`
  - Theme-toggle
  - **Exportera-meny:**
    - PowerPoint (.pptx) — via `generate-presentation`
    - PDF — via `generate-presentation`
    - "Hela universumet (CSV)" — client-side CSV-bygge via `exportUniverseCsv()` (UTF-8 BOM + alla kolumner från universe). Filnamn: `keymap-universe.csv`.
  - Polling: var 5e sek om analys är pending.
  - "Generera Keyword Universe"-knapp visas om `keyword_universe_json` saknas → navigerar till `/project/:id/results/universe`.
- **Statusbanner** för pending eller failed analys (`__error`-fält i result_json).
- **Beroenden:**
  - `ResultsSidebar`, `OverviewSection`, `SegmentsSection`, `KeywordsSection`, `ChannelsSection`, `ActionSection`
  - `DIMENSION_LABELS`, `INTENT_LABELS` från `KeywordTable`
  - `ThemeToggle`

### `src/pages/KeywordUniverse.tsx`

- **Syfte:** Power-användarens "tabellvy" över hela universumet med fullt filterstöd och 10 tabbar (Universe / Prioriterade / SEO / Google Ads / Content / Lokal / Negativa / Briefs / Teknisk SEO / Strategi).
- **Props:** Inga (route).
- **Datakällor (read):**
  - `projects.name`
  - `analyses` senaste rad (`id, keyword_universe_json, universe_scale`)
- **Datakällor (write):**
  - `analyses.keyword_universe_json` + `analyses.universe_scale` — uppdateras när användaren trycker "Kör Keyword Universe nu" (om universumet saknas).
- **Edge functions:**
  - `keyword-universe` — `{ project_id, scale }` → returnerar `{ universe }` som sparas tillbaka.
- **Filtertillstånd (lokalt state):** `search`, `intent`, `funnel`, `dimension`, `channel`, `priority`, `hideZeroVolume`, `onlyReal`, `onlyGap`, `maxKd`.
- **Curated views** (memoiserade):
  - `priorityKeywords` — `priority === "high" && !isNegative`
  - `seoOpps` — `channel ∈ {SEO, Landing Page} && volume > 0`
  - `adsOpps` — `channel === "Google Ads" && intent === "transactional"`
  - `contentOpps` — `channel === "Content"`
  - `localOpps` — `channel === "Lokal SEO"`
  - `negatives` — `isNegative === true`
- **Användarinteraktioner:**
  - **CSV-export** av aktuellt filtrerade rader (`exportFiltered`) — fler kolumner än Results.tsx-versionen (inkluderar `serpFeatures`, `topRankingDomains`).
  - **Google Ads Editor-knapp** → öppnar `AdsExportModal`.
  - 10 flik-vyer (se ovan).
  - Tom-state med "Kör Keyword Universe nu"-knapp → invoke `keyword-universe`.
- **Beroenden:** `AdsExportModal`, `StrategyTab`, `ContentBriefsTab`, `TechSeoTab`, lokal `KeywordTable`-komponent (definierad inom samma fil längst ner — separat från `src/components/results/KeywordTable.tsx`), `StatCard`, `FilterSelect`.

> ⚠️ **Migrationsnot:** denna fil har en *intern* `KeywordTable` som är något rikare (visar SERP features) än `src/components/results/KeywordTable.tsx`. Vid migrering, samordna till en enda komponent.

### `src/components/results/ResultsSidebar.tsx`

- **Syfte:** Vänster sidebar med 5 ankarlänkar (Översikt, Segment, Sökord, Kanaler, Action). Highlightar aktiv sektion via `IntersectionObserver`.
- **Props:** Inga.
- **Datakällor:** Inga.
- **Edge functions:** Inga.
- **Actions:** Click → `scrollIntoView` på sektions-id.
- **Beroenden:** `cn`-utility, `lucide-react`-ikoner.

### `src/components/results/sections/OverviewSection.tsx`

- **Syfte:** Sektion 1. Visar 4 KPI-kort, summary-text, och 3 charts (intent-fördelning som donut, segment-score som horisontell bar, volym-per-kanal som bar).
- **Props:** `{ result: AnalysisResult; universe: KeywordUniverse | null }`
- **Datakällor:** Endast props (ingen Supabase).
- **Edge functions:** Inga.
- **Actions:** Inga interaktioner — ren visualisering.
- **Beroenden:** `KpiCard`, `ChartCard`, `SectionHeader`, `recharts`, `INTENT_LABELS`.

### `src/components/results/sections/SegmentsSection.tsx`

- **Syfte:** Sektion 2. Renderar `result.segments` (sorterat efter `opportunityScore`) som korträkneverk. Varje kort: namn, SNI, antal företag, score-ring, "hur de söker", topp-sökord, insight.
- **Props:** `{ segments: AnalysisResult["segments"] }`
- **Datakällor:** Endast props.
- **Edge functions:** Inga.
- **Actions:** Inga.
- **Beroenden:** `SectionHeader`, intern `ScoreRing`-komponent.

### `src/components/results/sections/KeywordsSection.tsx`

- **Syfte:** Sektion 3. Easy wins-scatter (KD vs volym, bubblestorlek = CPC, top 200 punkter). Filterpanel (10 filter). Filtrerad `KeywordTable`. CSV-export-knapp.
- **Props:** `{ universe: KeywordUniverse; onExportCsv: (filtered: UniverseKeyword[]) => void }`
- **Datakällor:** Endast props.
- **Edge functions:** Inga.
- **Actions:** "CSV (N)" → kallar `onExportCsv` med aktuellt filtrerade rader (Results.tsx levererar `exportUniverseCsv`).
- **Beroenden:** `SectionHeader`, `ChartCard`, `KeywordTable`, `FilterSelect`, `recharts`.

### `src/components/results/sections/ChannelsSection.tsx`

- **Syfte:** Sektion 4. Tabbar: SEO / Google Ads / Content / Lokal / Negativa. Varje flik visar en filtrerad `KeywordTable`. Action-knapp i header öppnar `AdsExportModal`.
- **Props:** `{ universe: KeywordUniverse; projectId: string; analysisId: string | null }`
- **Datakällor:** Props (modalen läser/skriver Supabase).
- **Edge functions (transitivt via modal):** `generate-ads`.
- **Actions:** "Google Ads Editor" knapp → öppnar `AdsExportModal`.
- **Beroenden:** `SectionHeader`, `KeywordTable`, `AdsExportModal`.

### `src/components/results/sections/ActionSection.tsx`

- **Syfte:** Sektion 5. Tabbar: Quick wins / Klusteråtgärder / Strategi / Content-briefs / Teknisk SEO.
- **Props:** `{ result: AnalysisResult; universe: KeywordUniverse; projectId: string; analysisId: string | null }`
- **Datakällor:** Props; underliggande tabs läser/skriver egna tabeller.
- **Edge functions (transitivt):** `generate-strategy`, `generate-brief`, `semrush-audit`, `semrush-backlinks`.
- **Actions:** Quick wins är ren visning. Övriga flikar (`StrategyTab`, `ContentBriefsTab`, `TechSeoTab`, `ClusterActionsTab`) hanterar sina actions själva.
- **Beroenden:** `SectionHeader`, `StrategyTab`, `ContentBriefsTab`, `TechSeoTab`, `ClusterActionsTab`.

> Notera: `ClusterActionsTab` importeras här men `Results.tsx` exponerar inte fliken explicit — den ligger redo i tab-listan ("Klusteråtgärder"). Se filens TabsList.

### `src/components/results/KeywordTable.tsx`

- **Syfte:** Generell tabell över `UniverseKeyword[]`. Visar 10 kolumner: Sökord (+badges för uppskattad/negativ/gap), Volym, CPC, KD%, Dimension, Intent, Funnel, Prioritet, Kanal, Kluster.
- **Props:** `{ items: UniverseKeyword[]; limit?: number }` (default 500).
- **Exporterar även:** `DIMENSION_LABELS`, `INTENT_LABELS` (Record<string,string> — används i flera komponenter).
- **Datakällor:** Inga.
- **Actions:** Inga (visar uppmaning att exportera CSV om listan trunkeras).

### `src/components/results/KeywordResearchSection.tsx`

- **Syfte:** Legacy-vy för wizardens "Keyword Research"-steg (driven av `result.keywordResearch: ResearchCluster[]`, *inte* av `KeywordUniverse`). Grupperar sökord per kluster i kollapsbar tabell, multi-select via checkboxes, sorterbar, filtrerbar.
- **Props:** `{ clusters: ResearchCluster[]; selectedKeywords: Set<string>; setSelectedKeywords: (s: Set<string>) => void }`
- **Datakällor:** Endast props.
- **Edge functions:** Inga.
- **Actions:** Toggle-select per sökord eller per kluster, expand/collapse, rensa filter, rensa val.
- **Beroenden:** `Collapsible`, `Checkbox`, `Table`, `Select`, `Switch`.

> **Migrationsnot:** Den här komponenten används inte av `Results.tsx` eller `KeywordUniverse.tsx` direkt — den är en kvarleva från äldre wizard-resultat. Behöver utvärderas om den ska migreras eller dödas. Datatypen `ResearchCluster` lever kvar i `result.keywordResearch`.

### `src/components/results/KpiCard.tsx`

- **Syfte:** Återanvändbart KPI-kort.
- **Props:** `{ label: string; value: string | number; hint?: string; icon?: ReactNode; accent?: "primary" | "accent" | "warning" | "destructive" }`
- **Datakällor / actions:** Inga.

### `src/components/results/ChartCard.tsx`

- **Syfte:** Wrapper-kort för diagram med titel/beskrivning/optional action.
- **Props:** `{ title: string; description?: string; children: ReactNode; action?: ReactNode }`
- **Datakällor / actions:** Inga.

### `src/components/universe/ContentBriefsTab.tsx`

- **Syfte:** Generera och visa content-briefs per kluster. Per-kluster cache i DB, exporter till .md/.docx/.pdf/.json + clipboard.
- **Props:** `{ analysisId: string; universe: KeywordUniverse }`
- **Datakällor (read):** `content_briefs` (`cluster`, `payload`) — listar vilka kluster som har sparade briefs och hämtar payload när ett kluster väljs.
- **Datakällor (write):** Skrivs implicit av edge function `generate-brief` (vi läser bara från frontend).
- **Edge functions:**
  - `generate-brief` — `{ analysis_id, cluster, force }` → returnerar `{ brief: ContentBrief, cached: boolean }`.
- **Actions / exporter (knappar):**
  - "Generera brief" / "Generera om" (force=true)
  - Ladda ner `.md` → `downloadBriefMarkdown`
  - Ladda ner `.docx` → `downloadBriefDOCX`
  - Ladda ner `.pdf` → `downloadBriefPDF`
  - Ladda ner `.json` → `downloadBriefJSON`
  - "Kopiera Markdown" → `navigator.clipboard.writeText(briefToMarkdown(...))`
- **Beroenden:** `src/lib/contentBriefExport.ts`.

### `src/components/universe/TechSeoTab.tsx`

- **Syfte:** Two sub-tabs: "Site Audit" (on-page-issues + Semrush domain overview + topprankade sidor) och "Backlink Gap" (egen authority + konkurrent-overview + gap-domäner som länkar till konkurrenter men inte er).
- **Props:** `{ analysisId: string }`
- **Datakällor (read):**
  - `site_audits` (`payload`) — cached audit-payload för analysen.
  - `backlink_gaps` (`payload`) — cached backlink-data.
- **Edge functions:**
  - `semrush-audit` — `{ analysis_id, force }` → returnerar `{ audit, cached }` (cache 7 dgr enligt UI).
  - `semrush-backlinks` — `{ analysis_id, force }` → returnerar `{ data, cached }` (cache 14 dgr).
- **Actions:** "Kör audit" / "Uppdatera" / refresh-knapp; samma för backlinks.

### `src/components/universe/StrategyTab.tsx`

- **Syfte:** Visa AI-genererad strategi: budget split, bidstrategi, launch-ordning, landningssidekrav, quick wins, SEO-vs-Ads-råd, KPIer, risker.
- **Props:** `{ projectId: string; analysisId: string }`
- **Datakällor (read):** `strategy_drafts` (`payload`) — `payload as StrategyDraft`.
- **Edge functions:**
  - `generate-strategy` — `{ project_id, analysis_id }` → returnerar `{ strategy: StrategyDraft }` (skriver också till `strategy_drafts`).
- **Actions:** "Generera strategi" / "Generera om".
- **Beroenden:** `StrategyDraft`-typen från `src/lib/types.ts`.

### `src/components/universe/ClusterActionsTab.tsx`

- **Syfte:** Genererar konkreta åtgärdsförslag per kluster med förväntat årligt SEK-värde (heuristik client-side från `generateClusterActions`). Filter på prioritet. Varje åtgärd kan läggas till i Action Tracker.
- **Props:** `{ projectId: string; universe: KeywordUniverse }`
- **Datakällor (read):**
  - `project_revenue_settings` (alla kolumner) — driver värdeberäkning.
- **Datakällor (write via hook):**
  - `useActionItems(projectId).create(...)` skriver till `action_items`-tabellen (källa: `cluster_action`).
- **Edge functions:** Inga (heuristiken körs client-side).
- **Actions:** "Lägg till i Action Tracker"-knapp per åtgärd; prioritetsfilter.
- **Beroenden:** `src/lib/clusterActions.ts`, `src/lib/revenue.ts`, `useProjectCurrency`, `useActionItems`.

### `src/components/universe/AdsExportModal.tsx`

- **Syfte:** Konfigurera och bygga ZIP-export för Google Ads Editor (campaigns/ad groups/keywords/negatives + valfritt RSAs/sitelinks/callouts).
- **Props:** `{ open, onClose, universe: KeywordUniverse, projectId: string, analysisId: string }`
- **Datakällor (read):** `ad_drafts` (filtrerat på `analysis_id`) — undviker att regenerera om drafts redan finns.
- **Datakällor (write):** Edge functionen skriver till `ad_drafts`.
- **Edge functions:**
  - `generate-ads` — `{ project_id, analysis_id, ad_groups }` → returnerar `{ drafts: AdDraft[] }`. Bara om `cfg.includeAds` och inga befintliga drafts hittades.
- **Actions:** Konfigurera dagsbudget, bidstrategi, gruppering (cluster/intent), språk, broad-match, AI-annonser; "Exportera ZIP" → `buildGoogleAdsEditorZip` → fil `google-ads-editor-{ts}.zip`.
- **Beroenden:** `src/lib/googleAdsExport.ts`.

---

## 3. Datatypes (TypeScript-interfaces)

Alla typer lever i `src/lib/types.ts`.

### `UniverseScale`
`"focused" | "broad" | "max"` — styr hur stort universe `keyword-universe`-edge-functionen genererar.

### `UniverseKeyword`
Centralenheten i `keyword_universe_json.keywords[]`.
| Fält | Typ | Beskrivning |
|------|-----|--------------|
| `keyword` | `string` | Sökordet (lowercased oftast). |
| `cluster` | `string` | Klusternamn (används för gruppering, ad groups, briefs). |
| `dimension` | `UniverseDimension` | `produkt \| tjanst \| bransch \| material \| problem \| losning \| location \| kundsegment \| use_case \| kommersiell \| fraga \| konkurrent`. |
| `intent` | `UniverseIntent` | `informational \| commercial \| transactional \| navigational`. |
| `funnelStage` | `UniverseFunnel` | `awareness \| consideration \| conversion`. |
| `priority` | `UniversePriority` | `high \| medium \| low`. |
| `channel` | `UniverseChannel` | `SEO \| Google Ads \| Lokal SEO \| Content \| Landing Page`. |
| `recommendedLandingPage` | `string?` | Förslag på final URL. |
| `recommendedAdGroup` | `string?` | Förslag på Ads ad group-namn (default: cluster). |
| `contentIdea` | `string?` | Innehållsförslag. |
| `isNegative` | `boolean?` | Om sökordet ska användas som negativ i Ads. |
| `searchVolume` | `number?` | Från DataForSEO (SE / sv). |
| `cpc` | `number?` | SEK, från DataForSEO. |
| `competition` | `number?` | 0–1 från DataForSEO. |
| `dataSource` | `"real" \| "estimated"` | "real" = berikat via DataForSEO. |
| `kd` | `number?` | 0–100, från Semrush. |
| `serpFeatures` | `string[]?` | Från Semrush SERP-data. |
| `topRankingDomains` | `string[]?` | Domäner i topp-SERP. |
| `competitorGap` | `boolean?` | True om en konkurrent rankar men projektets domän inte gör det. |

### `KeywordUniverse`
| Fält | Typ |
|------|-----|
| `scale` | `UniverseScale` |
| `generatedAt` | `string` (ISO) |
| `totalKeywords` | `number` |
| `totalEnriched` | `number` |
| `cities` | `string[]` |
| `keywords` | `UniverseKeyword[]` |

### `AnalysisResult`
| Fält | Typ | Driver |
|------|-----|--------|
| `summary` | `string` | OverviewSection |
| `totalKeywords` | `number` | Header / KPI |
| `segments` | `Segment[]` | SegmentsSection |
| `keywords` | `KeywordCluster[]` | (legacy) |
| `expansion` | `ExpansionSegment[]` | (legacy) |
| `adsStructure` | `AdsCampaign[]` | (legacy) |
| `quickWins` | `QuickWin[]` | ActionSection / StrategyTab |
| `keywordResearch?` | `ResearchCluster[]` | KeywordResearchSection (legacy) |

### `Segment`
`{ name, sniCode, size, isNew, opportunityScore (0-10), howTheySearch[], languagePatterns[], useCases[], primaryKeywords: PrimaryKeyword[], insight }`.

### `PrimaryKeyword`
`{ keyword, channel, volumeEstimate, difficulty, cpc, intent }` — alla strings.

### `QuickWin`
`{ keyword, reason, channel, volumeEstimate, intent, action }` — alla strings.

### `AdDraft` (Google Ads)
| Fält | Typ |
|------|-----|
| `id?` | `string` |
| `analysis_id?` | `string` |
| `ad_group` | `string` |
| `payload.headlines` | `string[]` (upp till 15) |
| `payload.descriptions` | `string[]` (upp till 4) |
| `payload.path1`, `path2` | `string` |
| `payload.final_url` | `string` |
| `payload.sitelinks` | `{ text, description1, description2, final_url }[]` |
| `payload.callouts` | `string[]` |

### `StrategyDraft`
| Fält | Typ |
|------|-----|
| `budgetSplit` | `{ campaign, monthlyBudgetSek, rationale }[]` |
| `biddingStrategy` | `{ campaign, type, target, rationale }[]` |
| `launchOrder` | `{ phase, week, campaigns: string[], focus }[]` |
| `landingPageRequirements` | `{ adGroup, h1, mustHaves: string[], cta }[]` |
| `seoVsAdsAdvice` | `string` |
| `quickWins` | `{ keyword, action, why }[]` |
| `risks` | `string[]` |
| `kpis` | `{ metric, target, timeframe }[]` |

### `ContentBrief` (lever i `src/lib/contentBriefExport.ts`)
`{ title, metaDescription, h1, targetWordCount, primaryKeyword, secondaryKeywords[], lsiTerms[], searchIntent, outline: { h2, summary, h3s? }[], faq: { q, a }[], internalLinks: { anchor, targetCluster, why }[], externalReferences?[], cta, schemaMarkup?[] }`.

### `ClusterAction` (lever i `src/lib/clusterActions.ts`)
| Fält | Typ |
|------|-----|
| `id` | `string` (`{cluster}-{type}`) |
| `cluster` | `string` |
| `title` | `string` |
| `type` | `"landing_page" \| "content_hub" \| "bid_strategy" \| "negative_keywords" \| "tech_seo" \| "competitor_gap" \| "local_seo" \| "ad_copy" \| "internal_linking"` |
| `channel` | `string` |
| `priority` | `"kritisk" \| "hög" \| "medel" \| "låg"` |
| `effort` | `"låg" \| "medel" \| "hög"` |
| `expected_value` | `number` (årligt) |
| `uplift_value` | `number` (om topp-3) |
| `rationale` | `string` |
| `steps` | `string[]` |
| `top_keywords` | `string[]` |
| `metrics` | `{ keyword_count, total_volume, avg_position, avg_kd, avg_cpc, competitor_gap_count }` |

### `ExportConfig` (Google Ads-export)
`{ dailyBudgetSek, bidStrategy: "Manual CPC" | "Maximize Clicks" | "Maximize Conversions" | "Target CPA", targetCpaSek?, includeBroadMatch, groupBy: "intent" | "cluster", includeAds, locations: string[], language: "Swedish" | "English" }`.

### `ResearchCluster` / `ResearchKeyword` (legacy)
Användes av `KeywordResearchSection` när `result.keywordResearch` är populerad.

---

## 4. Edge functions som anropas

| Function | Anropas från | Input | Syfte |
|----------|-------------|-------|------|
| `generate-presentation` | `Results.tsx` | `{ analysis_id, format: "pptx" \| "pdf" }` | Bygger client-deliverable presentation från analysens data. Returnerar `{ file: base64 }`. |
| `keyword-universe` | `KeywordUniverse.tsx` (tom-state) | `{ project_id, scale }` | Genererar/regenererar `KeywordUniverse`. Returnerar `{ universe }`. Skrivs sedan tillbaka till `analyses.keyword_universe_json`. |
| `generate-brief` | `ContentBriefsTab` | `{ analysis_id, cluster, force? }` | Genererar `ContentBrief` per kluster. Cachar i `content_briefs`. Returnerar `{ brief, cached }`. |
| `semrush-audit` | `TechSeoTab` | `{ analysis_id, force? }` | Kör on-page-audit + Semrush domain overview. Cache 7 dgr i `site_audits`. Returnerar `{ audit, cached }`. |
| `semrush-backlinks` | `TechSeoTab` | `{ analysis_id, force? }` | Backlink-gap-analys mot konkurrenter. Cache 14 dgr i `backlink_gaps`. Returnerar `{ data, cached }`. |
| `generate-strategy` | `StrategyTab` | `{ project_id, analysis_id }` | Genererar `StrategyDraft`. Cachar i `strategy_drafts`. Returnerar `{ strategy }`. |
| `generate-ads` | `AdsExportModal` | `{ project_id, analysis_id, ad_groups: { ad_group, keywords, final_url, intent, cluster }[] }` | Genererar RSAs (headlines/descriptions/sitelinks/callouts) per ad group. Skriver till `ad_drafts`. Returnerar `{ drafts }`. |

---

## 5. Supabase-tabeller som används

| Tabell | Operation | Var | Anteckningar |
|--------|-----------|-----|--------------|
| `projects` | read | `Results.tsx`, `KeywordUniverse.tsx` | Bara `name` för header. |
| `analyses` | read | `Results.tsx`, `KeywordUniverse.tsx` | Hämtar senaste raden. Kolumner: `id, result_json, keyword_universe_json, created_at, universe_scale`. |
| `analyses` | write | `KeywordUniverse.tsx` | Update `keyword_universe_json` + `universe_scale` när universe genereras manuellt från tom-state. |
| `content_briefs` | read | `ContentBriefsTab` | Kolumner: `cluster`, `payload`. Filter på `analysis_id`. |
| `content_briefs` | write | (indirekt via `generate-brief`) | Skrivs av edge function. |
| `site_audits` | read | `TechSeoTab` | Kolumn `payload`. Filter på `analysis_id`. |
| `site_audits` | write | (indirekt via `semrush-audit`) | Skrivs av edge function. |
| `backlink_gaps` | read | `TechSeoTab` | Kolumn `payload`. Filter på `analysis_id`. |
| `backlink_gaps` | write | (indirekt via `semrush-backlinks`) | |
| `strategy_drafts` | read | `StrategyTab` | Kolumn `payload`. Filter på `analysis_id`. |
| `strategy_drafts` | write | (indirekt via `generate-strategy`) | |
| `ad_drafts` | read | `AdsExportModal` | Alla kolumner. Filter på `analysis_id`. |
| `ad_drafts` | write | (indirekt via `generate-ads`) | |
| `project_revenue_settings` | read | `ClusterActionsTab` | Driver värdeberäkning. Filter på `project_id`. |
| `action_items` | write | `ClusterActionsTab` (via `useActionItems`) | `source_type: "cluster_action"`, full payload som källa. |

---

## 6. Exportfunktioner

| Export | Format | Trigger | Källa | Implementation |
|--------|--------|---------|-------|----------------|
| Presentation | `.pptx` | Results-header → "PowerPoint" | `analysis_id` (server bygger från DB) | Edge function `generate-presentation` (base64 → Blob → download). |
| Presentation | `.pdf` | Results-header → "PDF" | Samma | Samma edge function. |
| Universumet (komplett) | `.csv` | Results-header → "Hela universumet (CSV)" | `KeywordUniverse.keywords` | `Results.exportUniverseCsv` — UTF-8 BOM, 17 kolumner. |
| Filtrerade sökord (rikare) | `.csv` | KeywordUniverse-header → "CSV (N)" | `filtered: UniverseKeyword[]` | `KeywordUniverse.exportFiltered` — UTF-8 BOM, 19 kolumner (inkl. SERP features + top domäner). |
| Filtrerade sökord (Results-version) | `.csv` | KeywordsSection → "CSV (N)" knapp | `filtered: UniverseKeyword[]` | Skickas via prop till `Results.exportUniverseCsv`. |
| Google Ads Editor | `.zip` | `AdsExportModal` → "Exportera ZIP" | `KeywordUniverse` + `ExportConfig` + `AdDraft[]` | `buildGoogleAdsEditorZip` (`src/lib/googleAdsExport.ts`). Innehåller: `campaigns.csv`, `ad_groups.csv`, `keywords.csv` (Exact/Phrase/Broad), `negative_keywords.csv`, `responsive_search_ads.csv`, `sitelinks.csv`, `callouts.csv`, `README.txt`. |
| Content brief | `.md` | `ContentBriefsTab` | `ContentBrief` | `downloadBriefMarkdown` (`src/lib/contentBriefExport.ts`). |
| Content brief | `.docx` | `ContentBriefsTab` | `ContentBrief` | `downloadBriefDOCX` — `docx`-paketet. A4, Arial. |
| Content brief | `.pdf` | `ContentBriefsTab` | `ContentBrief` | `downloadBriefPDF` — `jsPDF`. A4. |
| Content brief | `.json` | `ContentBriefsTab` | `ContentBrief` | `downloadBriefJSON`. |
| Content brief (clipboard) | Markdown | `ContentBriefsTab` → "Kopiera Markdown" | `ContentBrief` | `briefToMarkdown` + `navigator.clipboard.writeText`. |

### Hjälpfiler för export

- **`src/lib/googleAdsExport.ts`** — `buildGoogleAdsEditorZip(universe, cfg, ads)` returnerar `Blob`. `buildAdGroupsForGeneration(universe, groupBy)` förbereder input till `generate-ads`. `DEFAULT_EXPORT_CONFIG` används som start-state i modalen. CPC-bud sätts till `max(cpc * 1.2, 5)` SEK och status = `Paused` på allt. Använder `JSZip`.
- **`src/lib/contentBriefExport.ts`** — definierar `ContentBrief` + 4 exporter (md / docx / pdf / json) + `briefToMarkdown` (clipboard). Använder `docx`, `jspdf`, `file-saver`.
- **`src/lib/clusterActions.ts`** — `generateClusterActions(universe, settings)` returnerar `ClusterAction[]` sorterat på `expected_value`. 7 heuristik-regler: landing_page, content_hub, bid_strategy, negative_keywords, competitor_gap, local_seo, tech_seo. `priorityFromValue` mappar SEK till prioritet. `actionTypeLabel` ger svenska labels. Använder `estimateKeywordValue` + `estimatePositionUplift` från `src/lib/revenue.ts`.

---

## 7. Migrations-checklista (för workspace-vyn)

För att inte tappa funktion vid flytten till `/clients/:id/keywords`:

1. **Datatillgång:** Workspace-vyn måste ha tillgång till samma två kolumner — `analyses.result_json` och `analyses.keyword_universe_json` — för det aktuella `client/project`-id.
2. **Två lägen i samma vy:** Kombinera storytelling-flödet (5 sektioner) och power-vyn (filterbar tabell + 4 verktygsflikar) i workspace. Förslag: använd workspace-tabbar `Översikt` / `Sökord` / `Action` / `Briefs` / `Teknisk SEO` / `Strategi` / `Google Ads-export`.
3. **Exportmenyn** (PPTX/PDF/CSV) måste finnas i header.
4. **Polling-beteende** för pending analyser måste behållas.
5. **Tom-state** "Generera Keyword Universe nu" (invoke `keyword-universe`) måste finnas — inte bara navigera bort.
6. **Konsolidera de två `KeywordTable`-implementationerna** (Results + KeywordUniverse-intern) till en.
7. **Bevara legacy-vyer** som behövs: `KeywordResearchSection` används om `result.keywordResearch` finns på äldre analyser — utvärdera om vi ska migrera eller deprekera.
8. **Edge functions och tabeller behöver inga ändringar** — endast UI-routing flyttas. Alla 7 edge functions och 8 tabellerna ovan fungerar oförändrat.
9. **Action Tracker-koppling** (`ClusterActionsTab` → `action_items`) lever redan i workspace — ingen ändring krävs.
10. **Branding/design tokens** — nya vyn ska följa workspace-stilen (lime accent #b8f542 på #0d0d0f, JetBrains Mono / Playfair Display) snarare än det renare Results-utseendet.
