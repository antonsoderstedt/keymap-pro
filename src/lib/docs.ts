/**
 * Knowledge base content. Uppdatera denna fil när nya features släpps —
 * sidan /docs renderar automatiskt allt härifrån.
 */
export type DocSection = {
  id: string;
  title: string;
  category: "Kom igång" | "Moduler" | "Arbetsflöden" | "Integrationer" | "Release notes";
  summary: string;
  body: { heading?: string; text?: string; bullets?: string[] }[];
};

export const DOCS: DocSection[] = [
  // ===== Kom igång =====
  {
    id: "intro",
    title: "Vad är Slay Station?",
    category: "Kom igång",
    summary: "En översikt av plattformen och vem den är byggd för.",
    body: [
      {
        text:
          "Slay Station är en AI-driven growth-station för SEO och CRO. Du hanterar flera kunder i separata workspaces, kör analyser baserade på riktig data (eller från noll vid pre-launch) och följer upp resultatet automatiskt med veckobriefingar och action tracking.",
      },
      {
        heading: "Vem är det för?",
        bullets: [
          "Byråer som hanterar flera kunders SEO och betald sökning",
          "In-house team som bygger en ny sajt eller skalar en befintlig",
          "Founders som vill ha datadriven sajtarkitektur från dag noll",
          "SEO/CRO-konsulter som behöver visa mätbar impact",
        ],
      },
    ],
  },
  {
    id: "first-steps",
    title: "Första stegen",
    category: "Kom igång",
    summary: "Skapa ditt första kund-workspace och kör din första analys.",
    body: [
      {
        heading: "1. Skapa ett konto",
        text: "Klicka på Logga in och skapa ett konto med e-post. Du landar i Min byrå-vyn där alla dina kunder samlas.",
      },
      {
        heading: "2. Skapa en kund",
        text: "Klicka på Ny kund. Lägg in namn, domän, marknad och valuta. Varje kund blir ett eget workspace med all data isolerad.",
      },
      {
        heading: "3. Välj startpunkt",
        bullets: [
          "Har kunden befintlig data? → koppla GSC/GA4 i Inställningar och kör en vanlig analys",
          "Är sajten ny eller saknar data? → gå till Analys → Pre-launch Blueprint",
        ],
      },
      {
        heading: "4. Följ upp",
        text: "När analysen är klar landar åtgärder i Action Tracker. Sätt upp veckobriefing under Översikt → Veckans briefing för automatisk uppföljning.",
      },
    ],
  },
  {
    id: "navigation",
    title: "Navigering",
    category: "Kom igång",
    summary: "Hur sidomenyn är organiserad och vad varje sektion gör.",
    body: [
      {
        heading: "Min byrå (/clients)",
        text: "Lista över alla dina kunder. Klicka in på en kund för att öppna dess workspace.",
      },
      {
        heading: "Workspace-sektioner",
        bullets: [
          "Översikt — Executive dashboard, Performance, Veckans briefing",
          "Kanaler — SEO, Google Ads, GA4, Paid vs Organic",
          "Analys — Sökordsuniversum, Segment, Pre-launch Blueprint",
          "Action & uppföljning — Action Tracker, SEO Audit, Alerts",
          "Innehåll & strategi — Rapporter, Artefakter",
          "Inställningar — Brand Kit, generella inställningar",
        ],
      },
    ],
  },

  // ===== Moduler =====
  {
    id: "executive",
    category: "Moduler",
    title: "Executive Dashboard",
    summary: "Topplinjevy med trafik, ranking, intäkt och åtgärdsstatus i en blick.",
    body: [
      {
        text:
          "Executive Dashboard är förstasidan i ett kund-workspace. Den aggregerar de viktigaste KPI:erna från GSC, GA4 och Action Tracker till en exekutiv översikt — tänkt för veckomöten och för att snabbt kunna svara 'hur går det?'.",
      },
      {
        heading: "Vad du ser",
        bullets: [
          "KPI-kort: organisk trafik, topp-3 rankings, konvertering, intäkt",
          "Trendgraf 90 dagar (GSC clicks + GA4 sessions)",
          "Action-status: öppna, pågående, levererade",
          "Senaste vinster och varningar från weekly briefing",
        ],
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/ExecutiveDashboard.tsx",
          "Data: läses live från projects + analyses-tabellerna och cachat GSC/GA4-snapshot",
          "KPI-beräkningar: src/lib/performance.ts + src/lib/roi.ts",
          "Inga AI-anrop — ren aggregering, snabb laddning",
        ],
      },
    ],
  },
  {
    id: "prelaunch",
    title: "Pre-launch Blueprint",
    category: "Moduler",
    summary: "Bygg en komplett sajtstrategi innan domänen är live — utan GSC/GA4-data.",
    body: [
      {
        text:
          "Pre-launch Blueprint är till för nya sajter där det saknas historisk data. Du fyller i en brief med affärsidé, målgrupp, USP, geografiska marknader och 2-5 konkurrenter. Sedan kör AI:n research med Firecrawl (skrapar konkurrenter), DataForSEO (volymer/CPC) och Gemini (syntes).",
      },
      {
        heading: "Du får tillbaka",
        bullets: [
          "Marknadsanalys — bedömningsmatris, demografi, konkurrentkartläggning",
          "Strategi — positionering, kanaler, 12-månadersmål",
          "Sökordsuniversum — volym, intent, klustring",
          "Sajtkarta — slugs, H1, primära/sekundära sökord per sida",
          "Trafik- & intäktsprognos — pessimistisk, realistisk, optimistisk",
        ],
      },
      {
        heading: "Så använder du den",
        text: "Workspace → Analys → Pre-launch Blueprint → Ny brief. Researchen tar 2-5 min. När den är klar kan du exportera sajtkartan som CSV eller pusha rader till Action Tracker som backlog.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/PrelaunchBlueprint.tsx + src/lib/prelaunch.ts",
          "Edge function: supabase/functions/prelaunch-research (Deno)",
          "Konkurrent-scrape: Firecrawl /scrape — hämtar H1, meta, USP-signaler",
          "Sökordsdata: DataForSEO Labs API för volym, CPC, KD, SERP-features",
          "Syntes: Lovable AI Gateway (google/gemini-2.5-pro) prompt-pipeline",
          "Lagring: prelaunch_briefs + prelaunch_blueprints (RLS per användare)",
          "Prognos: linjär ramp över 12 mån, justerad mot CR/AOV i workspace-inställningar",
        ],
      },
    ],
  },
  {
    id: "keyword-universe",
    title: "Sökordsuniversum",
    category: "Moduler",
    summary: "AI-klustrade sökord med volym, intent och konkurrentdata.",
    body: [
      {
        text:
          "Sökordsuniversum samlar alla relevanta sökord för kundens nisch i klustrade grupper. Varje kluster har en pillar och support-keywords med volym, KD, intent och vilka konkurrenter som rankar.",
      },
      {
        heading: "Tre flikar",
        bullets: [
          "Strategy — high-level priorities och content gaps",
          "Cluster Actions — sökord grupperade per kluster med åtgärder",
          "Tech SEO — tekniska blockers per landningssida",
        ],
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/WorkspaceKeywordUniverse.tsx + src/components/universe/*",
          "Edge function: supabase/functions/keyword-universe (seed → expand → kluster)",
          "Anrikning: enrich-keywords + enrich-semrush (volym, KD, SERP-features)",
          "Klustring: Gemini 2.5 Pro grupperar på intent + semantisk likhet",
          "Tech SEO-flik: webscan edge function (skannar live URLs för title, H1, status, hreflang)",
        ],
      },
    ],
  },
  {
    id: "performance",
    title: "Performance & SEO-tracking",
    category: "Moduler",
    summary: "Live rankings, GA4 och GSC-data i en vy med ROI-koppling.",
    body: [
      {
        text:
          "Performance Tracker visar trafik, rankings, konverteringar och intäkter över tid. Sätt mål och se progression mot dem. Action Impact-vyn kopplar varje åtgärd från Action Tracker till mätbar effekt.",
      },
      {
        heading: "Innan du börjar",
        bullets: [
          "Koppla GSC under Inställningar → Integrationer",
          "Koppla GA4 om du vill ha konverteringsdata",
          "Sätt CR, AOV och marginal under Workspace-inställningar för ROI-beräkningar",
        ],
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/ExecutiveDashboard.tsx + komponenter under src/components/workspace/",
          "GSC: gsc-fetch + gsc-fetch-history edge functions (Search Analytics API)",
          "GA4: ga4-fetch + ga4-revenue-fetch edge functions (Analytics Data API v1beta)",
          "ROI: src/lib/roi.ts beräknar intäkt = sessions × CR × AOV × marginal",
          "Action Impact: measure-action-impact edge function jämför 28 dagar före/efter",
        ],
      },
    ],
  },
  {
    id: "weekly-briefing",
    title: "Veckans briefing",
    category: "Moduler",
    summary: "AI-genererad veckorapport som mailas automatiskt.",
    body: [
      {
        text:
          "Varje vecka genererar Slay Station en briefing med vinster, varningar, ranknings-rörelser och rekommenderade nästa steg. Briefingen kan mailas till kund eller team.",
      },
      {
        heading: "Konfiguration",
        bullets: [
          "Aktivera under Översikt → Veckans briefing",
          "Lägg till mottagare under Inställningar",
          "Anpassa avsändarnamn med Brand Kit",
        ],
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Edge functions: weekly-briefing (genererar) + weekly-briefing-send (mailar)",
          "Datakälla: 7-dagars delta från GSC + GA4 + Action Tracker",
          "AI: Gemini 2.5 Flash för sammanfattning, prioritering av vinster/risker",
          "Mail: skickas via Resend API till mottagarlista i workspace-settings",
          "Historik: weekly_briefings-tabellen, visas i WeeklyBriefingHistory",
        ],
      },
    ],
  },
  {
    id: "action-tracker",
    title: "Action Tracker",
    category: "Moduler",
    summary: "Backlog med impact-mätning per åtgärd.",
    body: [
      {
        text:
          "Action Tracker är din backlog. Varje åtgärd får prio, ägare, deadline och en koppling till mätbar impact. När du markerar en åtgärd som klar kan systemet mäta före/efter på rankings, trafik eller intäkt.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/ActionTracker.tsx + useActionItems-hook",
          "Lagring: action_items-tabell med RLS per workspace",
          "Impact: measure-action-impact edge function snapshottar GSC/GA4 vid completion",
          "Push från andra moduler: Pre-launch Blueprint och Sökordsuniversum kan skicka rader hit",
        ],
      },
    ],
  },
  {
    id: "seo-audit",
    title: "SEO Audit",
    category: "Moduler",
    summary: "Teknisk crawl av sajten med prioriterade fynd.",
    body: [
      {
        text:
          "SEO Audit kör en teknisk genomgång av sajten — hittar trasiga länkar, dubblerade titles, saknade meta descriptions, hreflang-problem och Core Web Vitals-varningar.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/SeoAudit.tsx",
          "Edge function: seo-audit-run (egen crawler) + semrush-audit (extern)",
          "Live URL-scan: webscan edge function för on-page-signaler",
          "Rapport: prioriteras med severity (critical/warning/info) och pushas till Action Tracker",
        ],
      },
    ],
  },
  {
    id: "google-ads",
    title: "Google Ads & Auction Insights",
    category: "Moduler",
    summary: "Auktionsanalys, kannibalisering och AI-genererade annonser.",
    body: [
      {
        text:
          "Google Ads-modulen hämtar auction insights, jämför betald vs organisk synlighet och flaggar kannibaliseringsproblem mellan dina egna kampanjer.",
      },
      {
        heading: "Funktioner",
        bullets: [
          "Auction Insights — vem du delar SERP med och impression share",
          "Cannibalization — överlapp mellan SEO-rankings och Ads-kampanjer",
          "Generate Ads — AI-genererade headlines/descriptions från sökordskluster",
        ],
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Edge functions: ads-list-customers, ads-fetch-auction-insights, ads-cannibalization, ads-monitor, generate-ads",
          "Auth: Google OAuth via google-oauth edge function (developer token + MCC)",
          "AI: Gemini 2.5 Pro för annonsgenerering med Brand Kit som tone of voice",
        ],
      },
    ],
  },
  {
    id: "paid-vs-organic",
    title: "Paid vs Organic",
    category: "Moduler",
    summary: "Sida-vid-sida-analys av betald och organisk trafik per sökord.",
    body: [
      {
        text:
          "Visar vilka sökord som driver mest värde organiskt vs betalt, var du betalar för trafik du redan rankar på, och var Ads kompenserar för svag SEO.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/PaidVsOrganic.tsx",
          "Data: joinas från GSC (organisk position/klick) och Google Ads (CPC/clicks)",
          "Logik: src/lib/clusterActions.ts segmenterar sökord per kategori",
        ],
      },
    ],
  },
  {
    id: "brand-kit",
    title: "Brand Kit",
    category: "Moduler",
    summary: "Tone of voice, färger och avsändarprofil per kund.",
    body: [
      {
        text:
          "Brand Kit håller varumärkesregler per kund — färger, font, tone of voice, do/don't. Används av AI-moduler (Generate Ads, Briefing, Content Briefs) så att output följer kundens röst.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Frontend: src/pages/workspace/BrandKit.tsx + useBrandKit-hook",
          "Lagring: brand_kits-tabell med JSON-fält för paletter och regler",
          "Injektion: brand kit-prompten läggs till i system message vid AI-generering",
        ],
      },
    ],
  },
  {
    id: "reports",
    title: "Rapporter & Artefakter",
    category: "Moduler",
    summary: "Genererade leverabler — strategi-PDFer, content briefs, presentationer.",
    body: [
      {
        text:
          "Allt som genereras (strategier, briefs, presentationer) sparas som artefakter och kan exporteras eller delas med kund.",
      },
      {
        heading: "Hur den är byggd",
        bullets: [
          "Edge functions: generate-strategy, generate-brief, generate-presentation, weekly-report",
          "Export: src/lib/contentBriefExport.ts (Markdown/CSV) + googleAdsExport.ts",
          "Lagring: artifacts-tabell, visas i WorkspaceArtifacts.tsx",
        ],
      },
    ],
  },
  {
    id: "keyword-universe",
    title: "Sökordsuniversum",
    category: "Moduler",
    summary: "AI-klustrade sökord med volym, intent och konkurrentdata.",
    body: [
      {
        text:
          "Sökordsuniversum samlar alla relevanta sökord för kundens nisch i klustrade grupper. Varje kluster har en pillar och support-keywords med volym, KD, intent och vilka konkurrenter som rankar.",
      },
      {
        heading: "Tre flikar",
        bullets: [
          "Strategy — high-level priorities och content gaps",
          "Cluster Actions — sökord grupperade per kluster med åtgärder",
          "Tech SEO — tekniska blockers per landningssida",
        ],
      },
    ],
  },
  {
    id: "performance",
    title: "Performance & SEO-tracking",
    category: "Moduler",
    summary: "Live rankings, GA4 och GSC-data i en vy med ROI-koppling.",
    body: [
      {
        text:
          "Performance Tracker visar trafik, rankings, konverteringar och intäkter över tid. Sätt mål och se progression mot dem. Action Impact-vyn kopplar varje åtgärd från Action Tracker till mätbar effekt.",
      },
      {
        heading: "Innan du börjar",
        bullets: [
          "Koppla GSC under Inställningar → Integrationer",
          "Koppla GA4 om du vill ha konverteringsdata",
          "Sätt CR, AOV och marginal under Workspace-inställningar för ROI-beräkningar",
        ],
      },
    ],
  },
  {
    id: "weekly-briefing",
    title: "Veckans briefing",
    category: "Moduler",
    summary: "AI-genererad veckorapport som mailas automatiskt.",
    body: [
      {
        text:
          "Varje vecka genererar Slay Station en briefing med vinster, varningar, ranknings-rörelser och rekommenderade nästa steg. Briefingen kan mailas till kund eller team.",
      },
      {
        heading: "Konfiguration",
        bullets: [
          "Aktivera under Översikt → Veckans briefing",
          "Lägg till mottagare under Inställningar",
          "Anpassa avsändarnamn med Brand Kit",
        ],
      },
    ],
  },
  {
    id: "action-tracker",
    title: "Action Tracker",
    category: "Moduler",
    summary: "Backlog med impact-mätning per åtgärd.",
    body: [
      {
        text:
          "Action Tracker är din backlog. Varje åtgärd får prio, ägare, deadline och en koppling till mätbar impact. När du markerar en åtgärd som klar kan systemet mäta före/efter på rankings, trafik eller intäkt.",
      },
    ],
  },

  // ===== Arbetsflöden =====
  {
    id: "wf-new-client",
    title: "Workflow: Ny kund från noll",
    category: "Arbetsflöden",
    summary: "Steg-för-steg från ny kund till levererad strategi.",
    body: [
      {
        bullets: [
          "Skapa kund i Min byrå",
          "Öppna workspace → Analys → Pre-launch Blueprint",
          "Fyll i brief (5-10 min)",
          "Vänta på research (2-5 min)",
          "Granska de 5 flikarna och redigera där det behövs",
          "Exportera sajtkartan som CSV",
          "Pusha priolistan till Action Tracker",
          "Aktivera veckans briefing",
        ],
      },
    ],
  },
  {
    id: "wf-existing-client",
    title: "Workflow: Befintlig kund med data",
    category: "Arbetsflöden",
    summary: "Onboarda en kund som redan har GSC/GA4 igång.",
    body: [
      {
        bullets: [
          "Skapa kund i Min byrå",
          "Inställningar → Integrationer → koppla GSC + GA4",
          "Workspace → kör Sökordsuniversum-analys",
          "Granska Performance Tracker för baseline",
          "Sätt mål under Performance & mål",
          "Aktivera veckans briefing",
        ],
      },
    ],
  },

  // ===== Integrationer =====
  {
    id: "integrations",
    title: "Integrationer",
    category: "Integrationer",
    summary: "Vilka datakällor som kopplas in och varför.",
    body: [
      {
        bullets: [
          "Google Search Console — rankings, klick, impressions",
          "Google Analytics 4 — trafik, konverteringar, intäkt",
          "Google Ads — auktioner, sökordskostnad, cannibalisering",
          "DataForSEO — sökvolymer, CPC, KD, ranked keywords",
          "Firecrawl — konkurrentskrapning för Pre-launch Blueprint",
          "Lovable AI (Gemini) — analys, syntes, klustring",
        ],
      },
    ],
  },

  // ===== Release notes =====
  {
    id: "release-2026-05",
    title: "Maj 2026 — Slay Station + Pre-launch Blueprint",
    category: "Release notes",
    summary: "Rebranding från KEYMAP och ny pre-launch-modul.",
    body: [
      {
        bullets: [
          "Verktyget döpts om till Slay Station",
          "Ny modul: Pre-launch Blueprint för sajter utan data",
          "Ny edge function: prelaunch-research (Firecrawl + DataForSEO + Gemini)",
          "12-månaders trafik- och intäktsprognos med 3 scenarier",
          "Sajtkartans CSV-export och push till Action Tracker",
          "Ny startsida och knowledge base",
        ],
      },
    ],
  },
];

export const DOC_CATEGORIES: DocSection["category"][] = [
  "Kom igång",
  "Moduler",
  "Arbetsflöden",
  "Integrationer",
  "Release notes",
];
