# R4-followup-A — Auto-revert scheduling

**Goal:** R4 gav batched approval. Större batch → större blast radius. Auto-revert är skyddsnätet som gör att operatören vågar pusha 23 ändringar samtidigt: definierar en tröskel ("revertera om CTR sjunker ≥X% inom Y dagar"), mäter efter pushen, och kallar `ads-revert-mutation` automatiskt om tröskeln överskrids.

**Locked discipline (must hold):**
- Inga scoring-ändringar.
- Inga LLM-prompt-ändringar.
- **Inga nya tabeller.** Återanvänd `ads_change_proposals`, `ads_mutations`, `ads_recommendation_outcomes`, `cron-ads-outcomes`, `ads-revert-mutation`.
- Återanvänd existerande revert-flow i `ads-revert-mutation` — vi anropar den, inte skriver om den.
- Out of scope: RSA A/B variants (R4-followup-B), ML impact scoring (R4-followup-C), R5 (Account Intelligence rewrite).

---

## 1. Datamodell — utvidga befintliga tabeller

**Migration: `<ts>_auto_revert_policy.sql`**

Tillägg på `ads_change_proposals`:
```sql
ALTER TABLE ads_change_proposals
  ADD COLUMN IF NOT EXISTS auto_revert_policy JSONB;
```

Schema för `auto_revert_policy` (validera i edge function, inte i DB-constraint):
```ts
type AutoRevertPolicy = {
  metric: "ctr" | "clicks" | "cost" | "conversions";
  threshold_pct: number;       // t.ex. -20 = revertera om metric sjunker 20%
  window_days: 7 | 14 | 30;     // mätfönster efter applied_at
  enabled: boolean;
};
```

Tillägg på `ads_recommendation_outcomes`:
```sql
ALTER TABLE ads_recommendation_outcomes
  ADD COLUMN IF NOT EXISTS measured_7d JSONB,
  ADD COLUMN IF NOT EXISTS auto_reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_revert_reason TEXT;
```

Tillägg på `ads_mutations`:
```sql
ALTER TABLE ads_mutations
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES ads_change_proposals(id);
```

Backfill `ads_mutations.proposal_id` om möjligt genom att matcha på `(project_id, action_type, applied_at)` mot proposals — annars lämna NULL för historik. Nya mutations ska sätta `proposal_id` när de skapas från en proposal.

**INGEN unique constraint, INGEN ny tabell.**

---

## 2. Edge: utvidga `ads-mutate` att skicka in proposal_id

**Fil:** `supabase/functions/ads-mutate/index.ts`

- Acceptera optional `proposal_id` i request body. När mutation skrivs till `ads_mutations`, sätt `proposal_id` om angivet.
- Inga andra ändringar i den funktionen.

---

## 3. Edge: utvidga `cron-ads-outcomes` för 7d-mätning + auto-revert

**Fil:** `supabase/functions/cron-ads-outcomes/index.ts`

Lägg till en ny pass utöver befintliga 14d/30d:

```ts
// 7d due rows
const cutoff7 = new Date(now); cutoff7.setDate(cutoff7.getDate() - 7);
const { data: due7 } = await admin
  .from("ads_recommendation_outcomes")
  .select("id, project_id, rule_id, campaign_id, applied_at, measured_7d, predicted")
  .not("applied_at", "is", null)
  .is("measured_7d", null)
  .lte("applied_at", cutoff7.toISOString())
  .limit(50);
```

Mät 7d delta (samma metod som befintlig 14d-mätning, men `fetchCampaignMetricsBetween(..., applied_at - 7d, applied_at)` vs `(applied_at, applied_at + 7d)`). Skriv resultat till `measured_7d` (samma shape som `measured_14d`).

**Efter mätning, kör auto-revert-utvärdering:**

```ts
// För varje outcome som just mätts (oavsett 7/14/30d), kolla auto-revert
for (const outcome of justMeasured) {
  // Hitta tillhörande proposal via mutation
  const { data: mutation } = await admin
    .from("ads_mutations")
    .select("id, proposal_id, reverted_at")
    .eq("project_id", outcome.project_id)
    .eq("campaign_id", outcome.campaign_id)
    .gte("applied_at", outcome.applied_at)
    .lt("applied_at", new Date(new Date(outcome.applied_at).getTime() + 60000).toISOString())
    .eq("status", "success")
    .is("reverted_at", null)
    .maybeSingle();

  if (!mutation?.proposal_id) continue;

  const { data: proposal } = await admin
    .from("ads_change_proposals")
    .select("auto_revert_policy")
    .eq("id", mutation.proposal_id)
    .maybeSingle();

  const policy = proposal?.auto_revert_policy as AutoRevertPolicy | null;
  if (!policy?.enabled) continue;

  // Bara utvärdera om window matchar
  const measurementKey = `measured_${policy.window_days}d` as const;
  const measurement = outcome[measurementKey];
  if (!measurement) continue;

  const shouldRevert = evaluateAutoRevert(policy, measurement);
  if (shouldRevert.revert) {
    // Anropa ads-revert-mutation
    const { error: revertErr } = await admin.functions.invoke("ads-revert-mutation", {
      body: { mutation_id: mutation.id },
    });
    if (!revertErr) {
      await admin.from("ads_recommendation_outcomes")
        .update({
          auto_reverted_at: new Date().toISOString(),
          auto_revert_reason: shouldRevert.reason,
        })
        .eq("id", outcome.id);
    }
  }
}
```

