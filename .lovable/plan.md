## Översikt

Bygger "Live ⇄ Förslag ⇄ Resultat" — en samlad vy där du ser ditt riktiga Google Ads-konto, AI:ns förslag, kan godkänna och pusha **pausat**, **och** följer upp KPI-effekten av varje pushat förslag automatiskt.

---

## Del 1 — Live-spegel av kontot

**Ny edge-funktion `ads-fetch-account-tree`**: hämtar via GAQL i en request och cachar 15 min i ny tabell `ads_account_tree_cache(project_id, fetched_at, tree jsonb)`:
- Campaigns (id, name, status, channel, budget, bidding_strategy, optimization_score, 30d-metrics)
- Ad groups per campaign (status, default_cpc, type, 30d-metrics)
- Keywords per ad group (text, match_type, status, QS, 30d-metrics)
- Ads per ad group (RSA headlines/descriptions/paths/final_url, ad_strength, status)
- Negative keywords (campaign-nivå + shared sets)

Allt läs-API finns redan i `_shared/google-ads.ts`.

## Del 2 — Förslag och godkännande

**Ny tabell `ads_change_proposals`**:
```
id, project_id, analysis_id?, source ('diagnosis'|'ai_generation'|'manual'|'cluster_expansion'),
action_type, payload jsonb (= det som skickas till ads-mutate),
diff jsonb (before/after för UI),
estimated_impact_sek numeric, baseline_metrics jsonb,
rationale text, evidence jsonb,
status ('draft'|'approved'|'pushed'|'rejected'|'failed'),
push_as_paused bool default true,
mutation_id (FK ads_mutations när pushat),
outcome_id (FK ads_recommendation_outcomes när mätt),
created_by, created_at, updated_at, pushed_at
```
RLS via `is_project_member`.

**Ny edge-funktion `ads-build-proposals`** — bygger draft-proposals automatiskt från:
1. Diagnos (15 regler) → matchande `proposed_actions[0]` blir proposal med rationale + estimated_impact_sek + baseline_metrics-snapshot.
2. Wasted keywords → `pause_keyword`.
3. Negative mining → `add_negative_keyword`.
4. RSA-utkast (`ad_drafts`) som inte finns live → `create_rsa` (PAUSED).
5. Sökord-kluster utan matchande live ad group → `create_ad_group` (PAUSED) + `add_keyword`.

**Utökar `ads-mutate`** med tre nya action_type:
- `create_rsa` — payload: `{ad_group_id, headlines[], descriptions[], path1, path2, final_url, status}` (default PAUSED).
- `create_ad_group` — `{campaign_id, name, default_cpc_micros, status, keywords[]}`.
- `add_keyword` — `{ad_group_id, text, match_type, cpc_micros?, status}`.

Alla create-actions sätter `status: PAUSED` när `push_as_paused=true` → kräver manuell aktivering i Google Ads = säkerhetsnät.

## Del 3 — Resultatmätning (det du frågade efter nu)

Vi har redan två tabeller — `ads_recommendation_outcomes` och `action_outcomes`. Vi kopplar in flödet:

**Snapshot vid push** (i `ads-mutate` när `source_action_item_id` eller proposal_id finns):
- Läs senaste 14d-metrics för impacted scope (campaign/ad_group/keyword/ad) via GAQL.
- Spara som `baseline_metrics` på proposal + skapa rad i `ads_recommendation_outcomes` med `predicted` = estimated_impact + `applied_at`.

**Ny cron-funktion `cron-ads-outcomes`** (finns delvis — utöka):
- Körs dagligen.
- För varje rad i `ads_recommendation_outcomes` där `applied_at` är 14d / 30d gammal och respektive `measured_*` saknas:
  - Hämta nya 14d/30d-metrics för samma scope.
  - Beräkna delta vs `baseline_metrics`: clicks, cost, conversions, conv_value, CPA, ROAS, CTR, QS, impressions, position.
  - Spara i `measured_14d` / `measured_30d` med `delta`, `delta_pct`, `confidence` (low/mid/high baserat på sample size).
  - Markera proposal som `outcome_id` och uppdatera `action_items.tracking_status`.

