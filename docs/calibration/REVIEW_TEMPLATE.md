# Commercial Growth Intelligence — Calibration Review Template

**Step 6 — Shadow-mode calibration.** Use this template once per project that you calibrate against. Fill in by hand (or paste raw SQL results). Do not infer findings — record only what the data shows.

> **Rule:** Do not change scoring formulas, weights, gates, or LLM prompts during Step 6. This document captures _evidence_. Calibration changes happen in a subsequent step, only when an issue is named and reproducible.

---

## 0. Run metadata

| Field | Value |
|---|---|
| Project id | `<uuid>` |
| Project name | |
| Operator reviewer | |
| Date of review | YYYY-MM-DD |
| `shadow_run_results.id` | `<uuid>` |
| `model_version` | |
| `signals_version` | |
| Verdicts fetched | |
| Scores fetched | |
| DCs fetched | |
| Total runtime (ms) | |

Trigger the run via:

```ts
await supabase.functions.invoke("commercial-intelligence-shadow-run", {
  body: { project_id: "<uuid>", top_n_keywords: 1000, top_n_actions: 500, sample_n: 20 },
});
```

---

## 1. Headline counts (query A)

Are intelligence tables populated? Zero rows in any of these means the production builders haven't run yet — calibrate after they have.

| Table | Row count |
|---|---|
| commercial_intent_labels | |
| opportunity_scores | |
| decision_context | |
| action_items | |
| ads_change_proposals | |
| shadow_run_results | |

**Issues observed:** _none / list_

---

## 2. Opportunity score distribution (queries C, D, E, H)

### Band distribution

| Band | n | mean_score | mean_confidence |
|---|---|---|---|
| critical | | | |
| high | | | |
| medium | | | |
| low | | | |
| veto | | | |

**Sanity rubric:**
- `high` + `critical` combined > 30 % → suspect — the formula may be too generous.
- `low` + `veto` combined > 70 % → expected for cold-start projects; should drop as signals accumulate.
- `medium` near zero → distribution is bimodal; likely a single dominant component is splitting outcomes.

### Top-20 review (query D)

Paste IDs + 1-line verdict ("commercially sensible" / "questionable" / "wrong"). Do NOT change the formula yet.

| # | scope_id | score | top3_components | verdict | notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| ... | | | | | |
| 20 | | | | | |

### Bottom-20 review (query E)

Are these legitimately weak, or is the formula penalising something legitimate?

| # | scope_id | score | components | verdict | notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| ... | | | | | |

### Component contribution (query H)

| component | appearances | mean_points | mean_rank |
|---|---|---|---|
| | | | |

**Sanity rubric:**
- One component dwarfing others by ≥ 3× → likely over-weighted.
- A component with appearances near zero across top quartile → either rarely meaningful here or under-weighted.

---

## 3. Veto review (queries F, G)

### Veto frequency

| veto_code | n |
|---|---|
| | |

### Vetoed-but-borderline cases (top 10)

Identify any opportunity that was vetoed but where a human operator would have proceeded. Record veto code + reason it feels wrong.

| scope_id | veto_code(s) | manual judgement | reason |
|---|---|---|---|

---

## 4. Confidence calibration (queries C, I)

### Low-confidence sample (< 0.4)

| scope_id | confidence | components | gates likely firing |
|---|---|---|---|

**Sanity rubric:**
- Low-confidence rows with rich evidence in `decision_context` → confidence gate is too aggressive.
- Low-confidence rows with thin evidence → gate is working correctly.

---

## 5. DecisionContext quality (queries J, K, M, N)

### DC headline

| metric | value |
|---|---|
| total | |
| zero_evidence | |
| mean_evidence | |
| high_conf / medium / low | / / |
| narrative_generated / failed / skipped | / / |

**Healthy targets (initial guidance, not gates):**
- `zero_evidence` should be **0** or near-zero. Anything > 5 % is a bug — DCs without evidence violate the evidence-first contract.
- `narrative_failed` should be **< 10 %** when narrative is enabled. Higher means LLM is being asked to write narratives without enough evidence and citation validation is rejecting them.

