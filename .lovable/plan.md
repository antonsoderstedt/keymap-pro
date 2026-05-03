
# Översyn & nästa sprintar — Slay Station (uppdaterad)

Ja, planen täcker både **det du listade i meddelandet** och **det som var kvar från Sprint 1–2** (RSA write-back på asset-nivå, bulk-push, CSV-export, schemalagd pacing, bättre revert-logg, verifiera negative mining, status-UI). Plus de nya buggarna (Auction Insights, GA4, Results-tappet, Segment-klick, Action Tracker, SEO Audit, ROI, Brand Kit auto). Och nu även **GA4-exkludering** i inställningar.

---

## Vad jag hittade i koden (kort)

- **Results.tsx** hämtar senaste `analyses`-rad utan `result_json IS NOT NULL` → tappar gammal data när nytt jobb startas. Detta är "analyser försvinner"-buggen.
- **WorkspaceSegments** — paket-korten saknar `onClick`.
- **Ga4Dashboard** — ingen "uppdatera"-knapp, ingen filter, visar bara senaste snapshot.
- **AuctionInsights** — fungerar men ingen schemalagd refresh och ingen åtgärds-koppling.
- **ActionTracker** — saknar drill-down av `source_payload`, kommentarer och Review-&-push-knapp.
- **SeoAudit** — bara checkbox; ingen "skapa åtgärd"-koppling.
- **RoiOverview** — kräver `totals.kind=='revenue_by_page'` som inte alltid sätts av `ga4-revenue-fetch`.
- **AdsAudit (RSA)** — säger själv i UI:t "write-back för enskilda assets kommer i nästa iteration" — det är kvar från Sprint 2.
- **ads-negative-mining** — fixat (90d-bug) men saknar status-UI och historik.
- **Brand Kit** — ingen "Hämta från sajt"-knapp.

---

## Sprint 3 — Fixa allt som är trasigt idag (~2,5h)

1. **Analyser försvinner inte** — `Results.tsx` hämtar nu senaste rad där `result_json IS NOT NULL`, behåller resultat under polling.
2. **Segment & paket klickbart** — drawer öppnar brief/ads-innehåll, eller deep-link till Artefakter. Saknas paket → "Skapa nu"-knapp som triggar `generate-brief` / `generate-ads`.
3. **Action Tracker drill-down + kommentarer + review-push**
   - Expanderbar rad visar `source_payload` (kampanj, sökord, kostnad).
   - Kommentarsfält (sparas i ny `action_items.notes jsonb[]`).
   - "Review & push"-knapp för åtgärder med `source_type ∈ {ads_wasted, ads_negatives, ads_pacing}` → kör `ads-mutate` med bekräftelse.
4. **SEO Audit → action items** — "Skapa åtgärd"-knapp per finding + bulk för topp-10 kritiska/höga.
5. **Auction Insights komplett** — verifiera GAQL-datumklausul, lägg deltatrend mot föregående snapshot, "Skapa åtgärd" för konkurrenter med ökande overlap, schemalagd refresh (veckovis via pg_cron).
6. **GA4 Dashboard funktionell** — "Hämta nu"-knapp som anropar `ga4-fetch`, daglig trend-graf, propertyId + senast uppdaterad, tom-state länkar Inställningar.
7. **ROI/Attribution fixad** — `ga4-revenue-fetch` skriver `totals.kind`, RoiOverview faller tillbaka på revenue-rader om markör saknas, lägg till klusternedbrytning.
8. **Negative mining status-UI** — "Senast körd / status / fel" + körningar loggas i `analysis_jobs` (job_type='negative_mining').

---

## Sprint 4 — RSA write-back, bulk, schemaläggning (~3h) — Sprint 2-leftover + dina nya önskemål

1. **Asset-nivå write-back i RSA Optimizer**
   - Ny `action_type: replace_rsa_asset` i `ads-mutate`. Hämtar full RSA, ersätter matchande headline/description, kör `ads:mutate` med `updateMask`. Fallback: skapa ny RSA + pausa gammal för konton som inte stöder update. Revert-payload sparar original-array.
2. **Bulk-godkänn & batch-push i RSA-fliken**
   - Checkbox per förslag + "Pusha valda" → en batch-operation till Google Ads, loggas som en `ads_mutations`-rad (`action_type='rsa_batch'`).
