# R5 — Account Intelligence (rewrite av CampaignStructure)

**Goal:** Idag är `CampaignTree` en platt snapshot av kontot — den visar struktur men säger inget om *hälsa* eller *vad som hänt*. Operatören får ingen strategisk vy. R5 lyfter den till **Account Intelligence**: en sammanvägd vy som svarar på tre frågor som operatören faktiskt bryr sig om:

1. **"Hur mår mitt konto?"** — aggregerad hälsa, fördelning av budget, struktur-metrics.
2. **"Vilka kampanjer presterar?"** — jämförelsematris med rankning.
3. **"Vad har vi ändrat och funkade det?"** — change-timeline som binder ihop `ads_mutations` ↔ `ads_recommendation_outcomes`.

Allt grundas i **existerande edge functions och tabeller**. Inga nya tabeller, inga nya edge functions, inga nya GAQL-queries.

**Locked discipline (must hold):**
- Inga scoring-ändringar.
- Inga LLM-prompt-ändringar.
- **Inga nya tabeller.** Återanvänd `ads_account_tree_cache`, `ads_mutations`, `ads_recommendation_outcomes`, `ads_change_proposals`, `ads_audits`.
- **Inga nya edge functions.** Återanvänd `ads-fetch-account-tree` och direkt Supabase-läsning.
- **Behåll `CampaignTree.tsx` orörd.** Den får leva kvar som "Detaljerad struktur"-flik. R5 lägger en NY vy ovanpå.
- Out of scope: Cannibalization detector, negative coverage gap-analys, RSA cross-campaign rollup — dessa hör till R5-followup-A/B/C.

---

## 1. Översikt — vad som byggs

En ny route `/workspace/:slug/account-intelligence` med tre stackade paneler:

```
┌─ Account Intelligence ─────────────────────────────────┐
│ [Panel 1: Account Health Card]                         │
│ ├─ Strukturmetrics (campaigns, ad groups, keywords)    │
│ ├─ Budget-fördelning (top 5 kampanjer)                 │
│ └─ Outcome-rollup senaste 30/90d                       │
├────────────────────────────────────────────────────────┤
│ [Panel 2: Campaign Comparison Matrix]                  │
│ └─ Tabell: budget, spend, CTR, ROAS, CPA, antal kw,    │
│    %negatives, mutation-count 30d, hälsoscore          │
├────────────────────────────────────────────────────────┤
│ [Panel 3: Change Timeline]                             │
│ └─ Tidslinje: mutations + measured outcomes per dag    │
│    Klick på rad → drilldown via befintlig              │
│    ads-outcome-timeseries                              │
└────────────────────────────────────────────────────────┘
```

Plus en knapp/länk i `Performance.tsx` och `CampaignTree.tsx` som öppnar den nya vyn: "Visa Account Intelligence".

---

## 2. Datakällor (alla existerar redan)

| Källa | Användning |
|---|---|
| `ads-fetch-account-tree` edge | Full träd-snapshot (cache 15min). Källa till strukturmetrics + comparison matrix. |
| `ads_mutations` table | Change timeline (action_type, status, applied_at, reverted_at, auto_reverted_at). |
| `ads_recommendation_outcomes` table | Outcome rollup (predicted, measured_7d/14d/30d, auto_revert_reason). |
| `ads_change_proposals` table | Join för rationale + scope_label på timeline-items. |
| `ads_audits` table | Senaste health_score (om finns) — visa i header på Panel 1. |
| `ads-outcome-timeseries` edge | Drilldown i Panel 3 (redan implementerad). |

**Verifiera:** `ads_account_tree_cache.tree` är en JSONB med shape `{customer_id, campaigns: [...]}` enligt ads-fetch-account-tree (Performance.tsx använder den redan via CampaignTree). Återanvänd samma fetcher.

---

## 3. Ny route + page

**Ny fil: `src/pages/workspace/AccountIntelligence.tsx`**

- Route: `/workspace/:slug/account-intelligence` (lägg till i `workspaceRoutes.ts`).
- Lazy-loaded i `App.tsx` (samma pattern som övriga workspace-pages).
- Header: projektnamn + customer_id + senaste cache-tid + refresh-knapp.
- Body: tre paneler (se nedan).
- Återanvänd `WorkspaceLayout`, `DataSourceAlerts`, `SourceFallback` (gating på `ads`-källa, samma pattern som `Performance.tsx`).
- Om `ads`-källa är `not_connected`/`reauth_required`/`error` → visa `SourceFallbackPanel` istället för paneler (precis som Performance gör).

