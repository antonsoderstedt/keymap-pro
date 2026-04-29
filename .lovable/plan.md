# KEYMAP — Plan-status

## Fas 1 — KLART
Wizard, Keyword Universe, Briefs, Strategy, Ad drafts, Brand Kit, Artifacts, klientlista.

## Fas 2 — KLART
Workspace-layout, Google OAuth (GSC + GA4 + Ads), edge-funktioner, dashboards, KPI-mål, Alerts, Action Tracker, Audit, Ads-konto väljs per kund.

## Fas 3 — KLART

- ✅ A1: Översikt — "Vad är aktivt"-checklist.
- ✅ A2: `/keyword-universe` & `/segments` riktiga sidor.
- ✅ A3: Ads-scope-badge på Översikt.
- ✅ B4: SEO-kannibalisering (`ads-cannibalization`) i Paid vs Organic.
- ✅ B5: Effektmätning i ActionTracker (`ActionImpact`-komponent visar delta% per metric och fönster). Knapp "Mät effekt" triggar `measure-action-impact`.
- ✅ B6: Automation rules UI i Settings (`AutomationRules`-komponent — CRUD + toggle).
- ✅ B7: Schemalagda rapporter — `weekly-report` edge function + `pg_cron` jobb varje måndag 06:00, `measure-action-impact` varje natt 02:00. UI i Reports Library med "Kör nu" + KPI-snapshot.

### Bug-fixar
- ✅ Google Ads v21: `pageSize` borttaget från GAQL-anrop (PAGE_SIZE_NOT_SUPPORTED).
- ✅ Google Ads v21: `ads-fetch-auction-insights` förenklad till campaign-IS (UNRECOGNIZED_FIELD på `auction_insight_domain.*`).

## Nästa steg (frivilligt — Fas 4)
- Email-leverans av weekly-report (kräver Resend-domän + `RESEND_API_KEY`).
- Faktisk PPTX-rendering via `generate-presentation` för weekly-report.
- Auto-execution av automation rules (idag är de "suggest" / "alert" — `auto`-läget kräver Ads-mutation-stöd).