3. **CSV / Sheets-export för RSA-ersättningar**
   - Kolumner: campaign, ad_group, field, original, candidate, performance_label, rationale.
4. **Schemalagd pacing-monitoring + in-app notiser**
   - `pg_cron` (07:00 dagligen) → wrapper `cron-ads-pacing` loopar projekt med `ads_customer_id`. Skriver i `alerts`. Sidomenyn får badge "Alerts (n)". Settings: dagligen / veckovis / av + e-postnotis (återanvänder `briefing_email_recipients`).
5. **Bättre mutations- & revert-logg**
   - Gruppera per dag, visa diff av vad som ändrats, "Ångra hela dagens push", filter på action_type/status/kampanj.
6. **Verifiera negative mining + bulk-push** — UI som visar resultat efter fix; CSV-export i Google Ads Editor-format.

---

## Sprint 5 — Brand Kit auto + GA4-exkludering + AI-chat (~2,5h)

1. **Brand Kit "Generera från sajten"**
   - Ny edge function `brand-kit-extract`: Firecrawl scrape → Gemini extraherar färger, fonts, tone of voice, logo. Förfyller fälten i `BrandKit.tsx`.

2. **GA4-data-exkluderingar (NYTT)**
   - Ny tabell `ga4_filters` (project_id, filter_type, dimension, operator, value, is_active). Exempel: `pagePath` not contains `/admin`, `sessionMedium` != `internal`, `country` != `Sweden` etc.
   - UI: ny sektion i Inställningar "GA4-filter" med "Lägg till filter" och presets ("Exkludera /admin", "Exkludera intern trafik via IP-cookie", "Exkludera bot-trafik").
   - `ga4-fetch` och `ga4-revenue-fetch` läser filtren och lägger till `dimensionFilter` i GA4-runReport-anropet (GA4 stödjer detta nativt via `dimensionFilter.filter.stringFilter`).
   - Befintliga snapshots taggas med vilket filter-set som användes så vi kan jämföra "med/utan admin".

3. **AI PPC-chat (Sprint 3-leftover från ursprungsplan)**
   - `ads-chat` edge function med tool calls (`get_campaign_metrics`, `get_audit_summary`, `create_action_item`). Drawer i AdsAudit.

4. **Auto-skapa åtgärder från alla anomali-källor**
   - `ads-pacing`, `ads-cannibalization`, `auction_insights` skapar `action_items` med rik payload som Sprint 3:s Review-&-push-flöde kan konsumera.

---

## Tekniska detaljer

**Migrations:**
- `action_items.notes jsonb default '[]'::jsonb`
- ny tabell `ga4_filters` med RLS via `projects.user_id`

**Nya edge functions:** `brand-kit-extract`, `cron-ads-pacing`, `ads-chat`

**Uppdaterade edge functions:**
- `ads-mutate` — `replace_rsa_asset`, `rsa_batch`
- `ads-revert-mutation` — stöd för rsa_batch + asset-restore
- `ga4-fetch` & `ga4-revenue-fetch` — applicera ga4_filters
- `ads-fetch-auction-insights` — verifiera GAQL date-clause
- `generate-brief` / `generate-ads` — anropas från Segment-drawer

**pg_cron:** dagligen 07:00 Europe/Stockholm för pacing, veckovis sön 06:00 för Auction Insights.

---

## Förslag

Kör **Sprint 3 först** (fixa det trasiga), sen **Sprint 4** (write-back & schemaläggning), sen **Sprint 5** (Brand Kit auto + GA4-filter + chat). Säg "kör sprint 3" så drar jag igång.

---

## Status (Sprint 3-5 fortsättning)
- ✅ Brand Kit auto-extract från sajt (`brand-kit-extract` + UI-knapp)
- ✅ GA4-filter (tabell, Settings-UI, applicering i `ga4-fetch` & `ga4-revenue-fetch`)
- ✅ GA4 Dashboard refresh-knapp + datumväljare + persist
- ✅ Action Tracker drilldown, kommentarer (notes), Review & push för ads-källor
- ✅ SEO Audit "Skapa åtgärd" per finding + bulk topp-10
- ✅ `cron-ads-pacing` wrapper (cron-schemat sätts senare via insert-tool)