**Sidolänk:** Lägg till "Account Intelligence" i workspace-navigationen (`src/components/workspace/WorkspaceSidebar.tsx` eller motsv.) ovanför "Performance".

---

## 4. Panel 1 — Account Health Card

**Ny komponent: `src/components/workspace/AccountHealthCard.tsx`**

**Props:** `{ projectId: string; customerId: string | null }`

**Data:**
- Hämta tree via `ads-fetch-account-tree` (samma edge `supabase.functions.invoke("ads-fetch-account-tree", { body: { project_id, customer_id } })`).
- Hämta senaste `ads_audits` row per project_id (för `health_score`).
- Hämta `ads_recommendation_outcomes` senaste 90d för projektet.

**Visa:**

### 4.1 Strukturmetrics (rad 1)
4 KPI-kort med ikoner + tal + sublabel:
- **Kampanjer:** `tree.campaigns.length` (enabled/total — räkna `status === "ENABLED"`).
- **Ad groups:** sum av `campaign.ad_groups.length` över alla kampanjer.
- **Keywords:** sum av alla `keywords.length` över alla ad groups.
- **Negatives:** sum av `campaign.negatives.length` över alla kampanjer.

### 4.2 Budget-fördelning (rad 2)
Stacked horizontal bar eller donut av top 5 kampanjer efter `daily_budget_sek` + "Övriga". Använd shadcn/ui `Progress` eller en enkel `<div>` med procentuella bredder.

### 4.3 Outcome-rollup (rad 3)
Aggregera `ads_recommendation_outcomes` rows where `applied_at >= now - 30d`:
- **Mutations applied (30d):** count of rows with `applied_at IS NOT NULL`.
- **Measured (14d+):** count where `measured_14d IS NOT NULL`.
- **Net positive impact:** count where `(measured_14d.delta_pct.conversions ?? 0) > 0` — sublabel: `X av Y mätta`.
- **Auto-reverts (30d):** count where `auto_reverted_at IS NOT NULL`. Klick → filtrera Panel 3 timeline.

### 4.4 Health score (header right)
Om senaste `ads_audits.health_score` finns, visa som badge med färgkod:
- 80–100: grön
- 60–79: gul
- <60: röd
Om saknas: "Inget audit körts än" + länk till `/workspace/:slug/ads-audit`.

---

## 5. Panel 2 — Campaign Comparison Matrix

**Ny komponent: `src/components/workspace/CampaignComparisonMatrix.tsx`**

**Props:** Återanvänd tree från Panel 1 via context eller prop drilling (lyft fetchen till `AccountIntelligence.tsx`).

**Tabell-kolumner (sortable, default sort = spend desc):**

| Kolumn | Härledning |
|---|---|
| Kampanj | `campaign.name` + status-badge (ENABLED/PAUSED) |
| Daglig budget | `campaign.daily_budget_sek` |
| Spend 30d | `campaign.metrics_30d.cost_sek` |
| CTR | `campaign.metrics_30d.ctr` (formattera som %) |
| ROAS | `campaign.metrics_30d.roas` (visa "–" om null) |
| CPA | `campaign.metrics_30d.cpa_sek` |
| Keywords | sum `ad_groups.keywords.length` |
| Negatives | `campaign.negatives.length` |
| Mutations 30d | räkna `ads_mutations` rows where `payload->>'campaign_id' = campaign.id` AND `created_at >= now - 30d` (eller via joinad query upfront) |
| Hälsa | derive: grön om ROAS >= target_roas eller CPA <= target_cpa, gul om saknas mål, röd om underpresterar. Pure function `deriveCampaignHealth(campaign)` i `src/lib/accountIntelligence.ts`. |

**Funktioner:**
- Sortera klickbart på varje kolumn.
- Klick på radens namn → öppnar `CampaignTree.tsx` på den specifika kampanjen (passera `expandedCampaignId` via state eller URL-param). Om för komplex att binda: bara länka till Performance-sidan.
- Inga edit-actions — det här är **read-only intelligence**.

---

## 6. Panel 3 — Change Timeline

**Ny komponent: `src/components/workspace/ChangeTimeline.tsx`**

**Props:** `{ projectId: string }`

**Data:** Join `ads_mutations` med `ads_recommendation_outcomes` och `ads_change_proposals`:

```ts
const { data: mutations } = await supabase
  .from("ads_mutations")
  .select(`
    id, action_type, status, created_at, applied_at, reverted_at,
    payload, response, proposal_id,
    proposal:ads_change_proposals (scope_label, rationale, estimated_impact_sek),
    outcome:ads_recommendation_outcomes!ads_recommendation_outcomes_mutation_id_fkey (
      id, predicted, measured_7d, measured_14d, measured_30d, auto_reverted_at, auto_revert_reason
    )
  `)
  .eq("project_id", projectId)
  .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
  .order("created_at", { ascending: false })
  .limit(200);
```

**Verifiera FK-namn** — om `ads_recommendation_outcomes.mutation_id` FK heter annat, justera. Om join inte funkar via PostgREST, gör två queries och joina i klient.

**Visa som tidslinje grupperad per dag:**

```
─ 2026-05-22 ─────────────────────────────────────────
  ⏸ 14:32  Pausat 3 keywords i "Brand SE"
           scope: Brand SE › Generic › "billiga skor"
           Mätning 7d: konverteringar +12%, kostnad -8%  ✓
  ➕ 09:15  Lade till 5 negatives i "Generic"
           Auto-reverted (CTR -22%)                       ⟲
─ 2026-05-21 ─────────────────────────────────────────
  ✏️  16:04  Bytte RSA-headline (ad_id: 12345)
           Predicted CTR +5%. Mätning 14d pågår...        ⏳
```

**Per item:**
- Ikon baserat på `action_type` (pause = ⏸, add_negative = ➕, rsa_replace = ✏️, etc).
- Title från `proposal.scope_label || action_type`.
- Subtitle: `proposal.rationale` (truncated 2 lines).
- Status-badge:
  - ✓ "Mätt positivt" om `measured_*` finns och delta är positiv
  - ✗ "Mätt negativt" om delta är negativ
  - ⟲ "Auto-reverterad" om `auto_reverted_at` finns (+ tooltip med `auto_revert_reason`)
  - ⟲ "Manuell revert" om `reverted_at` finns men inte `auto_reverted_at`
  - ⏳ "Mätning pågår" om `applied_at` finns men ingen `measured_*` än
  - ❌ "Misslyckades" om `status === "failed"`

**Drilldown:** Klick på en rad → `Sheet` (shadcn) som visar:
- Full `payload` + `response` (collapsible JSON).
- Outcome before/after metrics tabell.
- "Visa tidsserie" knapp → invokar `ads-outcome-timeseries` (redan implementerad) och renderar enkel line chart med befintlig recharts-setup.
- Om `proposal.rationale` finns: visa full text.

**Filter:**
- Knappar i header: "Alla" / "Senaste 7d" / "Senaste 30d" / "Senaste 90d".
- Filter på action_type (multi-select dropdown).
- Filter "Visa endast auto-reverterade" (toggle).

---

## 7. Pure helper: `src/lib/accountIntelligence.ts`

Innehåll:

```ts
import type { /* tree types — återanvänd från CampaignTree.tsx, lyft ut till en delad types-fil om nödvändigt */ } from "./...";

export type CampaignHealth = "good" | "warn" | "bad" | "unknown";

export function deriveCampaignHealth(campaign: {
  metrics_30d?: { roas?: number | null; cpa_sek?: number | null; cost_sek?: number | null };
  target_roas?: number | null;
  target_cpa_sek?: number | null;
}): CampaignHealth {
  const roas = campaign.metrics_30d?.roas;
  const cpa = campaign.metrics_30d?.cpa_sek;
  const cost = campaign.metrics_30d?.cost_sek ?? 0;
  if (cost < 100) return "unknown"; // för låg spend för att uttala sig
  if (campaign.target_roas != null && typeof roas === "number") {
    return roas >= campaign.target_roas ? "good" : "bad";
  }
  if (campaign.target_cpa_sek != null && typeof cpa === "number") {
    return cpa <= campaign.target_cpa_sek ? "good" : "bad";
  }
  return "warn"; // har spend men inget mål satt
}

export function summarizeOutcomes(
  outcomes: Array<{ applied_at?: string | null; measured_14d?: any; auto_reverted_at?: string | null }>,
  windowDays: 30 | 90 = 30,
): {
  applied: number;
  measured: number;
  positive: number;
  negative: number;
  autoReverted: number;
} {
  const cutoff = Date.now() - windowDays * 86400000;
  const inWindow = outcomes.filter(
    (o) => o.applied_at && new Date(o.applied_at).getTime() >= cutoff,
  );
  let applied = 0, measured = 0, positive = 0, negative = 0, autoReverted = 0;
  for (const o of inWindow) {
    applied++;
    if (o.measured_14d) {
      measured++;
      const conv = o.measured_14d?.delta_pct?.conversions;
      if (typeof conv === "number") {
        if (conv > 0) positive++;
        else if (conv < 0) negative++;
      }
    }
    if (o.auto_reverted_at) autoReverted++;
  }
  return { applied, measured, positive, negative, autoReverted };
}

export function pickTopCampaignsByBudget<T extends { name: string; daily_budget_sek?: number | null }>(
  campaigns: T[],
  topN: number = 5,
): { top: T[]; otherTotal: number } {
  const sorted = [...campaigns].sort(
    (a, b) => (b.daily_budget_sek ?? 0) - (a.daily_budget_sek ?? 0),
  );
  const top = sorted.slice(0, topN);
  const otherTotal = sorted.slice(topN).reduce((sum, c) => sum + (c.daily_budget_sek ?? 0), 0);
  return { top, otherTotal };
}
```

