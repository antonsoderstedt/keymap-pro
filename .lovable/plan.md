# KEYMAP 2.0 — Kundkonto + always-on dashboards + autonom optimeringsmotor

## Den stora omtanken

**Idag:** Wizard → engångsanalys → resultatsida.

**Nytt:** Varje kund är ett **permanent hem** ("Workspace") med always-on dashboards, brand-anpassade leveranser, performance-tracking, AI-alerts och en autonom optimeringsmotor som bevakar och föreslår actions löpande. Rapporter, audits och briefs blir versionerade artefakter inuti hemmet.

```text
Min byrå
├── Kund A (SkyltDirect SE)        ← permanent hem
│   ├── Översikt (Executive)
│   ├── GA4 / Google Ads / Bing / SEO / Paid vs Organic
│   ├── Sökordsuniversum
│   ├── Segment & paket
│   ├── Rapporter (Auction Insights, Konkurrent, Share of Voice…)
│   ├── SEO Audit (med checkbox-actions + uppföljning)
│   ├── Action Tracker (allt vi rekommenderat + status + effekt)
│   ├── Alerts & Optimeringar (AI:n bevakar dygnet runt)
│   ├── Brand Kit (logga, färger, typsnitt, tone of voice)
│   ├── Briefs & innehåll
│   ├── Strategi & roadmap
│   └── Inställningar (kopplingar, KPIer, mål)
└── Kund B (...)
```

---

## Tilläggen från denna runda

### 1. Brand-anpassade leveranser (Brand Kit per kund)

Varje workspace får en **Brand Kit-sektion** där man laddar upp/anger:
- **Logo** (färg + svart/vit + ikon-version)
- **Färgpalett** (primary, secondary, accent, success, warning + neutrals)
- **Typsnitt** (heading + body, ladda upp .ttf/.woff eller välj Google Font)
- **Tone of voice** (formell/casual/expert + språknyanser, exempel-meningar)
- **Bildstil** (referensbilder, ikon-stil)
- **Logotyp-placering & layout-mall** (preview hur en slide/PDF ser ut)

Allt som **exporteras eller genereras använder Brand Kit:et automatiskt**:
- PPTX-export → kundens logo i headern, färger i diagram, deras fonter
- PDF-rapporter → samma
- Content-briefs → tone-of-voice instruktion till AI
- Annonstext (Google Ads, Meta) → tone of voice-anpassad
- Landningssidor (HTML-spec) → färger + typsnitt
- E-postmallar för rapportleverans

Tekniskt: ny tabell `brand_kits(workspace_id, logo_url, palette_json, fonts_json, tone, layout_template)`. PPTX-mallar i `pptxgenjs` byggs dynamiskt från brand kit. AI-prompts injiceras med tone of voice + språkprofil.

---

### 2. Fler rapporttyper (rapport-bibliotek)

Sektionen "Rapporter" blir ett bibliotek där varje rapport är en typ man kan generera, schemalägga och spara historik på:

| Rapport | Källa | Frekvens |
|---|---|---|
| **Executive monthly** | Allt aggregerat | Månad |
| **Google Ads performance** | Ads | Vecka/månad |
| **SEO performance** | GSC + ranking | Månad |
| **Auction Insights** *(NY)* | Google Ads | Vecka |
| **Konkurrentrapport** *(NY)* | Semrush + Ads + GSC | Månad |
| **Share of Voice** *(NY)* | Semrush + Ads imp share | Månad |
| **Sökordsanalys (universum)** | DataForSEO + Semrush | On-demand |
| **Segmentrapport** | Egen analys | On-demand |
| **Content gap-rapport** *(NY)* | GSC + Semrush + AI | Kvartal |
| **Cannibalization-rapport (SEO)** *(NY)* | GSC | Månad |
| **Paid vs Organic-rapport** | Ads + GSC | Månad |
| **Bränd vs Non-brand** *(NY)* | Ads + GSC | Månad |
| **Lokal SEO/GBP-rapport** *(NY)* | (kräver GBP-koppling) | Månad |
| **YoY/MoM trendrapport** *(NY)* | Allt | Månad/år |
| **ROI/Attributionsrapport** *(NY)* | GA4 + Ads + (CRM) | Månad |
| **Kampanj-postmortem** *(NY)* | Ads | On-demand efter kampanj |

