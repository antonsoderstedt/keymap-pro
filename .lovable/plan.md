# Plan: Fixa onboarding-blocket + förenkla mål och baseline

## Problem
1. **Kom igång-blocket** kan inte minimeras och tar över hela Översikt-sidan, även när 6/7 är klara.
2. **Skapa baseline-snapshot** länkar till `/performance` men där finns ingen knapp för att trigga den — `baseline-snapshot` edge-funktionen är en cron som körs veckovis automatiskt, helt osynlig för användaren.
3. **Sätt KPI-mål** är abstrakt: målmåtten ("% sökord i topp 10", "snittposition") är otydliga och utan vägledning vet man inte vilket värde som är rimligt.

## Lösning

### 1. Kollapsbar OnboardingChecklist (`src/components/workspace/OnboardingChecklist.tsx`)
- Lägg till lokalt `collapsed`-state, persisterat i `localStorage` per projekt-id (`onboarding-collapsed:{projectId}`).
- När `doneCount >= total - 1` (nästan klar) → starta i kollapsat läge automatiskt.
- Header får en chevron-knapp (▾/▸) för att fälla in/ut.
- Kollapsat läge visar bara en kompakt rad: "Kom igång — 6/7 klara · 86%" + chevron, ingen lista.

### 2. Manuell baseline-trigger på Performance-sidan (`src/pages/workspace/PerformanceTracker.tsx`)
- Lägg till en "Skapa baseline-snapshot nu"-knapp i header (intill "Hämta historik").
- Knappen anropar `supabase.functions.invoke("baseline-snapshot")` och visar toast.
- Visa senaste baseline-datum som badge om det finns (`project_baselines` query).
- Om ingen GSC/GA4 är kopplad → disabled + tooltip "Koppla minst en datakälla först".

Detta gör att checklistans baseline-steg blir aktivt: när användaren landar på `/performance` ser de en tydlig knapp.

### 3. Smarta målförslag i `GoalsProgress` (`src/components/workspace/GoalsProgress.tsx`)
Gör målssättning konkret och relaterbar:

- **Förenkla mått-listan** med inline-beskrivning:
  - "Organiska klick / månad" → *"Hur många klick från Google ni vill ha per månad. Vanlig start: 2× nuläget."*
  - "Snittposition" → *"Genomsnittlig ranking. Lägre = bättre. 1–10 = första sidan."*
  - "% sökord i topp 10" → *"Hur stor andel av era sökord som ligger på Googles första sida."*
  - "Antal sökord i topp 20" → *"Antal sökord på sida 1–2."*

- **Smart förslag-knapp** "Föreslå rimligt mål" — beräknar baserat på `kpisCurrent` (skickas in som ny prop från PerformanceTracker):
  - clicks: `Math.round(current.clicks * 1.5)` (50% tillväxt)
  - position: `Math.max(1, Math.floor(current.position - 3))`
  - top10_share: `Math.min(100, Math.round(current.topTenShare * 100 + 15))`
  - top20_count: `current count + 20`
- Visa nuläge under input: *"Ni ligger på X idag — föreslaget mål: Y"*.

### 4. Justera onboarding-stegens text
I `OnboardingChecklist.tsx`, gör KPI-mål-steget tydligare:
- Label: "Sätt minst ett KPI-mål"
- Desc: "Välj t.ex. 'Organiska klick / månad' — vi föreslår ett rimligt värde baserat på er trafik."

Och baseline-steget:
- Desc: "Frys nuläget — klicka 'Skapa baseline-snapshot' på Performance-sidan."

## Tekniska detaljer

**Filer som ändras:**
- `src/components/workspace/OnboardingChecklist.tsx` — collapse-state + localStorage + uppdaterad text
- `src/pages/workspace/PerformanceTracker.tsx` — baseline-knapp + senaste-baseline-badge + skicka `kpisCurrent` till `GoalsProgress`
- `src/components/workspace/GoalsProgress.tsx` — smart förslag, beskrivningar, "nuläge"-text
- `src/lib/performance.ts` — eventuell exponering av suggester-helper (alternativt inline i GoalsProgress)

**Inga DB-ändringar krävs** — `project_baselines` finns redan, `baseline-snapshot`-funktionen finns redan, `kpi_targets` finns redan.

## Resultat
- Översikt blir mindre tung när onboarding nästan är klar.
- Baseline-steget är klickbart och självförklarande.
- KPI-mål känns hanterbart: ett klick på "Föreslå" ger ett vettigt startvärde och man ser sitt nuläge.