# Roadmap: Agentisk Google Ads i Slay Station

Tre sprintar som lyfter Slay Station från "data + ad-generator" till en agentisk PPC-analytiker. Varje sprint är fristående och kan släppas separat.

---

## Sprint 1 – Diagnostik & spara pengar (största värdet, snabbast)

**Mål:** Visa kunden inom 30 sek var pengar slösas och vad som ska göras idag.

### 1.1 PPC Audit Agent
- Ny edge function `ads-audit` (anropar `searchGaql` för campaign/adgroup/keyword/asset, `metrics.cost_micros`, `quality_score`, `search_impression_share`, `conversions`).
- Lovable AI (`google/gemini-3-flash-preview`) sammanfattar till strukturerad JSON via tool calling: health_score (1–10), strengths[], issues[] (severity+fix+impact_sek), quick_wins[].
- Lagras i ny tabell `ads_audits` (project_id, score, summary jsonb, raw jsonb, created_at) med RLS via `projects.user_id`.
- Ny sida `src/pages/workspace/AdsAudit.tsx` med score-gauge, issue-lista, "Kör nytt audit"-knapp, markdown-export.
- Länk i `WorkspaceSidebar` under Ads-sektionen.

### 1.2 Wasted Spend Finder
- Edge function `ads-wasted-spend`: GAQL på `keyword_view` last 30d där `cost_micros > tröskel` och `conversions = 0` (samt `search_terms_view` för bredmatch-läckage).
- Returnerar tabell: keyword, kampanj, kostnad, klick, ctr, föreslagen åtgärd (pausa / negativ / sänk bud).
- Skriver in topp-5 som `action_items` automatiskt med `expected_savings_sek`.

### 1.3 Negative Keyword Mining
- Edge function `ads-negative-mining`: hämtar `search_term_view` 90d, skickar till Lovable AI som klustrar irrelevanta termer (tool call → `clusters: [{theme, terms[], wasted_sek, suggested_negative, match_type}]`).
- UI: ny tab i AuctionInsights eller egen `NegativeKeywords.tsx`. Bulk-knapp "Lägg till som action items" + CSV-export i Google Ads Editor-format.

**Leverans Sprint 1:** Audit-sida + Wasted Spend i ActionTracker + Negative Mining-tab. Migration för `ads_audits`. Ingen skrivåtkomst mot Google Ads ännu.

---

## Sprint 2 – Workflow & RSA-optimering ✅ KLAR

**Levererat:**
- Edge function `ads-rsa-performance` — analyserar `ad_group_ad_asset_view` (BEST/GOOD/LOW), AI-genererar 3 ersättningskandidater per LOW-asset matchat mot brand voice från `BrandKit`.
- Edge function `ads-mutate` — write-back till Google Ads via `mutateAds`-helper i `_shared/google-ads.ts`. Stödjer: `add_negative_keyword`, `pause_keyword`, `resume_keyword`, `pause_ad`, `resume_ad`, `remove_resource`. Loggar i ny `ads_mutations`-tabell med `revert_payload`.
- Edge function `ads-revert-mutation` — invertering av tidigare mutation.
- Edge function `ads-pacing` — jämför 7d vs 30d baseline per kampanj och skapar `alerts` för pacing-overshoot, CPC-spikar och konverteringsras.
- UI `AdsAudit.tsx` utökad med tre nya flikar: **RSA Optimizer**, **Pacing**, **Logg** (audit log med Återställ). Wasted Spend har Push-knapp per rad (Pausa / Lägg som negativ) med bekräftelse-dialog. Negative Mining har "Pusha N negativ"-knapp.
- Migration: `ads_mutations` med RLS via `projects.user_id`.

**Säkerhet:** Alla write-back kräver explicit confirm-dialog och loggas före + efter. Reverts möjliga för status-ändringar och add_negative.

---

## Sprint 3 – Konversation & långsiktig intelligens

**Mål:** Gör Slay Station till "AI PPC-analytiker du kan fråga".

### 3.1 Ask Your PPC Analyst (chat)
- Edge function `ads-chat` (SSE-streaming enligt Lovable AI streaming-pattern).
- System prompt har tillgång till tool calls: `get_campaign_metrics`, `get_search_terms`, `get_audit_summary`, `get_gsc_overlap`, `create_action_item`.
- Modell: `google/gemini-2.5-pro` för djup, fallback till flash.
- UI: collapsible chat-panel i WorkspaceLayout (höger sidebar) som följer med på alla workspace-sidor. Per-workspace chat history i ny tabell `workspace_chats`.

### 3.2 Quality Score & ranking-historik
- Cron lägger snapshot per dag i ny tabell `ads_quality_snapshots` (keyword_id, qs, cpc, position, date).
- UI: trend-graf i RSA Optimizer + i AdsAudit för att visa förbättring efter åtgärder.
- Kopplas till `measure-action-impact` så agenten kan svara "Negativen du la till för 14 dagar sedan sparade 4 230 SEK".

### 3.3 Strategiska veckorapporter
- Utöka `weekly-briefing` med Ads-sektion: audit-delta, top wins, top issues, rekommenderade åtgärder för nästa vecka.
- Genereras som markdown + skickas via Resend till `briefing_email`.

**Leverans Sprint 3:** Chat-panel + QS-historik + Ads-sektion i veckobriefing.

---

## Tekniska detaljer

**Nya tabeller (migrations):**
- `ads_audits` — historik på health-checks
- `ads_mutations` — audit log för write-back
- `ads_quality_snapshots` — daglig QS-trend
- `workspace_chats` — chat-historik per workspace

Alla med RLS via `EXISTS (SELECT 1 FROM projects WHERE projects.id = project_id AND projects.user_id = auth.uid())`.

**Nya edge functions:** `ads-audit`, `ads-wasted-spend`, `ads-negative-mining`, `ads-rsa-performance`, `ads-mutate`, `ads-chat`. Alla återanvänder `_shared/google-ads.ts` (utökas med `mutateGaql`-helper i Sprint 2).

**Befintlig återanvändning:** `getAdsContext`, `searchGaql`, `project_google_settings.ads_customer_id`, `action_items`-tabellen, `alerts`-tabellen, `BrandKit` för ton-of-voice i RSA-förslag.

**Risker:**
- Google Ads write-API kräver att developer token har skrivåtkomst (kontrollera approval-status).
- `mutate`-anrop är icke-atomiska — behövs robust error handling + ångra-flöde.
- Ratelimits Google Ads: batcha mutations, exponential backoff.

---

## Förslag på upplägg
- **Vecka 1–2:** Sprint 1 (störst affärsvärde, ingen risk för kundkonton)
- **Vecka 3–4:** Sprint 2 (write-API, kräver mest QA)
- **Vecka 5–6:** Sprint 3 (chat + intelligence-lager)

Säg vilken sprint du vill köra först så bygger jag den efter godkännande.
