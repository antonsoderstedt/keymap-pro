# R8 — Decision Context Builders v2

**Scope:** Fixa fyra konkreta brister i `decision_context`-pipelinen som gör att
"Visa kontext"-panelen i Today/Åtgärder visar tomma sektioner, UUID-bevis utan
siffror, "Tidigare åtgärder" felklassade som "Sannolika orsaker" och claim:s i
titel utan motsvarande rad i `what_changed`. Detta är en **pipeline-/builder-
sprint** — UI-komponenten `ContextSheet.tsx` är redan korrekt. Det är data som
saknas eller är fel klassificerad.

**Gränser (låst):**

- Ingen ny tabell. Ingen ny edge function. Inga nya kolumner i `decision_context`.
- Inga LLM-prompt-ändringar. Inga scoring-ändringar.
- Bakåtkompatibel JSON-payload — endast tillägg av valfria fält i typer.
- Inga schema-migrations. Allt körs i `_shared/decision-context/`-modulerna och
  i `decision-context-build/index.ts` + UI.
- Inga ändringar i `ads_change_proposals`-godkännandeflödet (R4 kvar orört).

**Bakgrund (varför):**

Vid manuell granskning av PMax-Laserskärning-action-itemet såg vi:

1. **Titel:** "konverteringar -61%" — påståendet finns men `what_changed` är tomt.
2. **Sannolika orsaker:** "Tidigare åtgärd: Förbättra QS eller pausa: 'Durkplåt'"
   — det här är inte en orsak, det är en tidigare implementerad åtgärd och
   borde ligga under `recent_changes` (där den redan finns). Den dubbel-
   klassificeras nuvarande i `assembleCausalCandidates`.
3. **Relaterade signaler:** "GSC clicks", "GSC impressions", "GA4 sessions",
   "GA4 users" — bara nakna labels. Data finns på `SignalCandidate` (`value`,
   `baseline`, `delta_pct`, `direction`) men droppas vid mapping till
   `RelatedSignalLite`.
4. **Bevis:** "Operatör eb7e5fa2-… 5 maj / GSC e73e355a-… / GA4 716ae3e5-…"
   — `EvidenceRef.excerpt` finns i typen men fylls aldrig i.

Användaren får då en panel som ser kompetent ut men säger ingenting konkret —
och kan inte besvara frågan *"varför ska jag godkänna detta?"*.

---

## Acceptanskriterier

A. **`RelatedSignal` visar siffror.** En "GA4 sessions"-rad ska rendera som
   `GA4 sessions ↓ 28% (28d)` — med riktning, delta och fönster. Implementeras
   genom att lägga till valfritt `metric_delta?: MetricDelta` på
   `RelatedSignalLite` (shared) + `RelatedSignal` (public type), populeras av
   `selectRelatedSignals`, renderas av `RelatedSection` via befintliga
   `MetricDeltaRow`.

B. **`EvidenceRef.excerpt` populeras.** För varje evidence som kommer från en
   `SignalCandidate` med `value`/`baseline`/`delta_pct`, fyll `excerpt` med en
   kort svensk siffermening, t.ex. `"sessions 1 240 → 893 (-28%, 28d)"`. För
   evidence från ads-mutations: `"Annonsändring: budget_change 18 maj"`. För
   operator-actions: `"Implementerad åtgärd: <title> (<datum>)"`. Aldrig längre
   än 120 tecken.

C. **Recent actions slutar dubbel-klassificeras.** Ta bort `recentActions`-
   loopen ur `assembleCausalCandidates` i `decision-context-build/index.ts`.
   De finns redan i `assembleChangeCandidates` → `recent_changes`. Behåll
   `mutations`-loopen (Ads-mutationer ÄR rimliga causal candidates eftersom de
   är mekaniska ändringar; tidigare action_items är notations, inte
   mutationer). Behåll också `proposal.rule_id`-loopen.

D. **Claim-validering i builder.** Om action_item-titeln matchar mönstret
   `/(konverteringar|klick|ctr|kostnad|sessions|impressions|users|pageviews)\s*[-:]?\s*[-+]?\d+%/i`
   och `what_changed.length === 0` efter selection, sätt
   `confidence.gate_triggers` att inkludera `"claim_unverified"` och returnera
   panelens `narrative_status` som `"failed"` (panel-UI visar då explicit
   "Kunde inte verifiera påståendet — bygg om" istället för att rendera
   tomma sektioner). UI behöver ingen ändring för detta — `narrative_status`-
   gaten finns redan i `ContextSheet`.

E. **UI-ändring (minimal):** `RelatedSection` i `ContextSheet.tsx` renderar
   `metric_delta` via befintliga `MetricDeltaRow` om fältet finns, annars
   fallback till nuvarande beteende. Ingen annan UI-fil ändras.