Alla rapporter:
- Genereras med kundens **Brand Kit**
- Sparas som artefakt med tidsstämpel
- Kan schemaläggas (cron) → mailas till kund automatiskt
- Live-preview i appen innan export
- Export PPTX / PDF / Notion / länk

---

### 3. Auction Insights (eget fokus eftersom du nämnde det)

Egen sektion under Google Ads-dashboarden + egen rapporttyp:
- **Konkurrent-tabell**: Impression Share, Overlap Rate, Position Above Rate, Top of Page Rate, Outranking Share — per konkurrent
- **Trendgraf**: din IS vs topp 5 konkurrenter över 90 d
- **Kampanj-uppdelning**: vilka kampanjer förlorar IS till vilka konkurrenter
- **Anomaly detection**: "Konkurrent X ökade IS med 40% den 18 april — möjligt nytt offensivt drag"
- **AI-insikter**: "Du tappar 'svetsning Stockholm' till X — höj bud med 12% eller skriv om annonsen för bättre QS"
- **Rekommendation per rad** → klick = blir en Action item

---

### 4. Performance-tracking på implementerade actions

Detta är kärnan i att verktyget **lär sig**.

Varje **Action Item** i Action Trackern kan markeras `implementerad` med tre fält:
- Datum
- Vad gjordes (fritext + valfri länk)
- **Baseline-mått** (snappas automatiskt vid markering: t.ex. position, klick, CTR, konverteringar för det specifika sökordet/kampanjen/sidan)

Sen kör en **nightly cron** (`measure-action-impact`) som:
1. Hämtar nya mätvärden 7/30/60/90 d efter implementering
2. Räknar ut delta + statistisk signifikans (enkel CI)
3. Visar i UI: "Implementerat 2026-04-01: Skrev om meta för /svetsning. Effekt 30 d: CTR +0.8% → +247 klick/mån. **Verifierat positiv**."
4. Sparar i `action_outcomes` så AI:n kan lära sig vilka typer av actions som faktiskt fungerar för denna kund

Vyer:
- **Action Tracker** får kolumn "Effekt" med trafikljus (grön/gul/röd) + delta-siffra
- Egen flik "Implementerade actions" som leaderboard (mest effektiva först)
- AI använder historik: "Förra gången jag föreslog 'rewrite meta' för dig gav det +18% CTR i snitt — så dessa 5 sidor är högsta prio"

Tabeller: `action_items`, `action_outcomes(action_id, measured_at, metric, value, delta, confidence)`.

---

### 5. AI-alerts & autonoma optimeringsförslag (Google Ads)

Ny sektion **"Alerts & Optimeringar"** + globala notiser (badge i sidebaren).

En cron-job (`ads-monitor`, kör 1×/dag) läser Google Ads-data och kör regler + AI på den. Den genererar **alerts av tre typer**:

#### A. Anomalier (auto-detekterade)
- Spend +30% mot 7d-snitt utan motsvarande conv-ökning
- CPA upp >50% på en kampanj
- Quality Score ramlar under 5 på top-10 sökord
- Impression Share Lost (Budget) >20% på lönsam kampanj
- Search term med 0 conv och spend >1000 kr senaste 30d
- Konverteringar = 0 senaste 7d på kampanj som tidigare konverterat
- Konkurrent ökar Impression Share kraftigt i Auction Insights

#### B. Optimeringsförslag (action-bara)
Varje förslag har **konkret action + förväntad effekt + en-klick-implementera (där möjligt)**:

| Förslag | Action | Effekt-estimat |
|---|---|---|
| "Pausa 12 sökord med 0 conv & spend >500 kr" | Pausa | Spara ~3 200 kr/mån |
| "Lägg till 47 nya negativa från search terms" | Lägg till | Spara ~1 800 kr/mån |
| "Höj budget på Kampanj X (begränsad av budget, ROAS 4.2)" | +20% budget | Förväntad +18 conv/mån |
| "Sänk bud på Kampanj Y (CPA 480 vs mål 250)" | -15% bud | Förväntad CPA-680 → 410 kr |
| "Skapa nytt segment 'kabelmarkering installatör' (260 söker, 0 ads)" | Skapa kampanj-skiss | Förväntad 18-25 nya konv/mån |
| "Aktivera DSA för upptäckt av nya konverterande termer" | Skapa kampanj | Hitta nya keywords |
| "Pausa annonser med CTR <0.5% i top 3 ad groups" | Pausa | Höj QS, sänk CPC |

#### C. KPI-bevakning
Per workspace sätter man **mål-KPIer** (t.ex. "ROAS ≥ 4", "CPA ≤ 250 kr", "Org klick +20% YoY"). Alerts triggas när man avviker från mål. Dashboard visar mål-progression.

#### Hur "agera" funkar
Två lägen:
1. **Förslag** (default): användaren godkänner, pushas till Google Ads via API
2. **Auto-pilot** (opt-in per regel/kampanj): vissa låg-risk-actions körs automatiskt (t.ex. "lägg till föreslagna negativa", "pausa sökord med 0 conv >2000 kr spend"). Kräver tydlig opt-in, allt loggas i Action Tracker som "auto-implementerat".

Tabeller: `alerts(workspace_id, type, severity, payload, status, suggested_action, expected_impact, created_at)`, `automation_rules(workspace_id, rule_type, threshold, mode)`.

---

### 6. SEO Audit med checkbox-actions + uppföljning

Egen sektion **"SEO Audit"** (lever, kan re-runnas).

Audit-kategorier (som pop-up checklist):
- **Teknisk**: Core Web Vitals, mobilvänlighet, indexering, robots.txt, sitemap, schema.org, https/redirects, broken links, dubbletter
- **On-page**: H1/meta saknas/dubbletter, thin content, intern länkning, alt-tags, sidor utan internal links
- **Innehåll**: Cannibalization (flera sidor på samma kw), content gaps, outdated content, low-CTR pages
- **Off-page**: Backlink-profil, toxic links, lost links, competitor gap
- **Lokalt** (om relevant): GBP-status, NAP-konsistens, citations
- **E-A-T**: Author bios, about-page, kontaktinfo, trust-signaler

Varje finding har:
- **Severity** (kritisk/hög/medium/låg)
- **Påverkan** (förväntad effekt om åtgärdat)
- **Hur fixar man** (steg + ev. kod-snippet/exempel)
- **Checkbox: Markera som åtgärdat** → snappar baseline → följer upp 30/60 d
- **Re-test**-knapp per item (kör om kontroll specifikt för det)
- **AI-förklaring**: "Varför är detta viktigt för just din business?"

Vyer:
- **Audit-dashboard** med health score 0-100 + trend
- **Filterbart** (severity, kategori, status: open/in progress/done)
- **Progress-bar** per kategori
- **Audit-historik**: kör ny full audit varje månad, jämför mot förra, visa "47 fixade, 12 nya, 8 regressioner"
- **Action items** integreras med Action Tracker → samma performance-mätning som ovan

Tekniskt: edge function `seo-audit-run` (använder Semrush Site Audit + GSC + egna kontroller via web-scrape + Lighthouse/PageSpeed Insights), sparas som `audit_runs(workspace_id, run_at, findings_json, score)` och `audit_findings(run_id, category, severity, status, baseline, outcome)`.

---

## Reviderad fasplanering (med tilläggen)

### Fas 1 — Strukturomvandling
- Workspaces / sidebar / artefakt-historik / Action Tracker (limmet)
- `analysis_jobs` + ProgressPanel
- Wizard blir onboarding, "Generera analys"-knapp i workspacet