**KPI-vy i UI** — ny tab "Resultat" i `GoogleAdsHub.tsx`:

Tre nivåer:

1. **Toppraden (period-sammanfattning)** — KPI-cards för konto-nivå, valbar period (7d / 14d / 30d / 90d):
   - Total Spend · Conversions · Conv. Value · CPA · ROAS · CTR · Avg. Position
   - Varje card visar **Now vs Previous Period** + sparkline + delta-pil (lime ↑ / röd ↓).

2. **"Effekt av pushade förslag" (kärnan)** — tabell över alla `proposals` med `status='pushed'` och `outcome_id`:
   - Kolumner: Datum pushad · Action type · Scope · Predicted SEK · Measured 14d (Δ Spend, Δ Conv, Δ ROAS) · Measured 30d · Confidence · Verdict.
   - **Verdict-logik**: 
     - 🟢 Lyckad — uppmätt delta ≥ 70% av predicted i samma riktning.
     - 🟡 Neutral — delta inom ±20% av baseline (för litet urval eller marginell effekt).
     - 🔴 Misslyckad — delta i fel riktning, > 30% sämre. Knapp "Återställ" som triggrar `ads-revert-mutation`.
   - Klick på rad → drawer med graf (daglig metric ±28d kring push-datum, push-datum markerat med vertikal linje), evidence-listan från proposalen, och länk till själva mutationen i logs.

3. **"AI-träffsäkerhet"** — meta-KPI per regel:
   - Per `rule_id`: antal pushade, antal lyckade, %-träffsäkerhet, snitt-delta i SEK.
   - Hjälper dig se vilka regler som faktiskt levererar — och tysta de som inte gör det via `automation_rules.is_active=false`.

**Realtime**: `ads_recommendation_outcomes` + `ads_change_proposals` med `postgres_changes` så cards uppdateras live när cron skriver.

---

## UI-flöde i Google Ads Hub

Tre nya tabbar mellan befintliga:
1. **Kampanjstruktur** — split view: Live-träd (vänster) ⇄ Förslagskö (höger) med approve/edit/reject + "Pusha N godkända (PAUSED)".
2. **Resultat** — KPI-cards + effekttabell + AI-träffsäkerhet (denna del).
3. **Audit** / **Annonsförslag** / **Chat** finns redan.

Diagnosmotorn-bannern högst upp får en counter "12 förslag väntar på godkännande" som länkar till Kampanjstruktur-tabben.

---

## Filer

**Skapas**
- `supabase/functions/ads-fetch-account-tree/index.ts`
- `supabase/functions/ads-build-proposals/index.ts`
- `supabase/functions/ads-snapshot-baseline/index.ts` (anropas från ads-mutate vid push)
- `src/components/workspace/CampaignStructureView.tsx` + `CampaignTree.tsx` + `ProposalQueue.tsx` + `ProposalCard.tsx` + `ProposalEditor.tsx`
- `src/components/workspace/AdsResultsTab.tsx` + `OutcomeTable.tsx` + `OutcomeDrawer.tsx` + `RuleAccuracyCard.tsx`
- `src/hooks/useAccountTree.ts`, `useProposals.ts`, `useAdsOutcomes.ts`

**Ändras**
- `supabase/functions/ads-mutate/index.ts` — nya action_types + baseline-snapshot vid push.
- `supabase/functions/cron-ads-outcomes/index.ts` — utöka till att även mäta proposal-baserade outcomes med 14d/30d-fönster.
- `src/pages/workspace/GoogleAdsHub.tsx` — nya tabbar.
- `src/components/workspace/RecommendationRationale.tsx` — knapp "Skapa förslag".

**DB-migrations**
- `ads_change_proposals` + index på (project_id, status) + RLS.
- `ads_account_tree_cache` + RLS.
- Lägg till `proposal_id` (nullable) på `ads_recommendation_outcomes` för join.

---

## Inte i scope
- Bid simulator API, Smart Bidding-strategi-byten, Performance Max asset-edits.
- Multi-account roll-up (en kund i taget).
- Statistisk signifikanstest mer avancerat än sample-size-confidence (kommer i v2 med Bayesian-modell om vi vill).