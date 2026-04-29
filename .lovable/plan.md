# KEYMAP — Plan-status

## Fas 1 — KLART
Wizard, Keyword Universe, Briefs, Strategy, Ad drafts, Brand Kit, Artifacts, klientlista.

## Fas 2 — KLART
Workspace-layout, Google OAuth (GSC + GA4 + Ads), edge-funktioner, dashboards, KPI-mål, Alerts, Action Tracker, Audit, Ads-konto väljs per kund.

## Fas 3 — Pågår

### KLART denna iteration
- ✅ A1: Översikt-banner ersatt med "Vad är aktivt"-checklist baserad på faktisk koppling.
- ✅ A2: `/keyword-universe` & `/segments` har riktiga sidor (`WorkspaceKeywordUniverse`, `WorkspaceSegments`) — inte `<ComingSoon>` längre.
- ✅ A3: Ads-scope visas redan på Översikt (var redan byggt).
- ✅ B4: Riktig SEO-kannibalisering — ny edge `ads-cannibalization` joinar GSC top-3 mot Ads search terms (30d), `PaidVsOrganic` visar tabell + potentiell besparing.

### Återstår
- ⬜ B5: Effektmätning i ActionTracker — visa `action_outcomes` per implementerad åtgärd (delta%).
- ⬜ B6: Automation rules UI i Settings (regeltyper: kpi_breach, audit_critical, auction_loss_pct).
- ⬜ B7: Schemalagda rapporter — cron + email leverans (kräver Resend-secret).