**Pure helper i samma fil:**

```ts
function evaluateAutoRevert(
  policy: AutoRevertPolicy,
  measurement: { delta_pct?: { ctr?: number; clicks?: number; cost?: number; conversions?: number } } | any,
): { revert: boolean; reason: string } {
  const delta = measurement?.delta_pct?.[policy.metric];
  if (typeof delta !== "number") return { revert: false, reason: "no_measurement" };
  // policy.threshold_pct är negativt (t.ex. -20). Revert om delta sjunker UNDER tröskeln.
  if (delta <= policy.threshold_pct) {
    return { revert: true, reason: `${policy.metric} ${delta}% (threshold ${policy.threshold_pct}%)` };
  }
  return { revert: false, reason: "within_threshold" };
}
```

**Befintligt 14d/30d-flow behålls oförändrat** — bara nytt 7d-pass + auto-revert-utvärdering ovanpå.

---

## 4. UI — auto-revert-toggle i ActionsPipeline

**Fil:** `src/pages/workspace/ActionsPipeline.tsx`

I bulk action bar (R4-shipment), lägg till en kollapsbar "Auto-revert"-sektion innan "Pusha alla":

```
☐ Auto-revert om [CTR ▾] sjunker [≥20%] inom [7 dagar ▾]
```

- Tre dropdowns: metric (CTR/Clicks/Cost/Conversions), threshold (10/20/30/50%), window (7/14/30d).
- Default off. När påslagen + minst en proposal vald: `auto_revert_policy` skickas med varje approve-anrop och sparas på proposal-raden.
- Visa info-text: "Mätning sker {window}d efter push. Om {metric} sjunker mer än tröskeln, återställs ändringen automatiskt."

**Per-row settings (inte denna sprint):** lägg INTE till per-rad-policy. Bara batch-level i bulk bar. Håller scope tight.

**Visa auto-revert-status på "implemented" stage:**
- Om `outcome.auto_reverted_at` är satt, visa badge "Auto-reverterad" + reason-text i row details (Sheet).

---

## 5. lib: pure helper

**Ny fil: `src/lib/autoRevert.ts`**

Spegelbild av edge-functionens helper, för UI-validering:

```ts
export type AutoRevertPolicy = {
  metric: "ctr" | "clicks" | "cost" | "conversions";
  threshold_pct: number;
  window_days: 7 | 14 | 30;
  enabled: boolean;
};

export function evaluateAutoRevert(
  policy: AutoRevertPolicy,
  deltaPctByMetric: Partial<Record<AutoRevertPolicy["metric"], number>>,
): { revert: boolean; reason: string } {
  if (!policy.enabled) return { revert: false, reason: "disabled" };
  const delta = deltaPctByMetric[policy.metric];
  if (typeof delta !== "number") return { revert: false, reason: "no_measurement" };
  if (delta <= policy.threshold_pct) {
    return { revert: true, reason: `${policy.metric} ${delta}% (threshold ${policy.threshold_pct}%)` };
  }
  return { revert: false, reason: "within_threshold" };
}

export const DEFAULT_AUTO_REVERT_POLICY: AutoRevertPolicy = {
  metric: "ctr",
  threshold_pct: -20,
  window_days: 7,
  enabled: false,
};
```

---

## 6. Tester

**Ny fil: `src/test/auto-revert.test.ts`** (pure logic):
- `evaluateAutoRevert` när `enabled: false` → `{revert: false, reason: "disabled"}`.
- Policy `{metric: "ctr", threshold_pct: -20, enabled: true}` + delta -25% CTR → `revert: true`, reason innehåller "ctr" + "-25" + "-20".
- Policy `{metric: "ctr", threshold_pct: -20, enabled: true}` + delta -10% CTR → `revert: false`, reason `"within_threshold"`.
- Policy `{metric: "clicks"}` men measurement saknar `clicks` → `revert: false`, reason `"no_measurement"`.
- Policy med `threshold_pct: -50` + delta -50% → `revert: true` (gränsfall: `<=`).
- Policy med threshold -50 + delta -49 → `revert: false`.

