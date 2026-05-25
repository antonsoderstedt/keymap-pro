# R4 — Diagnosis → Execution drafts

**Goal:** Close the loop from `ads-diagnose` (which produces findings) to `ads_change_proposals` (which operators approve and push). Currently `ads-build-proposals` exists but runs ad-hoc; findings pile up faster than proposals are generated, and the UI shows them as a flat list with no batching.

**Locked discipline (must hold):**
- No scoring changes.
- No LLM prompt changes.
- No new tables. Reuse `ads_change_proposals`, `ads_diagnostics_runs`, `action_items`, `ads_recommendation_outcomes`.
- Surgical scope: auto-cascade + batched approval UI + impact summary. Nothing else.
- Out of scope for R4: A/B RSA variants, auto-revert scheduling, ML impact scoring, CampaignStructure rewrite (R5), trust-gating exports (R7).

---

## 1. Auto-draft cascade (edge function side)

**Modify `supabase/functions/ads-diagnose/index.ts`:**
- After successful insert into `ads_diagnostics_runs`, invoke `ads-build-proposals` for the same `project_id` and pass the `run_id` (so build-proposals can look up the fresh report).
- Use `supabase.functions.invoke("ads-build-proposals", { body: { project_id, diagnostics_run_id } })`. Fire-and-forget if possible (no `await` blocking the response), but log errors to `edge_logs`.

**Modify `supabase/functions/ads-build-proposals/index.ts`:**
- Accept optional `diagnostics_run_id` parameter. If present, read findings from that specific run instead of the latest.
- For each Diagnosis in the report, compute a dedupe key:
  ```ts
  const dedupeKey = `${project_id}::${rule_id}::${scope_label}::${action_type}`;
  ```
- Upsert into `ads_change_proposals` using the dedupe key. If a proposal already exists in `status IN ('draft','approved','queued')`, **skip** (operator hasn't acted yet — don't overwrite). If it exists in `status IN ('pushed','rejected','failed')`, create a new row (allows re-firing after rejection/push if the issue reoccurs).
- Add column `dedupe_key TEXT` to `ads_change_proposals` via migration. Add unique partial index:
  ```sql
  CREATE UNIQUE INDEX ads_change_proposals_active_dedupe
    ON ads_change_proposals (project_id, dedupe_key)
    WHERE status IN ('draft','approved','queued');
  ```
- Backfill `dedupe_key` for existing rows in the migration.

**Modify `supabase/functions/ads-diagnose/index.ts` return payload:**
- Include `proposals_generated: number` (count of new proposals created) so the UI can show it in the diagnosis-complete toast.

---

## 2. Batched approval UI

**Modify `src/pages/workspace/ActionsPipeline.tsx`:**

Add a "Group by" toggle near the existing Stage tabs (proposed | approved | implemented | measured):
- Options: **Ingen** (default, current behavior), **Regel** (group by `rule_id`), **Åtgärdstyp** (group by `action_type`).
- Store in URL search param `groupBy` so it's bookmarkable.

When `groupBy !== "none"`, render groups as collapsible accordions:
- Header: group label + count + combined `estimated_impact_sek` + group-level checkbox + group-level "Godkänn alla"-knapp.
- Rows inside: same as today but with row-level checkbox (currently each row has individual buttons).

Add **selection state**:
- Local `Set<string>` of selected proposal IDs.
- Selecting a group checkbox toggles all rows in that group.
- Bulk action bar appears at bottom when ≥1 selected: shows `{n} valda • Σ impact: {sek} kr/mån` + buttons "Godkänn alla", "Pusha alla", "Avvisa alla".
- Bulk approve: loop calling existing approve mutation. Bulk push: loop calling `ads-mutate` for each. Show progress (`Pushar 3/10…`) via a single toast updated in-place. Stop on first failure, show which one failed.

Use existing `actionsPipeline.ts` helpers — extend with:
```ts
export function groupItemsBy(items: PipelineItem[], by: "rule_id" | "action_type"): Record<string, PipelineItem[]>
export function sumImpact(items: PipelineItem[]): number
```

