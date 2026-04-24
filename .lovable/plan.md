## Min ärliga bedömning av verktyget idag

Efter att ha gått igenom Dashboard, Results, KeywordUniverse och tillhörande tabbar — du har helt rätt. Verktyget är **funktionsrikt men opedagogiskt**. Konkreta problem:

**1. Två parallella resultatvyer som överlappar.** `/results` och `/results/universe` visar i praktiken samma sak (segment, sökord, ads) men i olika strukturer. Användaren förstår inte vilken som är "den riktiga". Resultatet: man hoppar fram och tillbaka och tappar kontext.

**2. Tab-överbelastning.** Universe-sidan har **10 tabbar** (Universe, Prioriterade, SEO, Ads, Content, Lokal, Negativa, Briefs, Teknisk SEO, Strategi) i en enda rad. Resultat-sidan har 6. Det finns ingen visuell hierarki som säger "börja här".

**3. Allt är tabeller.** Inget enda diagram, ingen visuell sammanfattning. För ett analysverktyg är det dödfött — användaren får inga "aha"-ögonblick.

**4. Designsystemet är inkonsekvent.** Mörk bakgrunn + lime accent + serif-rubriker + JetBrains Mono överallt ger en "terminal/brutalist"-känsla som krockar med behovet av tydlig dataredovisning. Korten är platta, knapparna små (`size="sm"` överallt), badges används slumpmässigt.

**5. Ingen "story".** En analys borde berätta: *Här är din marknad → här är dina segment → här är dina möjligheter → här är actions*. Idag är det 16 tabbar utan röd tråd.

**6. Ingen presentationsexport.** Användaren får CSV — användbart för Excel, värdelöst för att presentera för en kund/chef.

**7. Headern säger inte vad man ska göra härnäst.** Inga CTA:er som leder framåt.

---

## Föreslagen plan: omtag i 4 steg

### Steg 1 — Nytt designsystem (modern SaaS-look)

Behåll mörkt tema som default men ge det luft och hierarki. Ny palett som funkar för datavisualisering:

```
Bakgrund:      slate-950 (#0A0F1C)  – djupare, mindre brunt
Surface:       slate-900 (#0F172A)
Card:          slate-800/60 med border slate-700
Primary:       indigo-500 (#6366F1) – professionell, inte neongrön
Accent:        emerald-400 för positiva siffror
Warning:       amber-400
Danger:        rose-500
Text:          slate-100 / slate-400 (muted)

Charts:        7-färgs-palett (indigo, emerald, amber, rose, cyan, violet, fuchsia)
```

Typografi: byt från Playfair + JetBrains Mono till **Inter** för UI och **Inter Tight** för rubriker. Mono behålls bara för tabelldata. Större body-text (14→15px), större rubriker, mer luft (px-8, py-6).

Komponenter som uppgraderas: Card (subtil gradient, mjukare radius `rounded-xl`), Badge (med ikoner), Stat-card (stort tal + delta + sparkline), Button (default `size="default"`, inte `sm`).

### Steg 2 — Konsolidera till en resultatvy med tydlig story

Slå ihop `/results` och `/results/universe` till **en** sida `/project/:id/results` med 5 sektioner i pedagogisk ordning (vänster sidomeny istället för tab-rad):

```text
┌─────────────────────────────────────────────────────────┐
│ HEADER: Projektnamn + KPI-rad + [Exportera presentation]│
├──────────┬──────────────────────────────────────────────┤
│ 1 Översikt│  Hero-KPIs · Segment-donut · Volym/intent   │
│ 2 Segment │  Snygga kort med score, charts, top-keywords│
│ 3 Sökord  │  Universe-tabell + filter (dagens vy)       │
│ 4 Kanaler │  SEO / Ads / Content / Lokal som flikar HÄR │
│ 5 Action  │  Strategi + Briefs + Teknisk SEO + QuickWins│
└──────────┴──────────────────────────────────────────────┘
```

Varje sektion börjar med en **1-rads förklaring** ("Det här ser du här") och **vad du ska göra med den**.

### Steg 3 — Visualiseringar (det som saknas mest)

Lägg till med `recharts` (redan installerat via shadcn chart):

- **Översikt:** 4 stora KPI-kort (totala sökord, total månadsvolym, snitt-CPC, antal prioriterade), donut över intent-fördelning, bar chart över segment efter opportunity score, treemap över kluster efter volym.
- **Segment-vy:** varje segment-kort får en mini sparkline + radar chart över hur de söker (info/kommersiell/transaktionell/navigations).
- **Kanaler:** stacked bar (volym per kanal × intent), scatter (volym vs KD) för att hitta easy wins.
- **Strategi:** budget pie, launch-timeline (Gantt-liknande).

### Steg 4 — Presentation export (.pptx)

Ny knapp "Exportera presentation" → backend edge function `export-presentation` som genererar en .pptx via `pptxgenjs` med en fast story-ordning:

```text
Slide 1  Titel + projekt + datum
Slide 2  Executive summary (AI-genererad)
Slide 3  Marknadens storlek & nyckeltal (KPIs)
Slide 4  Intent-fördelning (donut)
Slide 5+ Ett slide per segment (score, top-keywords, insight)
Slide N  Topp 10 prioriterade sökord
Slide N+1 SEO-möjligheter (kanal-vy)
Slide N+2 Google Ads-rekommendationer + budget
Slide N+3 Content-plan / briefs
Slide N+4 Lokal SEO (om relevant)
Slide N+5 Quick Wins (3-5 st)
Slide N+6 Strategi-roadmap (faser/veckor)
Slide N+7 Risker & nästa steg
```

Stil: matchar nya designsystemet (mörka rubrikslides, ljusa innehållsslides, indigo accent, Inter-font). Diagram renderas som bilder via en headless chart-render i edgen ELLER så bygger vi diagrammen direkt med pptxgenjs inbyggda chart-API (enklare, native i PowerPoint).

---

## Vad jag levererar i nästa steg (när du godkänt)

1. Nytt `index.css` + `tailwind.config.ts` med ny palett, fonter, tokens.
2. Ny komponent `ScrollSection`/`SidebarNav` för den nya layouten + `KpiCard`, `ChartCard`.
3. Refaktorerad `Results.tsx` med 5-sektions-layout, sidomeny, charts (recharts).
4. `KeywordUniverse.tsx` mergas in som "Sökord" + "Kanaler"-sektioner; gamla rutten redirectar.
5. Edge function `export-presentation` + npm-paket `pptxgenjs`, knapp i header som triggar nedladdning.
6. Liten "Onboarding/Empty-state"-polering: varje sektion får en hjälptext + CTA om data saknas.

Behåller all befintlig backend-logik, datamodeller och edge functions. Det är rent UI/UX + en ny export-funktion.

---

## Frågor innan jag börjar

- **Mörkt tema som default ok?** (Jag föreslår ja men med möjlighet till ljust senare.)
- **Vill du behålla Playfair-rubriker** för "premium"-känsla eller helt byta till Inter Tight (mer modernt SaaS)?
- **Presentationen** — föredrar du `.pptx` (redigerbar i PowerPoint/Keynote) eller `.pdf` (lås layout)? Jag föreslår .pptx.