### Fas 2 — Always-on dashboards + Brand Kit
- Executive, SEO, GA4, Paid vs Organic-dashboards (mockup-stil)
- **Brand Kit-sektion** (logo, palett, fonter, tone of voice)
- Brand Kit appliceras på alla exporter & AI-prompts
- Action Tracker med basic baseline-snap

### Fas 3 — Google Ads + AI-motor
- Google Ads-koppling + dashboard
- **Auction Insights** (vy + rapport)
- **Alerts-motor** (cron `ads-monitor`) med anomalier + optimeringsförslag
- **One-click implementera** för låg-risk-actions
- **Auto-pilot** (opt-in) för specifika regler
- Company Brain-kontext till alla AI-anrop

### Fas 4 — SEO Audit + Performance-tracking
- **SEO Audit** med checkbox-actions
- `measure-action-impact` cron — 7/30/60/90 d effektmätning
- Implementerade actions-leaderboard
- AI lär sig av historik

### Fas 5 — Rapportbibliotek + automation
- Alla rapporttyper (Auction Insights, Konkurrent, SoV, Cannibalization, ROI, etc.)
- Schemaläggning + e-postutskick (med Brand Kit)
- Live-preview av exporter (PPTX/PDF/Notion-länk)
- Konkurrentanalys-sektion
- Bing-dashboard (om kopplat)

---

## Tekniskt sammanfattat (additioner)

**Nya tabeller:** `brand_kits`, `alerts`, `automation_rules`, `audit_runs`, `audit_findings`, `action_outcomes`, `report_schedules`, `report_history`, `kpi_targets`.

**Nya edge functions:**
- `ads-monitor` (daglig cron, anomalier + förslag)
- `ads-apply-action` (push godkända actions till Google Ads API)
- `seo-audit-run`
- `measure-action-impact` (nightly cron)
- `auction-insights-fetch`
- `report-generate` (parametriserad: typ + workspace + brand kit)
- `report-schedule-runner` (cron, läser `report_schedules`, mailar)

**Cron-jobb (pg_cron):**
- `ads-monitor` 06:00 dagligen
- `measure-action-impact` 03:00 dagligen
- `dashboard-refresh` 04:00 dagligen
- `report-schedule-runner` 07:00 dagligen
- `seo-audit-monthly` 1:a varje månad

**Nya integrations som krävs:**
- Google Ads API (developer token — du nämnde du saknar) → Fas 3
- PageSpeed Insights API (gratis, för audit) → Fas 4
- (valfritt) Google Business Profile API för lokalt → Fas 5
- Resend eller liknande för e-postutskick av schemalagda rapporter → Fas 5

---

## Sammanfattat — vad du får

1. Kunden = permanent hem med 12+ levande dashboards
2. **Brand Kit** → allt som lämnar verktyget är kundanpassat
3. **Rapportbibliotek** med 16 rapporttyper inkl. **Auction Insights, Konkurrent, SoV, Cannibalization, ROI**
4. **Performance-tracking** på allt vi rekommenderar — verktyget lär sig av sina egna förslag
5. **AI-alerts** på Google Ads med konkreta åtgärder, **one-click implementera** + opt-in **auto-pilot**
6. **SEO Audit** med checkbox-actions + automatisk uppföljning av effekt
7. **KPI-bevakning** — sätt mål, få notiser när du avviker

---

## Innan vi sätter igång — tre snabba val

1. **Migration av befintlig data** — (a) auto-migrera ditt nuvarande projekt till första kunden eller (b) börja om rent?
2. **Auto-pilot för Google Ads** — vill du ha det som funktion (kräver tydlig opt-in per regel) eller bara förslag som användaren själv klickar igenom?
3. **E-postleverans av schemalagda rapporter** — använda Resend (rekommenderas, finns färdig connector) från start eller vänta?

Säg ditt val på 1–3 så drar jag igång Fas 1 direkt efter ok.