Group labels in Swedish:
- For `rule_id`: human label from existing `RULE_LABELS` map (extend if needed).
- For `action_type`: existing `actionTypeLabel()` from `actionsPipeline.ts`.

**Do NOT touch** the Sheet/details view, the stage tabs themselves, or the origin filter. Just add the group-by + bulk actions.

---

## 3. Pre-push impact summary

In the bulk action bar (see above), the cumulative impact is shown live as user selects rows. No separate page or modal needed.

Add one safety guard: if cumulative impact > 50,000 kr/mån, show inline confirmation dialog ("Stor batch — granskat?") before pushing. AlertDialog from shadcn.

---

## 4. Tests

Add `src/test/proposals-batching.test.ts` (pure logic, no React):
- `groupItemsBy([], "rule_id")` → `{}`.
- `groupItemsBy([3 items, 2 with same rule_id], "rule_id")` → 2 groups, correct counts.
- `sumImpact` handles null/undefined impactSek (treat as 0).
- Dedupe key collision: 2 items with same rule_id+scope but different action_type → different groups.

Add `src/test/proposals-grouping.test.tsx` (RTL, render ActionsPipeline):
- Mock `usePipelineItems` to return 5 fixture items (3 sharing rule_id="wasted_spend", 2 sharing action_type="pause_keyword").
- Toggle group-by → assert collapsible headers visible with correct counts.
- Click group checkbox → assert all child checkboxes checked.
- Verify bulk action bar shows correct count and summed impact.

Skip integration tests for actual approve/push API calls — those rely on Supabase auth.

---

## 5. Acceptance criteria

- After `ads-diagnose` finishes, new proposals appear in `ads_change_proposals` within 5s (auto-cascade works).
- Re-running `ads-diagnose` on the same project does NOT duplicate proposals already in `draft`/`approved`/`queued` (dedupe works).
- ActionsPipeline `groupBy=rule_id` collapses 10 wasted-spend findings into 1 accordion row.
- Selecting that accordion checkbox + clicking "Godkänn alla" approves all 10 in one operation.
- Bulk impact bar shows correct sum; >50k triggers confirmation dialog.
- All existing tests still pass + 2 new test files green.
- No regression in single-row approve/push (existing flow untouched).

---

## 6. Files to touch

**New:**
- `supabase/migrations/<ts>_ads_change_proposals_dedupe.sql` — add `dedupe_key` column + unique partial index + backfill.
- `src/test/proposals-batching.test.ts`
- `src/test/proposals-grouping.test.tsx`

**Modified:**
- `supabase/functions/ads-diagnose/index.ts` — invoke ads-build-proposals after run, return `proposals_generated`.
- `supabase/functions/ads-build-proposals/index.ts` — accept `diagnostics_run_id`, compute dedupe_key, upsert with skip-if-active logic.
- `src/lib/actionsPipeline.ts` — add `groupItemsBy`, `sumImpact`, extend `RULE_LABELS` if needed.
- `src/pages/workspace/ActionsPipeline.tsx` — group-by toggle, selection state, bulk action bar, large-batch confirm dialog.
- `src/integrations/supabase/types.ts` — regen for new column.

**NOT touched:** ads-mutate, ads-revert-mutation, AdsAudit.tsx, AdsAuditPlan.tsx, ad_drafts table, strategy_drafts table, ads_recommendation_outcomes table, keyword universe, scoring, LLM prompts.

---

## 7. Migration template

```sql
ALTER TABLE ads_change_proposals
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

UPDATE ads_change_proposals
SET dedupe_key = project_id::text || '::' || COALESCE(rule_id, 'manual') || '::' || COALESCE(scope_label, '') || '::' || action_type
WHERE dedupe_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ads_change_proposals_active_dedupe
  ON ads_change_proposals (project_id, dedupe_key)
  WHERE status IN ('draft','approved','queued');
```

Verify backfill produces no NULL `dedupe_key` rows before adding the unique index.
