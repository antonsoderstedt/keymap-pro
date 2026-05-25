// -----------------------------------------------------------------------------
// applyOperatorControls — PURE.
//
// Operator controls are user-recorded inputs (theme_boost, theme_deprioritize,
// strategic_lock, veto, capacity, approach_override, mute). They are applied
// AFTER raw weighted scoring, with strict bounds, and every applied control is
// logged into multipliers_applied / vetoes_triggered.
//
// Rules (locked):
//   - veto      : forces final score to 0, score_band="veto", vetoes_triggered.
//   - mute      : same as veto (no surfacing).
//   - capacity  : if value.capacity === "suspended"        -> veto.
//                 if value.capacity === "at_capacity"      -> mult *= 0.85.
//                 otherwise                                -> noted only.
//   - theme_boost          : mult in [1.00, 1.20], clamped.
//   - theme_deprioritize   : mult in [0.80, 1.00], clamped.
//   - strategic_lock       : mult = 1.15 (fixed).
//   - approach_override    : recorded only; does NOT change the score.
//
// Multipliers compound multiplicatively. Combined multiplier is clamped to
// [0.5, 1.5] as an absolute safety bound so any single set of controls cannot
// flip a score by more than ±50%.
//
// Scope match rules:
//   - control.scope.theme_id matches input.mapped_theme_id (if both present)
//   - control.scope.cluster_id matches input.scope_kind="cluster" + scope_id
//   - control.scope.opportunity_id matches input.scope_kind="opportunity" + scope_id
//   - control.scope.service_id matches input.mapped_service_id
//   - empty scope object => project-wide
// -----------------------------------------------------------------------------

import {
  OPERATOR_CAPACITY_AT_CAPACITY_MULT,
  OPERATOR_THEME_BOOST_RANGE,
  OPERATOR_THEME_DEPRIORITIZE_RANGE,
  STRATEGIC_LOCK_MULT,
} from "./constants.ts";

export type OperatorControlKind =
  | "theme_boost"
  | "theme_deprioritize"
  | "strategic_lock"
  | "veto"
  | "capacity"
  | "approach_override"
  | "mute";

export interface OperatorControlLite {
  id: string;
  control_kind: OperatorControlKind;
  scope: {
    theme_id?: string;
    cluster_id?: string;
    opportunity_id?: string;
    service_id?: string;
  };
  value: Record<string, unknown>;
  reason?: string;
  active: boolean;
}

export interface OperatorScopeMatch {
  scope_kind: "keyword" | "cluster" | "opportunity";
  scope_id: string;
  mapped_theme_id?: string;
  mapped_service_id?: string;
}

export interface OperatorApplication {
  multiplier: number;                          // combined, clamped
  multipliers_applied: Record<string, number>; // by control_kind:control_id
  vetoes_triggered: string[];                  // control_id list
  approach_override?: string;                  // last-write-wins among active
  reason_codes_added: string[];
  evidence_added: { id: string; source: string; source_id?: string }[];
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

function controlMatches(
  c: OperatorControlLite,
  m: OperatorScopeMatch,
): boolean {
  if (!c.active) return false;
  const s = c.scope ?? {};
  // empty scope => project-wide
  const isEmpty =
    !s.theme_id && !s.cluster_id && !s.opportunity_id && !s.service_id;
  if (isEmpty) return true;
  if (s.theme_id && s.theme_id === m.mapped_theme_id) return true;
  if (s.service_id && s.service_id === m.mapped_service_id) return true;
  if (s.cluster_id && m.scope_kind === "cluster" && s.cluster_id === m.scope_id)
    return true;
  if (
    s.opportunity_id &&
    m.scope_kind === "opportunity" &&
    s.opportunity_id === m.scope_id
  )
    return true;
  return false;
}

export function applyOperatorControls(
  match: OperatorScopeMatch,
  controls: OperatorControlLite[],
): OperatorApplication {
  let mult = 1.0;
  const multipliers: Record<string, number> = {};
  const vetoes: string[] = [];
  const reasonCodes: string[] = [];
  const evidence: { id: string; source: string; source_id?: string }[] = [];
  let approachOverride: string | undefined;

  for (const c of controls) {
    if (!controlMatches(c, match)) continue;
    const key = `${c.control_kind}:${c.id}`;
    evidence.push({ id: key, source: "operator_controls", source_id: c.id });

    switch (c.control_kind) {
      case "veto":
      case "mute":
        vetoes.push(c.id);
        reasonCodes.push("RC_OPERATOR_VETO");
        break;

      case "theme_boost": {
        const raw = Number((c.value as { multiplier?: unknown }).multiplier ?? 1.1);
        const m = clamp(raw, OPERATOR_THEME_BOOST_RANGE[0], OPERATOR_THEME_BOOST_RANGE[1]);
        multipliers[key] = m;
        mult *= m;
        reasonCodes.push("RC_OPERATOR_THEME_BOOST");
        break;
      }

      case "theme_deprioritize": {
        const raw = Number((c.value as { multiplier?: unknown }).multiplier ?? 0.9);
        const m = clamp(raw, OPERATOR_THEME_DEPRIORITIZE_RANGE[0], OPERATOR_THEME_DEPRIORITIZE_RANGE[1]);
        multipliers[key] = m;
        mult *= m;
        reasonCodes.push("RC_OPERATOR_THEME_DEPRIO");
        break;
      }

      case "strategic_lock": {
        multipliers[key] = STRATEGIC_LOCK_MULT;
        mult *= STRATEGIC_LOCK_MULT;
        reasonCodes.push("RC_STRATEGIC_LOCK_APPLIED");
        break;
      }

      case "capacity": {
        const cap = String((c.value as { capacity?: unknown }).capacity ?? "");
        if (cap === "suspended") {
          vetoes.push(c.id);
          reasonCodes.push("RC_OPERATOR_CAPACITY_OVERRIDE", "RC_CAPACITY_SUSPENDED");
        } else if (cap === "at_capacity") {
          multipliers[key] = OPERATOR_CAPACITY_AT_CAPACITY_MULT;
          mult *= OPERATOR_CAPACITY_AT_CAPACITY_MULT;
          reasonCodes.push("RC_OPERATOR_CAPACITY_OVERRIDE", "RC_CAPACITY_AT_CAPACITY");
        } else {
          reasonCodes.push("RC_OPERATOR_CAPACITY_OVERRIDE");
        }
        break;
      }

      case "approach_override": {
        const a = (c.value as { approach?: unknown }).approach;
        if (typeof a === "string") approachOverride = a;
        reasonCodes.push("RC_OPERATOR_APPROACH_OVERRIDE");
        break;
      }
    }
  }

  // Absolute safety clamp on combined multiplier.
  mult = clamp(mult, 0.5, 1.5);

  return {
    multiplier: mult,
    multipliers_applied: multipliers,
    vetoes_triggered: vetoes,
    approach_override: approachOverride,
    reason_codes_added: reasonCodes,
    evidence_added: evidence,
  };
}
