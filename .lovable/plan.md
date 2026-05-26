# Plan — Rensa upp Sökord-hubben

## Diagnos

`KeywordsHub.tsx` (`/clients/:id/keywords`) har 6 tabbar, men **Översikt-tabben är överlastad** och fungerar idag som "allt i en". Den renderar i denna ordning:

1. `SeoDiagnosisPanel` — lång diagnoslista (det användaren ser först)
2. `OverviewSection` — KPI:er, grafer, sammanfattning
3. Quick wins-grid
4. `ClusterActionsTab` — ännu en lång lista med klusteråtgärder

Resultatet: man landar mitt i en diagnoslista, måste scrolla förbi den för att hitta översikten, och sen forsätter sidan i evighet med två till sektioner som egentligen är *åtgärder*, inte översikt.

Övriga tabbar (Sökord / Briefs / Strategi / Teknisk SEO / Ads-export) är OK i sig — problemet är **vad som ligger i Översikt och i vilken ordning**, plus att tabbraden har 6 jämnstora tabs utan visuell hierarki.

## Mål

- Översikten ska vara *översikt* — KPI:er + sammanfattning + en handfull "vad nu?"-kort. Inte en arbetsyta.
- Inga sidor som scrollar mer än ~2 skärmar utan en tydlig ankarpunkt.
- Diagnos och klusteråtgärder flyttas till egna tabbar där de hör hemma (de är arbetsytor).
- Visuell hierarki i tabbraden så ögat hittar primärflödet direkt.

## Ny tabb-struktur

Från 6 → 6 tabbar men **omgrupperade**:

```
[Översikt] [Sökord] [Kluster] [Diagnos] | [Briefs] [Strategi] [Teknisk SEO] [Ads-export]
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   Primära (data + arbete)                 Output (kräver full analys)
```

En tunn separator/grupplabel i `TabsList` skiljer "data" från "output" så de 8 inte ser likvärdiga ut.

## Innehåll per tabb (efter omflytt)

**Översikt** (kort, scannbar — max ~1.5 skärm)
- StatCards (finns redan ovanför tabbarna — behåll)
- `OverviewSection` (KPI:er + grafer + sammanfattning)
- Quick wins-grid (max 4 kort, "Visa alla →" länkar till Sökord-tabben filtrerad på `priority=high`)
- *Borttaget:* SeoDiagnosisPanel, ClusterActionsTab

**Sökord** (oförändrad — den interna sub-tabben Universe/Prioriterade/SEO/Ads/Content/Lokal/Negativa fungerar)

**Kluster** (NY tabb)
- `ClusterActionsTab` flyttas hit i sin helhet
- Får andas: egen tabb, egen rubrik, egen sök/sortering (redan inbyggt)

**Diagnos** (NY tabb)
- `SeoDiagnosisPanel` flyttas hit
- Hör inte hemma på Översikt — det är en arbetslista, inte en sammanfattning

**Briefs / Strategi / Teknisk SEO / Ads-export** — oförändrade

## Visuell hierarki i tabbraden

- Primära tabbar (Översikt, Sökord, Kluster, Diagnos) får full vikt
- Output-tabbar (Briefs, Strategi, Teknisk SEO, Ads-export) får en subtil avgränsare (`<div className="w-px h-6 bg-border mx-1" />`) före sig så ögat ser grupperingen
- Tabbar med `disabled={!analysisId}` behåller sin grå-out

## Quick win-kortbegränsning

Idag renderas *alla* quick wins (kan vara 10+). Begränsa till 4 + "Visa alla N quick wins →"-knapp som sätter `tab="keywords"` + sub-tab `priority` och filtrerar `priority=high`. Resten av flödet bryts inte.

## Filer som ändras

- `src/pages/workspace/KeywordsHub.tsx` — enda filen som rörs
  - Lägg till `"clusters"` och `"diagnosis"` som tab-värden
  - Flytta `<SeoDiagnosisPanel>` och `<ClusterActionsTab>` ur Översikt-`TabsContent` till egna `TabsContent`
  - Lägg till separator + ikon i `TabsList`
  - Begränsa quick wins-rendering till 4 med "Visa alla"-länk
  - Inga ändringar i underliggande komponenter (`SeoDiagnosisPanel`, `ClusterActionsTab`, `OverviewSection`)

## Det här rör vi INTE

- Ingen logik, ingen datahämtning, inga lib-funktioner
- Inga ändringar i sidomeny (`workspaceRoutes.ts`) — fortfarande en `Sökord`-post
- Inga andra workspace-sidor

## Acceptanskriterier

1. Översikt-tabben passar i ~1.5 skärm på 1280×900 utan att man når Quick wins via scroll-into-view-tricks
2. Diagnoslistan syns *inte* förrän man klickar på Diagnos-tabben
3. Klusteråtgärder syns *inte* förrän man klickar på Kluster-tabben
4. Quick wins-sektionen visar max 4 kort + länk till fullständig lista
5. De 8 tabbarna har tydlig visuell gruppering (4 primära + separator + 4 output)
