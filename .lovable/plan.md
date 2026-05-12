
## Mål

Bygga en pedagogisk, visuell guide-sida som förklarar hur projekt, datakällor, sökordsuniversum, SEO/Ads-motorer, briefing och åtgärder hänger ihop — så att användaren förstår ordningen, vad som påverkar vad, och vad som uppdateras automatiskt.

## Placering

- Ny route: `/clients/:id/how-it-works`
- Ny sidebar-post i `WorkspaceSidebar.tsx` direkt **under "Inställningar"** med ikon `HelpCircle` och label **"Så fungerar det"**.
- Lägg också en länk-kort högst upp i `WorkspaceSettings.tsx` ("Ny här? Läs guiden →") så att den hittas från Inställningar.
- Registrera route i `src/App.tsx` inom workspace-layouten.

## Sidans struktur (en lång scrollvy, inga tabs)

Designen följer dark theme + lime-accent. Semantiska tokens, JetBrains Mono för data, Playfair för rubriker. Animerade element via framer-motion (redan i projektet). Ikoner från lucide-react.

```text
┌──────────────────────────────────────────────────────────┐
│ HERO                                                     │
│  H1 "Så fungerar Slay Station"                           │
│  Lead: 1 mening + två chips (5 min läsning · uppdaterad) │
│  Animerad bakgrund (lime glow)                           │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 1 — Översikt i 30 sekunder                       │
│  3 kort i rad: Samla data → Förstå → Agera               │
│  Varje kort: ikon, 1 mening, lime pil mellan korten      │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 2 — Hela flödet (interaktivt diagram)            │
│  SVG flowchart byggd inline (ej extern lib):             │
│    Projekt → Datakällor + Sökord/Universum               │
│      → Datalager → SEO-motor + Ads-motor                 │
│      → Briefing/Rapporter → Action Tracker → loop        │
│  Hover på nod ⇒ tooltip med kort förklaring              │
│  Aktiva noder lime, vilande border-muted                 │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 3 — Steg för steg (numrerad timeline)            │
│  Vertikal timeline med 5 steg, bild/illustration per steg│
│  1. Skapa projekt & sätt mål                             │
│  2. Koppla GA4, Search Console, Google Ads               │
│  3. Generera sökordsuniversum (Lite/Max/Ultra)           │
│  4. Läs SEO-dashboard & Ads Audit                        │
│  5. Följ Veckobriefing → Action Tracker                  │
│  Varje steg: "Gör nu →"-knapp som länkar rätt rutt       │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 4 — Vilken motor använder vilken data?           │
│  Matrix-tabell med ikoner och pilar                      │
│  Rader: SEO-motor, Ads-motor, Briefing, Pre-launch       │
│  Kolumner: GA4, GSC, Ads, Universum, Mål                 │
│  Fyllda lime-prickar vs tomma cirklar                    │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 5 — Korsbefruktning (3 visuella kort)            │
│  Pil-illustrationer:                                     │
│   • Universum → Ads (negativ-listor, intent)             │
│   • Ads → SEO (höga CPC = SEO-möjlighet)                 │
│   • GA4 → båda (estimated_value_sek)                     │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 6 — Vad uppdateras automatiskt?                  │
│  4 status-kort med pulsande dot:                         │
│   GA4/GSC/Ads · Diagnoser · Universum (manuell) · Action │
│  Kort förklaring + intervall                             │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 7 — Status för DETTA projekt                     │
│  Live checklist (läser useProjectCapabilities):          │
│   ✓ GA4 kopplat   ✓ GSC kopplat   ⚠ Ads ej kopplat       │
│   ✓ Universum genererat (ultra · 1412 sökord)            │
│  Knappar för att åtgärda det som saknas                  │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ SEKTION 8 — FAQ (Accordion)                              │
│  • Måste jag köra Ultra först?                           │
│  • Vad händer om en datakälla blir inaktuell?            │
│  • Hur räknas estimated_value_sek?                       │
│  • Kan Ads och SEO köras separat?                        │
│  • Hur ofta hämtas ny data?                              │
└──────────────────────────────────────────────────────────┘
```

## Tekniska detaljer

**Filer som skapas:**
- `src/pages/workspace/HowItWorks.tsx` — sidkomponent
- `src/components/howitworks/FlowDiagram.tsx` — inline SVG-flowchart (responsiv, hover-tooltips, ingen mermaid runtime)
- `src/components/howitworks/StepTimeline.tsx` — numrerad timeline med "Gör nu"-länkar
- `src/components/howitworks/DataMatrix.tsx` — motor × datakälla-matris
- `src/components/howitworks/ProjectStatusChecklist.tsx` — läser `useProjectCapabilities` + analyses-tabellen för att visa konkret status
- `src/components/howitworks/CrossPollinationCards.tsx` — 3 kort med SVG-pilar

**Filer som ändras:**
- `src/components/workspace/WorkspaceSidebar.tsx` — lägg till `{ to: \`${base}/how-it-works\`, label: "Så fungerar det", icon: HelpCircle }` direkt efter Inställningar.
- `src/components/workspace/MobileWorkspaceSidebar.tsx` — samma post för mobilmenyn.
- `src/App.tsx` — registrera route `<Route path="how-it-works" element={<HowItWorks />} />`.
- `src/pages/workspace/WorkspaceSettings.tsx` — lägg in ett kort högst upp: "Ny här? Läs guiden 'Så fungerar det' →".

**Visuella ingredienser (allt via Tailwind + inline SVG, inga nya beroenden):**
- Diagrammen ritas som inline `<svg>` med `<path>` för pilar (animerade `stroke-dashoffset`).
- Bilder/illustrationer: 2–3 enkla AI-genererade hjältebilder (lime/dark stil) sparade i `src/assets/howitworks/` för Hero och steg 1/3/5. Använder `imagegen--generate_image` (fast tier).
- Ingen ny data; status-checklistan återanvänder befintliga hooks (`useProjectCapabilities`, `useWorkspaceAnalysis`).

**Innehåll:**
- All copy på svenska, kort och pedagogisk.
- Tydlig terminologi-ruta som översätter "snapshot", "diagnostik", "kluster", "intent" etc.

## Avgränsningar

- Endast frontend/presentation. Ingen DB-migration, inga edge functions.
- Ingen redigerbar guide (statisk innehållskälla i komponenten — kan flyttas till MDX senare om så önskas).
- Inga nya beroenden.