---

## 8. Trust gating — wire in på CampaignTree

**Modifiera: `src/components/workspace/CampaignTree.tsx`**

Lägg till per keyword-rad:
- Importera `lookupIdeaStatus` från `@/lib/ideaStatus`.
- Importera `UnverifiedIdeaBadge` från `@/components/keywords/UnverifiedIdeaBadge`.
- Hämta `universe` via `useWorkspaceAnalysis()` eller motsv (samma pattern som ActionsPipeline använder).
- För varje keyword-rad: `const status = lookupIdeaStatus(universe, keyword.text); if (status === "unverified_idea") <UnverifiedIdeaBadge />`.

**Inga andra ändringar i CampaignTree.** Den behåller sitt befintliga tree-display-syfte.

---

## 9. Tester

**Ny fil: `src/test/account-intelligence.test.ts`** (pure logic, 5–7 tester):

```ts
import { describe, it, expect } from "vitest";
import {
  deriveCampaignHealth,
  summarizeOutcomes,
  pickTopCampaignsByBudget,
} from "@/lib/accountIntelligence";

describe("deriveCampaignHealth", () => {
  it("returns 'unknown' when cost < 100 SEK", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 50, roas: 0.5 }, target_roas: 2 })).toBe("unknown");
  });
  it("returns 'good' when roas >= target_roas", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 5000, roas: 3 }, target_roas: 2 })).toBe("good");
  });
  it("returns 'bad' when roas < target_roas", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 5000, roas: 1 }, target_roas: 2 })).toBe("bad");
  });
  it("returns 'good' when cpa <= target_cpa", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 5000, cpa_sek: 50 }, target_cpa_sek: 100 })).toBe("good");
  });
  it("returns 'warn' when no target set but has spend", () => {
    expect(deriveCampaignHealth({ metrics_30d: { cost_sek: 5000 } })).toBe("warn");
  });
});

describe("summarizeOutcomes", () => {
  it("counts only outcomes within window", () => {
    const now = Date.now();
    const outcomes = [
      { applied_at: new Date(now - 5 * 86400000).toISOString(), measured_14d: { delta_pct: { conversions: 10 } } },
      { applied_at: new Date(now - 40 * 86400000).toISOString(), measured_14d: { delta_pct: { conversions: 10 } } },
    ];
    const r = summarizeOutcomes(outcomes, 30);
    expect(r.applied).toBe(1);
    expect(r.measured).toBe(1);
    expect(r.positive).toBe(1);
  });
  it("counts auto-reverted", () => {
    const now = Date.now();
    const outcomes = [
      { applied_at: new Date(now - 1 * 86400000).toISOString(), auto_reverted_at: new Date().toISOString() },
    ];
    expect(summarizeOutcomes(outcomes, 30).autoReverted).toBe(1);
  });
});

describe("pickTopCampaignsByBudget", () => {
  it("returns top N and remainder", () => {
    const campaigns = [
      { name: "A", daily_budget_sek: 100 },
      { name: "B", daily_budget_sek: 50 },
      { name: "C", daily_budget_sek: 30 },
      { name: "D", daily_budget_sek: 20 },
    ];
    const r = pickTopCampaignsByBudget(campaigns, 2);
    expect(r.top.map((c) => c.name)).toEqual(["A", "B"]);
    expect(r.otherTotal).toBe(50);
  });
});
```

Skip integration-tester för render — RTL-test för AccountHealthCard kan läggas till om enkelt, men inte krav.

---

## 10. Acceptance criteria

