# R7 — Trust gating av exports + trust-badges på icke-keyword-ytor

**Goal:** R3-serien gav oss `dataSource: "real" | "estimated"`, `isNegative`, och `getIdeaStatus → "verified" | "unverified_idea" | "negative"`. Idag *visar* vi badges i keyword-tabellerna, men exports och nedströms-ytor läcker fortfarande overifierad data rätt ut till Google Ads Editor, content briefs, och prelaunch ad plans. R7 stänger den läckan.

**Locked discipline (must hold):**
- Inga scoring-ändringar.
- Inga LLM-prompt-ändringar.
- Inga nya tabeller.
- Återanvänd `getIdeaStatus`, `isVerified`, `filterVerifiedOnly` från `src/lib/ideaStatus.ts`. Skapa inga nya derivations.
- Återanvänd `UnverifiedIdeaBadge` från `src/components/keywords/UnverifiedIdeaBadge.tsx`. Skapa ingen ny badge-komponent.
- Out of scope: R5 (Account Intelligence rewrite), R4-followup (RSA A/B), nya scoring-vyer.

---

## 1. Hard gating av AdsExportModal

**Fil:** `src/components/universe/AdsExportModal.tsx`

Idag filtreras `eligibleAds` på `!isNegative && searchVolume > 0 && channel === "Google Ads"`. Detta släpper igenom overifierade idéer.

**Ändringar:**
- Lägg till `import { getIdeaStatus } from "@/lib/ideaStatus";`
- Bygg två listor:
  ```ts
  const verifiedAds = universe.keywords.filter((k) =>
    !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads"
    && getIdeaStatus(k) === "verified"
  );
  const unverifiedExcluded = universe.keywords.filter((k) =>
    !k.isNegative && k.channel === "Google Ads" && getIdeaStatus(k) === "unverified_idea"
  ).length;
  ```
- Använd `verifiedAds` (inte `eligibleAds`) för `adGroupCount`, `buildAdGroupsForGeneration`, och i `buildGoogleAdsEditorZip`. Skicka in ett begränsat universe där `keywords` är ersatt med `verifiedAds`:
  ```ts
  const verifiedUniverse = { ...universe, keywords: verifiedAds };
  ```
  Använd `verifiedUniverse` i alla anrop till export- och generate-funktioner.
- Lägg till banner överst i dialogen när `unverifiedExcluded > 0`:
  ```
  ⚠ {unverifiedExcluded} overifierade idéer exkluderas. Verifiera via Keyword Planner först.
  ```
  Använd `<Alert variant="warning">` (eller motsvarande shadcn `Alert` med varningsstyling) — inte en toast.
- Disable "Exportera"-knappen + visa meddelande "Inga verifierade sökord att exportera" om `verifiedAds.length === 0`. Tooltip på knappen: "Verifiera via Keyword Planner".

**Rör INTE** `googleAdsExport.ts` (ren lib — den ska inte känna till verified-konceptet, det är callerns ansvar).

---

## 2. Hard gating av ContentBriefsTab

**Fil:** `src/components/universe/ContentBriefsTab.tsx`

Briefs genereras per cluster. Just nu kan operatören generera brief för ett cluster som *bara* består av overifierade idéer → LLM slösar tokens på spöksökord.

**Ändringar:**
- Importera `getIdeaStatus` från `@/lib/ideaStatus`.
- För varje cluster beräkna `verifiedCount` (antal keywords där `getIdeaStatus(k) === "verified"`).
- Rendera per cluster:
  - Om `verifiedCount === 0`: disable "Generera brief"-knappen, visa inline-text "Inga verifierade sökord i klustret — verifiera via Keyword Planner först".
  - Om `verifiedCount > 0`: tillåt generering, men visa subtil indikator om `verifiedCount < totalCount` (t.ex. `"{verifiedCount}/{totalCount} verifierade"` i klusterheadern).
- I `handleGenerate` (eller motsvarande): innan supabase-anrop, kontrollera `verifiedCount > 0` och returnera tidigt med toast om inte. Defensive guard mot UI bypass.

**Rör INTE** `contentBriefExport.ts`, edge-funktionen `generate-brief`, eller `content_briefs`-tabellen.

---

## 3. Hard gating av PrelaunchBlueprint ads plan export

**Fil:** `src/pages/workspace/PrelaunchBlueprint.tsx`

Använder `downloadAdsPlanCsv` från `src/lib/adsPlanExport.ts`.

**Ändringar:**
- Innan `downloadAdsPlanCsv` anropas, filtrera `universe.keywords` till bara `getIdeaStatus(k) === "verified"`. Skicka ett verifiedUniverse till export-funktionen.
- Visa antal exkluderade overifierade idéer som hjälptext under download-knappen (t.ex. "12 overifierade idéer exkluderade").
- Disable download-knappen om verifiedCount === 0.

**Rör INTE** `adsPlanExport.ts` (ren lib).

---

## 4. Trust badges på icke-keyword-ytor

Idag visas `UnverifiedIdeaBadge` bara i `KeywordTable.tsx` och `KeywordUniverse.tsx` huvudtabell. Andra ytor refererar till keyword-namn utan trust-signal.

**Ytor att uppdatera (visa badge inline med keyword-text):**