F. **Tester.** Lägg till pure-logic-tester i `src/test/`:
   - `related-signal-delta.test.ts` (3 tester): selectRelatedSignals lägger
     metric_delta när candidate har delta_pct; utelämnar fältet när bara
     statisk; respekterar diversitetsregeln oförändrat.
   - `evidence-excerpt.test.ts` (3 tester): assembleEvidence fyller excerpt
     för signal-baserade refs; trimmar till 120 tecken; tomt för okänt
     källformat.
   - `causal-no-recent-actions.test.ts` (2 tester): recentActions klassas
     INTE som causal; mutations + rule_id KVAR.
   - `claim-validation.test.ts` (3 tester): titel "konverteringar -61%" +
     tom what_changed → gate_trigger "claim_unverified" +
     narrative_status "failed"; titel utan claim → ingen gate; what_changed
     ifyllt → ingen gate.

   Totalt: **+11 tester** (224 → … nej, vi är på 233 → 244).

G. **Disciplin:** Inga ändringar i `confidence.ts` viktningsformel. Inga
   ändringar i `decision-context-build`-pipelinens output utöver de specade
   fälten. `MODEL_VERSION` bumpas till `"decision-context-v1.1.0"` (var
   `v1.0.0`).

---

## Filer som ändras (förväntat)

**Pipeline (kärna):**
- `supabase/functions/_shared/decision-context/types.ts` — lägg
  `metric_delta?: MetricDeltaLite` på `RelatedSignalLite`.
- `supabase/functions/_shared/decision-context/related.ts` — populera
  `metric_delta` från candidate när `value`/`baseline`/`delta_pct` finns.
- `supabase/functions/_shared/decision-context/evidence.ts` — formatera
  `excerpt` per evidence baserat på candidate-data (skicka in candidates som
  en optional param eller bygg en lookup-map).
- `supabase/functions/_shared/decision-context/build.ts` — propagera nya
  fält genom assembleEvidence-anropet.
- `supabase/functions/_shared/decision-context/constants.ts` — bumpa
  `MODEL_VERSION` till `"decision-context-v1.1.0"`.
- `supabase/functions/decision-context-build/index.ts` — ta bort
  recentActions-loopen i `assembleCausalCandidates`; lägg till claim-detektor
  + gate "claim_unverified" + narrative_status-override.

**Klient-types:**
- `src/lib/types.ts` — lägg `metric_delta?: MetricDelta` på `RelatedSignal`-
  interface.

**UI:**
- `src/components/context/ContextSheet.tsx` — i `RelatedSection`, om
  `s.metric_delta` finns rendera via befintliga `MetricDeltaRow` (samma
  komponent som `WhatChangedSection` använder), annars nuvarande fallback
  (label + source-tag).

**Tester:**
- `src/test/related-signal-delta.test.ts` (ny)
- `src/test/evidence-excerpt.test.ts` (ny)
- `src/test/causal-no-recent-actions.test.ts` (ny)
- `src/test/claim-validation.test.ts` (ny)

**Inte ändras:**
- `ContextSheet`-layout/sektionsordning/etiketter
- Confidence-formel
- LLM-narrative-pipeline
- Schema / migrations
- Existerande tester (alla 233 måste fortsätta passera)

---

## Granskningschecklista (innan ship)

- [ ] `npx vitest run` → 244/244 grön (233 befintliga + 11 nya)
- [ ] `npx tsc --noEmit` clean
- [ ] Manual: öppna ett action_item där what_changed är tomt och titeln har
  "X -Y%" → panelen visar "Kunde inte verifiera påståendet — bygg om", inte
  tomma sektioner
- [ ] Manual: öppna ett action_item där what_changed har 2 rader → relaterade
  signaler visar `↓ 28% (28d)`-stil delta, inte bara `"GA4 sessions"`
- [ ] Manual: öppna evidence-sektionen → varje rad visar siffermening, inte
  bara UUID + datum
- [ ] `decision_context.model_version` på nyskapade rader = `"decision-context-v1.1.0"`
- [ ] Inga rader i `causal_signals` av typen `"Tidigare åtgärd: …"` —
  de syns i `recent_changes` istället

---

## Anti-mål (uttryckliga gränser)

- **INTE** bygga ny LLM-narrative-pipeline (det är en separat sprint).
- **INTE** lägga till ny scoring-logik eller justera viktningar.
- **INTE** ändra `action_items`-schemat eller `ads_change_proposals`-flödet.
- **INTE** lägga till nya datakällor eller edge functions.
- **INTE** "förbättra" UI-sektionerna utöver `metric_delta`-renderingen.
- **INTE** röra Today.tsx eller ActionsPipeline.tsx — den uppströms-fixen
  ("Markera som hanterad" vs "Pusha till Google Ads") är redan landad
  separat (Väg A).

---

## Sammanfattning för committen

```
R8: Decision Context Builders v2 — populate deltas, excerpts, declassify recent actions, validate claims

- RelatedSignal: add optional metric_delta, populated in selectRelatedSignals
- EvidenceRef: populate excerpt with formatted signal/mutation/action summary
- assembleCausalCandidates: drop recentActions loop (was dup of recent_changes)
- decision-context-build: detect title-claim vs empty what_changed → gate "claim_unverified"
- MODEL_VERSION bump to v1.1.0
- ContextSheet.RelatedSection: render metric_delta via MetricDeltaRow when present
- +11 pure-logic tests
```