- Ny route `/workspace/:slug/account-intelligence` finns och är registrerad i `workspaceRoutes.ts` + `App.tsx`.
- Workspace-navigation har "Account Intelligence" länk.
- `AccountIntelligence.tsx` renderar tre paneler.
- Panel 1: 4 strukturmetrics + budget-fördelning + outcome-rollup + health score.
- Panel 2: sorterbar tabell över alla kampanjer med 10 kolumner enligt §5.
- Panel 3: tidslinje senaste 90d, gruperad per dag, med status-badges + Sheet-drilldown.
- `CampaignTree.tsx` visar `UnverifiedIdeaBadge` per keyword när `lookupIdeaStatus` returnerar `"unverified_idea"`.
- `src/lib/accountIntelligence.ts` exporterar `deriveCampaignHealth`, `summarizeOutcomes`, `pickTopCampaignsByBudget`.
- `src/test/account-intelligence.test.ts` har ≥7 tester, alla gröna.
- Alla 224 existerande tester gröna.
- `npx tsc --noEmit` clean.
- `SourceFallback` används för `ads`-källan på AccountIntelligence-sidan (samma pattern som Performance).
- Inga nya tabeller, inga nya edge functions, inga nya migrations.

---

## 11. Filer att röra

**Nya:**
- `src/pages/workspace/AccountIntelligence.tsx`
- `src/components/workspace/AccountHealthCard.tsx`
- `src/components/workspace/CampaignComparisonMatrix.tsx`
- `src/components/workspace/ChangeTimeline.tsx`
- `src/lib/accountIntelligence.ts`
- `src/test/account-intelligence.test.ts`

**Modifierade:**
- `src/App.tsx` — lazy-route registrering
- `src/lib/workspaceRoutes.ts` — ny route + meta
- `src/components/workspace/WorkspaceSidebar.tsx` (eller motsv navigation) — länk
- `src/components/workspace/CampaignTree.tsx` — `UnverifiedIdeaBadge` per keyword
- `src/pages/workspace/Performance.tsx` — länk "Visa Account Intelligence" ovanför CampaignTree-sektionen

**INTE rörda:**
- `supabase/functions/ads-fetch-account-tree/index.ts` — anropas, inte modifierad
- `supabase/functions/ads-outcome-timeseries/index.ts` — anropas i drilldown, inte modifierad
- `supabase/functions/ads-audit|ads-diagnose|ads-build-proposals|ads-wasted-spend|ads-negative-mining|ads-rsa-performance|ads-pacing/*` — orörda
- Scoring, LLM-prompts
- Keyword universe, content briefs, action_items, prelaunch blueprint
- `ads_change_proposals|ads_mutations|ads_recommendation_outcomes` schema — orörda

---

## 12. Säkerhetsnät / edge cases

- **Tom kontodata:** Om `ads-fetch-account-tree` returnerar `{tree: {campaigns: []}}` → visa empty state per panel ("Inga kampanjer hittade. Anslut Google Ads för att se data."). Använd `SourceFallback` för anslutningsproblem.
- **Saknad `mutation_id` på outcomes:** Visa outcome i Panel 3 utan koppling till proposal/rationale (subtitle blir tomt eller `action_type`).
- **Saknad `proposal_id` på mutations:** Visa mutation i Panel 3 utan rationale.
- **Stora kontot (100+ kampanjer):** Panel 2 tabellen ska scrolla horisontellt + lazy-render (rendera bara synliga rader om enkelt, annars OK med alla).
- **Outcome utan `measured_14d` men `measured_7d` finns:** prio på measured_14d > measured_7d > measured_30d i rollup. Om bara measured_7d → räkna som "mätt".
- **Trust gating på CampaignTree:** Om `universe` inte är laddat → rendera bara texten utan badge (graceful). Ingen blocking spinner.
- **Health score saknas:** Visa "Inget audit körts än" + CTA-länk till `/workspace/:slug/ads-audit`.

---

## 13. Notes

- **Design language:** Använd samma palett som Performance.tsx + ActionsPipeline.tsx (shadcn Card, Badge, Tabs). Inga nya färgvariabler.
- **Translation:** Svensk UI genomgående — labels i `METRIC_LABEL`-stil där det passar.
- **Loading:** Skeleton loaders per panel under fetch.
- **Performance:** Hämta tree EN gång i `AccountIntelligence.tsx`, prop-drilla till Panel 1 + 2. Panel 3 har sin egen query.
- **Inga side effects:** Den här vyn är **read-only**. Inga mutationer, inga approval-actions. Operatören går till ActionsPipeline för att agera.
- **Vad detta INTE är:** Det här ersätter inte AdsAudit (tactical). Det kompletterar med strategisk vy. CampaignTree (live detail) finns kvar.
