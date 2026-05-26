# R9 — Decision Context Auto-Rebuild on Version Mismatch

**Status:** ✅ Already shipped agent-side on `main` (commit `21a4476`).

**Purpose:** Document R9 in the same prompt archive as R3c/R4/R5/R7/R8.
This sprint closed the cache-invalidation gap after R8: old
`decision_context` rows (`model_version = decision-context-v1.0.0`) were
still shown until someone clicked "Bygg om" manually.

**Scope:** Frontend-only fallback that rebuilds stale decision contexts
transparently when opened.

## Boundaries (locked)

- No new tables.
- No migrations.
- No new edge functions.
- No changes in `supabase/functions/*`.
- No scoring changes.
- No LLM prompt changes.
- No public API break.

## Problem Statement

After R8, builders produced `decision-context-v1.1.0`, but many existing rows
remained on `v1.0.0`. Users therefore saw old panel output (missing deltas,
weak evidence excerpts, stale section semantics) unless they manually clicked
"Bygg om" per item.

## Acceptance Criteria

A. When `useDecisionContext` fetches a row where
`data.model_version !== CURRENT_DECISION_CONTEXT_MODEL_VERSION`, it must
trigger `build({ force: true })` automatically.

B. Auto-rebuild must run at most once per scope+stale-version key to prevent
looping if backend still returns stale data.

C. While stale data is being rebuilt, panel body must not render stale content.
Show loading state until fresh row is fetched.

D. If fetched row already matches current model version, no auto-rebuild call
should be made.

E. Full test suite remains green.

## Implemented Changes

1. `src/lib/decisionContextVersion.ts` (new)
- Added `CURRENT_DECISION_CONTEXT_MODEL_VERSION = "decision-context-v1.1.0"`.
- Marked as frontend mirror of edge-side constant.

2. `src/hooks/useDecisionContext.ts`
- Added stale-version detection against current frontend constant.
- Added guarded auto-rebuild effect with `autoRebuiltRef` key:
  `${ref.kind}:${ref.id}:${staleVersion}`.
- Exposed `isStale` to consumers.

3. `src/components/context/ContextSheet.tsx`
- Consumes `isStale` from hook.
- Hides body and shows loading state during stale auto-rebuild in flight.

4. `src/test/decision-context-auto-rebuild.test.tsx` (new)
- Added 4 tests:
  - triggers force rebuild on stale version
  - does not rebuild when version already current
  - guard prevents rebuild loops
  - stale body hidden while rebuild in flight

## Verification

- `vitest`: 248/248 passing.
- `tsc --noEmit`: clean.

## Outcome

R8 is now effectively deployed for old and new items alike. Users no longer
need manual rebuild clicks to migrate stale decision contexts to current model
output.
