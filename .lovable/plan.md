
# Sprint 1 — "Värdet syns i kronor"

Mål: Förvandla KEYMAP från ett dashboard-verktyg till en tjänst som varje vecka levererar ett mätbart kronvärde per kund. Byggs byrå-first (multi-client tänk i grunden), ingen Stripe ännu.

## Vad användaren får efter sprinten

1. **Kronvärde överallt** — varje sökord, sida, action och annons visar `€-impact/år` baserat på riktig data
2. **"Top opportunities"-vy per kund** — sorterad på kronor, inte volym
3. **Weekly Strategy Briefing** — varje måndag morgon: en 1-sidig AI-genererad brief per kund med top 3 vinster, top 3 risker, top 3 actions denna vecka — alla med €-värde
4. **Briefing levereras i app + som nedladdningsbar PDF** (email i Sprint 1.5 om byrå-domän finns)
5. **Byrå-cockpit (v1)** — `/clients`-sidan får en kolumn: "Veckans värde att hämta hem" per kund

---

## Teknisk plan

### 1. Revenue-modul (delad logik)

Ny fil: `src/lib/revenue.ts`
- `estimateKeywordValue({ volume, position, ctrCurve, conversionRate, avgOrderValue })` → kr/år
- `estimatePositionUplift({ from, to, volume, cr, aov })` → kr/år potential
- `estimateAdsWaste({ spend, conversions, roas, targetRoas })` → kr/mån att spara
- `estimatePagePotential(gscRows, ga4ConvRate, aov)` → totalt kr/år
- CTR-kurva per position (defaults från Sistrix/Advanced Web Ranking 2024)

Ny tabell: `project_revenue_settings`
- `project_id` (uniq), `avg_order_value` (numeric, default 1000), `conversion_rate_pct` (numeric, default 2.0), `currency` (default 'SEK'), `gross_margin_pct` (default 100)
- RLS: ägaren av project_id

UI: Settings → ny sektion "Affärsvärden" där man sätter AOV, CR och marginal per kund. Tooltip: "Detta används för att räkna ut kronvärde på alla insikter."

### 2. €-kolumner i befintliga vyer

- **Workspace Keyword Universe**: ny kolumn `Värde/år` + sortering default på den
- **SEO Dashboard**: ny KPI-kort "Top 10-positioner värda" + "Potential vid pos 1-3"
- **Paid vs Organic**: visa €-värde av SEO-trafik vs Ads-spend (riktigt ROI-jämförelse)
- **Action Tracker**: varje action får `expected_impact_sek` (auto-räknat när action skapas från en GSC/Ads-källa)
- **Alerts**: severity sorteras på €-impact, inte bara metric-delta

### 3. Weekly Strategy Briefing

Ny edge function: `supabase/functions/weekly-briefing/index.ts`
- Input: `{ project_id, week_start? }`
- Hämtar: senaste GSC, GA4, Ads, alerts, action_outcomes, audit_findings (senaste 7 dagar + 28 dagar baseline)
- Räknar: top 3 vinster (`outcome.delta_pct > 0`, sorterat på €), top 3 risker (alerts + position-tapp + ads-waste sorterat på €), top 3 rekommenderade actions (från opportunities + audit_findings sorterat på potential €)
- Skickar allt till Lovable AI (`google/gemini-2.5-pro`) med en strikt prompt: "Skriv som en senior digital strateg på svenska, 1 sida, koncisa motiveringar, alltid med kronvärde"
- Sparar resultat i ny tabell `weekly_briefings`:
  - `id`, `project_id`, `week_start` (date), `summary_md` (text), `wins jsonb`, `risks jsonb`, `actions jsonb`, `total_value_at_stake_sek` (numeric), `created_at`
  - Unique på `(project_id, week_start)`
  - RLS: ägaren av project_id

Ersätter inte `weekly-report` — den fortsätter köra som teknisk snapshot. `weekly-briefing` är det strategiska lagret ovanpå.

Cron: schemalägg `weekly-briefing` att köra varje måndag 05:30 (innan befintlig `weekly-report` kl 06:00). Använd `pg_cron` + `pg_net` (redan aktiverat). Skapas via insert-tool eftersom det innehåller projektspecifik URL + anon key.

### 4. UI för briefingen

