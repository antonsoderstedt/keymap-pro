# KEYMAP — Plan-status

## Fas 1–3 — KLART
Wizard, workspace, Google-integrationer, dashboards, KPI-mål, alerts, action tracker, audit, automation rules, weekly-report, ads-cannibalization.

## Sprint 1 (Premium) — KLART
Mål: värdet syns i kronor, AI-strateg varje vecka.

- ✅ `project_revenue_settings`-tabell + UI i Settings (AOV, CR, marginal)
- ✅ `src/lib/revenue.ts` — CTR-kurva, kronvärde-beräkningar, formatSEK
- ✅ `weekly_briefings`-tabell (RLS, unique per vecka/projekt)
- ✅ `weekly-briefing` edge function — Lovable AI (Gemini 2.5 Pro), wins/risks/actions med €
- ✅ `/clients/:id/briefing` — sida med hero-värde, AI-text, 3 kolumner, PDF-print
- ✅ Sidebar: "Veckans briefing" (premium-badge)
- ✅ Executive Dashboard: briefing-band överst med totalvärde
- ✅ Klientlistan: "Veckans värde" per kund med färgkod
- ✅ `action_items.expected_impact_sek` kolumn tillagd

## Sprint 1.5 (kvar att göra om önskat)
- Cron schedule för `weekly-briefing` varje måndag 05:30 (kräver supabase--insert med projektspecifik URL)
- €-kolumner i Keyword Universe-tabell, SEO Dashboard KPI-kort, Paid vs Organic ROI-jämförelse
- Email-leverans av briefing (kräver sender-domän)

## Sprint 2 (planerad)
SERP/Competitor Radar + Forecast Planner.

## Sprint 3 (planerad)
White-label, klientportal, Stripe-paketering, auto-execution.