1. **`src/pages/workspace/ActionsPipeline.tsx`** — där proposal-rader visar `scope_label` (ofta ett keyword) eller relaterar till specifika sökord via `target_keyword`/`scope_label`. Om scope_label matchar ett keyword i `universe.keywords` med `getIdeaStatus !== "verified"`, rendera `<UnverifiedIdeaBadge status={getIdeaStatus(k)} />` bredvid scope-texten. Skip om scope inte är ett keyword (t.ex. om det är campaign/ad group-nivå).

2. **`src/components/results/sections/ChannelsSection.tsx`** — vid keyword-listor/preview.

3. **`src/components/results/sections/ActionSection.tsx`** — om sektionen visar specifika sökord i action-text.

**Helper att lägga till** i `src/lib/ideaStatus.ts`:
```ts
/**
 * Look up a keyword by name (case-insensitive) in a universe and return its status.
 * Returns undefined if not found.
 */
export function lookupIdeaStatus(
  universe: { keywords: Array<{ keyword: string; dataSource?: "real" | "estimated"; isNegative?: boolean }> } | null | undefined,
  keyword: string | null | undefined
): "verified" | "unverified_idea" | "negative" | undefined {
  if (!universe || !keyword) return undefined;
  const norm = keyword.trim().toLowerCase();
  const found = universe.keywords.find((k) => k.keyword.trim().toLowerCase() === norm);
  return found ? getIdeaStatus(found) : undefined;
}
```

Använd `lookupIdeaStatus(universe, scope_label)` på ActionsPipeline-ytan. Om resultatet är `"unverified_idea"` → rendera badge.

---

## 5. Tester

**Ny fil: `src/test/trust-gating.test.tsx`** (RTL + jsdom):
- `AdsExportModal` med universe av 5 keywords (3 verified, 2 unverified):
  - Renders warning banner "2 overifierade idéer exkluderas".
  - `eligibleAds` count i UI visar 3.
- `AdsExportModal` med universe av 0 verified, 3 unverified:
  - Export-knappen är disabled.
  - Visar meddelande "Inga verifierade sökord att exportera".
- `ContentBriefsTab` med ett cluster av 0 verified, 2 unverified:
  - "Generera brief"-knappen för det klustret är disabled.
  - Inline-text "Inga verifierade sökord i klustret" visas.

**Ny fil: `src/test/lookup-idea-status.test.ts`** (ren logik):
- `lookupIdeaStatus(universe, "Test")` returnerar `"verified"` när keyword matchas case-insensitive med dataSource real.
- Returnerar `"unverified_idea"` för estimated.
- Returnerar `"negative"` när isNegative.
- Returnerar `undefined` när keyword saknas i universe.
- Returnerar `undefined` för null/undefined input.

**Modifiera** `src/test/idea-status.test.ts` — INTE. Lämna existerande tester.

---

## 6. Acceptance criteria

- `AdsExportModal` exporterar aldrig keywords där `getIdeaStatus !== "verified"`. ZIP-innehåll innehåller bara verified keywords.
- Banner visas i `AdsExportModal` när överifierade exkluderas.
- `AdsExportModal` blockerar export helt om 0 verified.
- `ContentBriefsTab` blockerar brief-generering på cluster utan verified keywords.
- `PrelaunchBlueprint` filtrerar export på verified.
- `ActionsPipeline` visar `UnverifiedIdeaBadge` bredvid `scope_label` när scope är en overifierad sökordsfras.
- Alla existerande 210 tester gröna + 2 nya filer.
- `npx tsc --noEmit` clean.

---

## 7. Filer att röra

**Nya:**
- `src/test/trust-gating.test.tsx`
- `src/test/lookup-idea-status.test.ts`

**Modifierade:**
- `src/lib/ideaStatus.ts` — lägg till `lookupIdeaStatus`.
- `src/components/universe/AdsExportModal.tsx` — verifiedAds gating + banner + disable.
- `src/components/universe/ContentBriefsTab.tsx` — per-cluster gating.
- `src/pages/workspace/PrelaunchBlueprint.tsx` — verifiedUniverse vid download.
- `src/pages/workspace/ActionsPipeline.tsx` — badge bredvid scope_label.
- `src/components/results/sections/ChannelsSection.tsx` — badge vid keyword preview (om sådan finns).
- `src/components/results/sections/ActionSection.tsx` — badge i action-text (om keyword refereras).

**INTE rörda:**
- `src/lib/googleAdsExport.ts`
- `src/lib/contentBriefExport.ts`
- `src/lib/adsPlanExport.ts`
- `src/components/keywords/KeywordTable.tsx` (har redan badge)
- `src/components/keywords/UnverifiedIdeaBadge.tsx`
- Alla edge-funktioner.
- Migrations (inga DB-ändringar).
- Scoring, LLM-prompts, `analyses`/`ads_change_proposals`/`ad_drafts`/`content_briefs`-tabeller.

---

## 8. Notes

- All gating sker i UI-lagret. Lib-funktioner förblir agnostiska — de tar emot den `universe` som ges. Detta håller libs testbara och pure.
- Banner-text på svenska, operator-grade ton.
- Om en yta refererar till ett keyword som inte finns i universe (t.ex. legacy proposal som referencear borttaget sökord), visa INGEN badge — `lookupIdeaStatus` returnerar `undefined`, så rendera inget. Gör inte antaganden om frånvaro.