### Gate-trigger frequency

| trigger_code | n |
|---|---|
| | |

### Per-source coverage (% of DCs)

| source | coverage |
|---|---|
| gsc | |
| ga4 | |
| google_ads | |
| operator | |
| model | |
| ads_mutation | |
| outcome_learning | |

**Sanity rubric:**
- Both `gsc` and `ga4` coverage near 0 % → signal ingestion is missing; calibration is meaningless until fixed.
- Only one source dominates → DCs are not triangulating; expect `RC_DC_LIMITED_CROSS_SOURCE` to be frequent.

### Zero-evidence DCs

Investigate each manually. Either evidence assembly is failing or the source action has no upstream signal.

| dc_id | scope_kind | confidence_band | gates | likely cause |
|---|---|---|---|---|

---

## 6. Action coverage (query L)

How many `action_items` have no corresponding `decision_context`?

- Action items total: \_\_\_
- Action items with DC: \_\_\_
- Action items missing DC: \_\_\_

Investigate the missing set. Likely causes: production worker hasn't been triggered for them yet, or the scope resolver failed silently.

---

## 7. Verdict quality (queries O, P, Q)

### Intent × buyer-stage distribution

| search_intent | buyer_stage | lead_quality | n | mean_intent | mean_confidence |
|---|---|---|---|---|---|
| | | | | | |

**Sanity rubric:**
- `informational` + `unaware`/`problem_aware` should dominate raw keyword universes. If transactional + ready_to_buy dominates the entire universe, the classifier is over-confident.
- `confidence` mean < 0.4 → not enough SERP/business signal; verdicts are guesses.

### Top-20 verdicts

| keyword | intent | stage | intent_score | lead | acq_approach | p50 SEK | verdict (manual) |
|---|---|---|---|---|---|---|---|

### Verdicts with empty evidence

Should be 0. Anything here is a contract violation.

---

## 8. ContextSheet UX — manual operator test

Open ≥ 5 different action items in the Today view → click **Visa kontext**. Record:

| action_item_id | did the sheet answer "why should I do this?" in < 10s? | sections fired | notable gaps |
|---|---|---|---|

**Specific things to check:**
- [ ] Evidence section is present before narrative
- [ ] Confidence footer shows a band and gate labels
- [ ] Next-step section makes sense for the action
- [ ] Analogs collapse stays closed by default
- [ ] Footer actions are ≤ 3 and the primary CTA is unambiguous
- [ ] Narrative (if generated) cites at least one evidence id
- [ ] Empty sections are hidden, not shown empty

Record any UX friction observed. Do not change UI yet — log only.

---

## 9. Findings summary

### Bad scoring examples
_(list scope_id + reason — one bullet each)_

### Bad reason codes / gates
_(list gate code + frequency that feels wrong + reason)_

### Weak / missing evidence patterns
_(list source × DC pattern, eg. "ads DCs never have ga4 evidence")_

### ContextSheet UX issues
_(bullet list)_

### Confidence calibration concerns
_(eg. "confidence < 0.4 rows actually look high-quality")_

### Veto false-positives
_(list scope_id + veto code)_

---

## 10. Decision

- [ ] **Safe to feature-flag for real usage.** Observed distributions match operator expectation. Findings are minor and tracked.
- [ ] **Hold for calibration.** Specific issues block rollout. Listed above. Next planning step is calibration changes against these findings — not blind tuning.
- [ ] **Hold for data quality.** Inputs are too sparse to calibrate. Need more `gsc_snapshots` / `ga4_snapshots` / verdicts before reviewing again.

Reviewer signature: _________________________ Date: __________

---

## 11. What this review intentionally does NOT do

- It does not change scoring weights, gates, thresholds, or LLM prompts.
- It does not produce synthetic examples or fabricated findings.
- It does not benchmark against unrelated projects.
- It does not run any pipeline that writes to `commercial_intent_labels`, `opportunity_scores`, or `decision_context`.

Calibration changes — if any — are a separate, named step with their own evidence trail.
