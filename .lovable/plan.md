## Problemet

`opportunities.ts` har hårdkodade trösklar (KD<35, volym≥50, KD<25 för quick wins) som passar konsumentsajter men inte nisch-B2B där typisk KD är 30–60 och volymer låga. Resultat: Staldirect.se fick **1 opportunity av 939 keywords** trots att v2-scoringen rankar dem korrekt.

Att bara sänka konstanterna globalt skulle göra opportunities meningslösa för konsumentsajter (allt blir "quick win"). Lösningen: **adaptiva trösklar baserade på universumets egen distribution** + använd `final_score` som primär signal istället för råa KD/volym-tal.

## Lösning

### 1. Beräkna universum-percentiler en gång

I början av `discoverOpportunities()`, räkna ut p25/p50/p75 för KD och volym på de keywords som har data. Det ger oss "låg KD för **detta** universum" istället för "låg KD generellt".

```text
kdP25, kdP50, kdP75   → "låg/medel/hög" KD relativt sajten
volP50, volP75         → "betydande volym" relativt sajten
scoreP75, scoreP90     → "topp-score" från v2-motorn
```

### 2. Använd `final_score` som primär gate

v2-scoringen väger redan in demand, intent, busRel, difficulty och ICP. Istället för att duplicera den logiken med råa KD-trösklar:

- **quick_dominance**: `final_score ≥ scoreP90` + transactional/commercial + (competitorGap **eller** KD ≤ kdP25). Tar topp-10% av sajtens egna scoring som "snabbvinster".
- **service_gap**: kluster där medel-final_score ≥ scoreP75 **och** ≥60% av keywords har competitorGap. Lättar från "alla måste ha gap" till majoritet.
- **striking_distance_cluster**: kluster med total volym ≥ p75 av klustervolymerna **och** medel-score i top-50%. Adaptivt mot sajtens storlek.
- **geo_opportunity**: location-keywords med score ≥ scoreP50 (släpper kravet på competitorGap som ofta saknas i nisch-B2B).

### 3. Lägg till två nya opportunity-typer

- **`high_score_underserved`**: topp-20 keywords på final_score som inte fångas av andra typer — fallback så att högsta-score-keywords alltid syns som opportunity oavsett tröskelmatchning.
- **`cluster_consolidation`**: kluster med ≥5 keywords där medel-score ≥ p50 — pillar-page-kandidater (dagens striking_distance täcker bara medium-priority).

### 4. Garantera minst N opportunities

Om resultatet < 5 opportunities efter ovanstående: ta topp-scoring keywords/kluster som inte redan är med och lägg som `high_score_underserved`. Lovar att UI alltid visar något actionable.

### 5. Minor UI-tweak

I `WorkspaceKeywordUniverse.tsx` opportunity-listan: visa `score.final` och `revenue.p50` per opportunity-keyword så användaren ser varför ett kluster valdes.

## Filer som ändras

| Fil | Ändring |
|---|---|
| `supabase/functions/_shared/keyword-intel/opportunities.ts` | Skriv om med percentil-baserade trösklar + 2 nya typer + minimum-N-garanti |
| `supabase/functions/_shared/keyword-intel/scoring.ts` | Ingen ändring |
| `supabase/functions/keyword-universe/index.ts` | Ingen ändring (samma input/output-kontrakt) |
| `src/pages/workspace/WorkspaceKeywordUniverse.tsx` | Visa score+intäkt på opportunity-keywords |
| `src/lib/types.ts` | Lägg till `high_score_underserved` + `cluster_consolidation` i Opportunity-type |

## Effekt

- **Staldirect.se** (KD-medel ~45): går från 1 → ~6–10 opportunities, drivna av v2-score istället för konsument-trösklar.
- **Konsumentsajt** (KD-medel ~15): fortfarande ~5–10 opportunities men trösklarna skalar upp så det blir verkligen topp-fyndar, inte allt.
- **Ingen regression**: kontraktet `Opportunity[]` är samma; UI behöver bara hantera två nya `type`-strings.

Ingen ny migration, inga ny secrets, inget förändrat scoring-kontrakt. Endast opportunity-discovery-logik + liten UI-uppdatering.
