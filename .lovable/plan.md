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

## Sprint 2 – Workflow & RSA-optimering

**Mål:** Stäng loopen från insikt till genomförd ändring.

### 2.1 RSA Asset Performance
- Edge function `ads-rsa-performance`: GAQL på `ad_group_ad_asset_view` (asset.text, performance_label PENDING/LOW/GOOD/BEST, impressions, conversions).
- Lovable AI föreslår ersättare för LOW-assets baserat på BEST-mönster + brand voice från `BrandKit`.
- Utbyggnad av `generate-ads`: tar nu `replace_asset_id` och genererar 3 kandidat-headlines/descriptions matchade mot vinnar-tonalitet.
- UI: tab "RSA Optimizer" i KeywordUniverse eller egen sida — winners/losers split, "Föreslå ersättare"-knapp.

### 2.2 Budget Pacing & Anomaly Alerts
- Cron-utbyggnad i `ads-monitor`: jämför dagens spend-rate vs månadsbudget och vs föregående 30d genomsnitt.
- Skapar `alerts` med severity warning/critical: "Kampanj X bränner 180% av normal pace", "CPC +45% senaste 7 dagar", "Konvertering −30%".
- Trigger: lägg till i befintlig `weekly-report` cron + on-demand via knapp.

### 2.3 Push to Google Ads (write-API)
- Ny edge function `ads-mutate`: tar action_item_id, slår upp typ (add_negative / pause_keyword / pause_ad / replace_rsa_asset) och kör motsvarande Google Ads `mutate`-anrop via `_shared/google-ads.ts` (utöka med `mutateGaql`).
- Säkerhet: kräv explicit user-confirm i UI ("Detta ändrar live i kontot"). Logga i ny tabell `ads_mutations` (vem, vad, payload, response, ångra-id).
- "Ångra"-knapp som inverterar mutation där möjligt (unpause, ta bort negativ).

**Leverans Sprint 2:** RSA Optimizer + pacing-alerts i Alerts-sidan + write-back-knappar på action items med audit log.

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
