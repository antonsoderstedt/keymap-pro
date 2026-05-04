## Mål

Hämta riktiga konkurrent-domäner från Google Ads Auction Insights automatiskt varje natt, via ett Google Ads Script som postar till en webhook hos oss. Visa datan i den befintliga `AuctionInsights`-vyn och länka in den i kannibaliserings-/Brand-analysen.

## Översikt av flödet

```text
Google Ads-konto
  └─ Ads Script (kör varje natt)
       └─ Hämtar Auction Insights per kampanj
            └─ POST → /functions/v1/ads-webhook-auction-insights
                 ├─ Validerar HMAC-signatur (delad hemlighet)
                 ├─ Resolvar customer_id → project_id
                 └─ INSERT i auction_insights_snapshots
                       └─ AuctionInsights-vyn visar konkurrenter
```

## Backend

**1. Ny edge function: `ads-webhook-auction-insights`**
- Publik (ingen JWT-validering — autentisering sker via HMAC).
- Tar emot POST med body: `{ customer_id, start_date, end_date, campaigns: [{ id, name, competitors: [{ domain, impression_share, overlap_rate, position_above_rate, top_of_page_rate, abs_top_of_page_rate, outranking_share }] }] }`.
- Validerar `X-Slay-Signature` header = HMAC-SHA256(body, `ADS_WEBHOOK_SECRET`).
- Slår upp `project_id` via `project_google_settings.ads_customer_id = customer_id` (service-role).
- Sparar i `auction_insights_snapshots.rows` med både `competitors` (sammanslagna unika domäner med medel-värden) och `campaigns` (per-kampanj breakdown inkl konkurrentlista).
- Returnerar `{ ok, snapshot_id, projects_updated }`.

**2. Ny edge function: `ads-script-template`**
- Returnerar Google Ads Script-koden som text, med `{{WEBHOOK_URL}}` och `{{SECRET}}` ifyllda för det specifika projektet.
- Hemligheten är per-projekt: ny kolumn `project_google_settings.ads_script_secret` (genereras via `gen_random_uuid()` när användaren begär den).
- Kräver inloggning + projekt-medlemskap.

**3. Ny secret:** `ADS_WEBHOOK_SECRET` (master-pepper) — kombineras med per-projekt-hemligheten i HMAC.

## Databas

**Migration:**
- Lägg till `ads_script_secret text` på `project_google_settings`.
- Lägg till `source text default 'api'` på `auction_insights_snapshots` (`'api'` = nuvarande GAQL, `'script'` = ny väg) så vi kan särskilja.

## Google Ads Script (klistras in i kundens Ads-konto)

Ett självständigt JS-script (~80 rader) som:
1. Definierar `WEBHOOK_URL` och `SECRET` (förifyllt av template-funktionen).
2. För varje aktiv Search-kampanj: kör `AdsApp.report()` mot `auction_insight_performance_report` för senaste 30 dagar.
3. Bygger payloaden, beräknar HMAC med `Utilities.computeHmacSha256Signature`.
4. Postar till webhook med `UrlFetchApp.fetch` + `X-Slay-Signature` header.
5. Loggar resultat. Schemaläggs av användaren till "Daily" i Ads UI.

## Frontend

**1. `AuctionInsights.tsx` — ny sektion "Automatisk import via Ads Script"**
- Knapp "Generera mitt script" → anropar `ads-script-template` → öppnar modal med:
  - Webhook-URL (read-only, kopiera-knapp).
  - Per-projekt-hemlighet (read-only, kopiera-knapp).
  - Färdig script-kod (read-only, kopiera-knapp).
  - Steg-för-steg-instruktion: 1) Ads → Verktyg → Bulk-åtgärder → Skript → Nytt script → klistra in → Auktorisera → Schemalägg "Daily".
- Visar status-badge: "Senast mottaget: X" baserat på senaste `auction_insights_snapshots` med `source='script'`.

**2. Konkurrent-tabellen** uppdateras för att visa de nya fälten (`outranking_share`, `abs_top_of_page_rate`).

**3. Brand-koppling i kannibaliseringsvyn (Bild 1):**
- I `AdsAudit.tsx` Hälsokontroll: när "höj brand-budget"-rekommendation triggas, kontrollera om vi har auction-insights-data för brand-kampanjen. Om antalet unika konkurrent-domäner med >5% IS på brand-termer är ≥2 → visa "Defensiv brand-budget rekommenderas (X konkurrenter budar på ditt varumärke)" istället för att rekommendera pausning.

## Säkerhet

- Webhook är publik men kräver giltig HMAC → ingen kan posta skräp utan hemligheten.
- Per-projekt-hemlighet gör att även om en hemlighet läcker påverkas bara ett projekt.
- Service-role används bara för insert efter signaturvalidering.
- `ads_script_secret` läses bara av projekt-medlemmar via RLS.

## Användarens engångs-setup (vad de behöver göra)

1. I Slay Station: Auction Insights → "Generera mitt script" → kopiera koden.
2. I Google Ads: Verktyg → Bulk-åtgärder → Skript → Nytt → klistra in → Spara → Auktorisera.
3. Klicka "Förhandsgranska" en gång → verifiera att data kommer in i Slay Station.
4. Schemalägg "Frequency: Daily".

Sen rullar det automatiskt.

## Filer som skapas/ändras

**Nya:**
- `supabase/functions/ads-webhook-auction-insights/index.ts`
- `supabase/functions/ads-script-template/index.ts`
- Migration för `ads_script_secret` + `source`-kolumn

**Ändrade:**
- `src/pages/workspace/AuctionInsights.tsx` (script-modal + nya konkurrentfält)
- `src/pages/workspace/AdsAudit.tsx` (defensiv brand-logik baserad på konkurrentdata)
- `supabase/config.toml` (sätt `verify_jwt = false` för webhook-funktionen)

## Frågor innan start

Inga — jag kör enligt ovan om du godkänner. Du behöver bara godkänna planen och senare lägga till `ADS_WEBHOOK_SECRET` när jag frågar (jag genererar förslag).
