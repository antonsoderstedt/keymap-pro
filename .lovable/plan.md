## Statusöversikt — KEYMAP workspace

### Fas 1 — Kärna (KLART)
- Wizard: Context → Import → Analyse → Results
- Keyword Universe + Semrush/DataForSEO-berikning
- Content briefs, Strategy, Ad drafts
- Brand Kit, Workspace artifacts
- Min byrå (klientlista) + per-kund workspace

### Fas 2 — Always-on workspace + Google (KLART)
- Workspace-layout med sidebar
- Google OAuth (GSC + GA4 + Ads-scope) ✅
- Edge-funktioner: `gsc-fetch`, `ga4-fetch`, `ads-list-customers`, `ads-fetch-auction-insights`, `ads-monitor`, `seo-audit-run`, `measure-action-impact`
- Sidor: SeoDashboard, Ga4Dashboard, AuctionInsights, SeoAudit, Alerts, ActionTracker, ReportsLibrary, ExecutiveDashboard
- KPI-mål (CRUD i Settings)
- Google Ads-konto väljs och sparas per kund ✅ (precis klart)
- Felhantering med specifika koder (DEVELOPER_TOKEN_*, MCC_*, OAUTH_INVALID osv) ✅

---

## ❌ Inte klart — kvarvarande luckor

### 1. Paid vs Organic är halvfärdig
`src/pages/workspace/PaidVsOrganic.tsx` visar bara heuristisk brand/non-brand och en kanal-graf.
- Banner "Kommer i Fas 3" finns kvar (rad 122)
- Använder inte Ads-data alls — ingen riktig SEO-kannibalisering
- Behöver: matcha GSC top-3 organiska queries mot Ads search terms (samma keyword = kannibalisering, sparar budget om vi pausar)

### 2. "Coming soon"-routes som ljuger om appen
`src/App.tsx` rad 73–74:
- `/keyword-universe` → `<ComingSoon>`
- `/segments` → `<ComingSoon>`
Antingen bygg riktiga sidor eller ta bort sidomenu-länkarna.

### 3. Föråldrad banner på Översikt
`WorkspaceOverview.tsx` rad 320–335 listar saker som "kommer i kommande faser" som i själva verket redan är byggda (SEO-dashboard, GA4, Ads, Auction Insights, AI-alerts, Brand Kit, schemalagda rapporter, effektmätning). Vilseledande.

### 4. Automation rules — ingen UI
Tabellen `automation_rules` finns med RLS, men inget UI för att skapa/läsa regler.

### 5. Effektmätning visas inte
`measure-action-impact` edge-funktion finns och `action_outcomes`-tabell finns, men ingen vy på `ActionTracker` som visar uppmätt impact per åtgärd.

### 6. Schemalagda rapporter
`ReportsLibrary` finns men inget cron/email-flöde för att leverera rapporter automatiskt (PDF eller länk via mejl).

### 7. Ads-scope synlighet (från förra planen, valfritt)
Inte byggt: "Ads-scope: Ja/Nej"-badge på Översikt så användaren själv kan se kopplingsstatus.

---

## Föreslagen ordning för Fas 3-städning

```text
A. Rensa lögner   →  B. Bygg riktig värde
─────────────────    ─────────────────────
1. Översikt-banner   4. PaidVsOrganic kannibalisering
2. ComingSoon-routes 5. Effektmätning i ActionTracker
3. Ads-scope badge   6. Automation rules UI
                     7. Schemalagda rapporter
```

**Min rekommendation:** börja med **A1+A2+A3** (snabb städning, ~1 iteration) följt av **B4** (Paid vs Organic kannibalisering — det användaren just klickade på och blev besviken över). Resten kan tas i separata iterationer.

## Tekniska detaljer (för referens)

- **PaidVsOrganic kannibalisering**: ny edge-funktion eller utöka `ads-monitor` för att hämta search terms via GAQL `search_term_view`, joina mot senaste `gsc_snapshots.rows` på normaliserat keyword, returnera överlapp med organisk position ≤ 3 + ads-cost.
- **Effektmätning UI**: läs `action_outcomes` joinat med `action_items` i `ActionTracker.tsx`, visa delta% per implementerad åtgärd.
- **Automation rules UI**: ny sektion i `WorkspaceSettings.tsx` (regeltyper: `kpi_breach`, `audit_critical`, `auction_loss_pct`).
- **Schemalagda rapporter**: cron via `supabase/config.toml` schedule + ny edge `report-deliver` som mailar via Resend.
- **Översikt-banner**: ersätt med "Vad är aktivt"-checklist baserat på `project_google_settings` (GSC/GA4/Ads).

## Vad jag inte behöver göra om
- ✅ Google OAuth + Ads-koppling fungerar
- ✅ Edge-funktioner är deployade
- ✅ KPI-mål, Alerts, ActionTracker grunder
- ✅ Felhantering med koder

Vänta på godkännande sen kör jag **A (städning)** + **B4 (kannibalisering)** i en första svep.