Ny sida: `src/pages/workspace/WeeklyBriefing.tsx` på rutten `/clients/:id/briefing`
- Vecko-väljare (senaste 12 veckor)
- Hero-kort: "Värde att hämta hem denna vecka: 84 200 kr"
- 3 kolumner: Vinster | Risker | Actions — varje rad med €-tag, källa-länk
- "Generera ny" + "Ladda ner PDF"-knappar
- "Skicka som email" — disabled med tooltip "Aktiveras när byrå-domän är konfigurerad" (Sprint 1.5)

PDF: enkel client-side render via `react-to-print` eller server-side via befintlig `generate-presentation` (utvärderas, default på client-side för snabb leverans).

Sidebar: lägg till "Veckans briefing" i sektion "Översikt", direkt under Executive.

Executive Dashboard får ett toppband: "Senaste briefing — [datum] — Värde att hämta: X kr — [Öppna]"

### 5. Byrå-cockpit v1

`src/pages/Clients.tsx` (klientlistan) får ny kolumn per kund:
- "Veckans värde" — hämtas från senaste `weekly_briefings.total_value_at_stake_sek`
- Färgkod: röd >100k, gul 20-100k, grön <20k (= allt under kontroll)
- Sortering på kolumnen

Detta är fröet till multi-client cockpit som byggs ut i Sprint 3.

### 6. Backfill & onboarding

- Migration sätter default `project_revenue_settings` för alla befintliga projekt (AOV 1000, CR 2%) så €-värden visas direkt
- Banner i Settings första gången: "Sätt riktiga affärsvärden för att få exakta kronvärden"
- "Generera briefing nu"-knapp på briefing-sidan om ingen finns för aktuell vecka

---

## Filer som skapas/ändras

**Nya filer:**
- `src/lib/revenue.ts` — beräkningsmodul
- `src/pages/workspace/WeeklyBriefing.tsx` — UI
- `src/components/workspace/RevenueSettings.tsx` — settings-sektion
- `src/components/workspace/BriefingCard.tsx` — återanvändbart kort
- `supabase/functions/weekly-briefing/index.ts` — edge fn
- `supabase/migrations/...` — ny tabell `weekly_briefings` + `project_revenue_settings`

**Ändras:**
- `src/App.tsx` — ny route
- `src/components/workspace/WorkspaceSidebar.tsx` — ny nav-länk
- `src/pages/workspace/ExecutiveDashboard.tsx` — briefing-band
- `src/pages/workspace/WorkspaceKeywordUniverse.tsx` — €-kolumn
- `src/pages/workspace/SeoDashboard.tsx` — €-KPI-kort
- `src/pages/workspace/PaidVsOrganic.tsx` — €-jämförelse
- `src/pages/workspace/ActionTracker.tsx` — `expected_impact_sek`
- `src/pages/workspace/WorkspaceSettings.tsx` — RevenueSettings-sektion
- `src/pages/Clients.tsx` — byrå-kolumn
- `.lovable/plan.md` — uppdateras

---

## Risker & antaganden

- **AOV/CR är initialt gissningar** — kommunicerar tydligt i UI med tooltip + tydlig "preliminärt"-tag tills användaren satt riktiga värden
- **Lovable AI-kostnad** — Gemini 2.5 Pro per kund/vecka är försumbart (~$0.05/kund/månad)
- **CTR-kurva varierar per bransch** — använder en konservativ default; senare kan vi finkalibrera per `customers.industry`
- **Email-leverans skjuts till Sprint 1.5** — kräver att byrån sätter upp en sender-domän (Lovable Emails), vilket är en separat onboarding

---

## Vad som INTE ingår i Sprint 1 (medvetet)

- Stripe / paywall (väntar enligt ditt val)
- Email-utskick av briefing (kräver sender-domän — kort separat steg sen)
- SERP/Competitor Radar (Sprint 2)
- Forecast Planner (Sprint 2)
- White-label rapporter, klientportal, auto-execution (Sprint 3)

---

## Klart när

- [ ] €-värde syns på keywords, pages, actions, alerts
- [ ] Settings → Affärsvärden fungerar och sparar
- [ ] Manuell "Generera briefing"-knapp funkar och producerar en briefing på <30 sek
- [ ] Cron schemalagd och kör varje måndag 05:30
- [ ] Briefing-sidan visar wins/risks/actions med €-tags
- [ ] Klientlistan visar "Veckans värde" per kund
- [ ] PDF-export av briefing fungerar
- [ ] Befintlig `weekly-report` påverkas inte