Skip integration-tester för actual cron + revert-API — de kräver Supabase auth.

---

## 7. Acceptance criteria

- `ads_change_proposals.auto_revert_policy` kolumn finns, accepterar JSONB eller NULL.
- `ads_mutations.proposal_id` kolumn finns, FK till `ads_change_proposals(id)`.
- `ads_recommendation_outcomes` har `measured_7d`, `auto_reverted_at`, `auto_revert_reason` kolumner.
- `ads-mutate` accepterar `proposal_id` i body och persisterar det.
- `cron-ads-outcomes` mäter 7d efter `applied_at` i tillägg till befintliga 14/30d.
- Efter mätning utvärderas `auto_revert_policy` per proposal; om tröskel överskrids anropas `ads-revert-mutation` automatiskt.
- `auto_reverted_at` + `auto_revert_reason` sätts på outcome-raden vid lyckad auto-revert.
- ActionsPipeline bulk-bar har auto-revert-toggle som sparas på alla approved proposals i batchen.
- "Implemented"-stage visar "Auto-reverterad"-badge för reverterade rader.
- Alla 218 existerande tester gröna + `src/test/auto-revert.test.ts` (6 tester).
- `npx tsc --noEmit` clean.

---

## 8. Filer att röra

**Nya:**
- `supabase/migrations/<ts>_auto_revert_policy.sql`
- `src/lib/autoRevert.ts`
- `src/test/auto-revert.test.ts`

**Modifierade:**
- `supabase/functions/ads-mutate/index.ts` — acceptera `proposal_id`, persistera till `ads_mutations`.
- `supabase/functions/cron-ads-outcomes/index.ts` — nytt 7d-pass + auto-revert-utvärdering + invoke `ads-revert-mutation`.
- `src/pages/workspace/ActionsPipeline.tsx` — auto-revert-toggle i bulk-bar + badge i implemented-stage.
- `src/integrations/supabase/types.ts` — regen för nya kolumner.

**INTE rörda:**
- `ads-revert-mutation/index.ts` — anropas, men inte modifierad.
- `ads-build-proposals/index.ts`
- `ads-diagnose/index.ts`
- `measure-action-impact/index.ts`
- Scoring, LLM-prompts.
- `ad_drafts`, `strategy_drafts`, keyword universe, content briefs.

---

## 9. Säkerhetsnät / edge cases

- Om `ads_mutations.proposal_id` är NULL (historiska rader): hoppa över auto-revert-utvärdering för dem.
- Om `ads-revert-mutation` failar (t.ex. redan reverterad manuellt): logga error, sätt INTE `auto_reverted_at`. Försök igen nästa cron-run? **Nej** — sätt `auto_revert_reason: "revert_failed: {msg}"` så vi inte loopar. Operatören får hantera manuellt.
- Om delta är `null` (baseline = 0): behandla som "no_measurement", revert: false. Bättre att inte revertera än att revertera fel.
- Race: om operatören redan manuellt reverterat mutation (`reverted_at IS NOT NULL`), hoppa över auto-revert (query filtrerar redan på `is("reverted_at", null)`).
- Token: `cron-ads-outcomes` kör med service role; invoke till `ads-revert-mutation` måste skicka rätt Authorization header för att `getAdsContext` ska få token. Lös genom att läsa projektets refresh-token via service-role-klienten och konstruera Authorization, eller (enklare) lägg in en service-mode-väg i `ads-revert-mutation` som accepterar `project_id` istället för user-token. Välj den variant som passar befintlig auth-pattern bäst — om osäker, läs hur `cron-ads-outcomes` redan kör `searchGaql` (samma pattern).

---

## 10. Notes

- Tröskel är **negativ** (-20 = "sjunker 20%"). Anledning: explicit. Vi reverterar bara på försämring, aldrig på förbättring. Positiva trösklar är meningslösa här.
- 7d-fönster är default eftersom det är operatör-tolerant: vänta inte två veckor på revert.
- Vi använder `measurement.delta_pct.<metric>` shape. Verifiera att `fetchCampaignMetricsBetween` i `cron-ads-outcomes` redan producerar denna shape — om inte, behåll existerande shape och anpassa `evaluateAutoRevert` därefter. Befintliga 14d/30d-mätningar har enligt koden formen `{ before, after, delta_pct: { clicks, impressions, cost, conversions } }` — använd samma struktur för 7d.
- CTR härleds: `clicks / impressions`. Om edge inte redan beräknar `delta_pct.ctr`, lägg till det i `cron-ads-outcomes` när 7d-mätningen skrivs.
