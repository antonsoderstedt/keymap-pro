// Quality gates — vägrar att lämna diagnos på trasig eller osäker data.
import type { AccountSnapshot, DiagnosisBlocker } from "./types.ts";

export interface GateResult {
  blockers: DiagnosisBlocker[];
  /** Per-kampanj-id → set med gates som blockerar specifika regelklasser */
  campaignGates: Map<string, Set<string>>;
}

export function evaluateGates(snapshot: AccountSnapshot): GateResult {
  const blockers: DiagnosisBlocker[] = [];
  const campaignGates = new Map<string, Set<string>>();

  // TRACKING: 0 konverteringar men >200 klick → spårning troligen trasig
  const totalConv30d = snapshot.campaigns.reduce(
    (s, c) => s + (c.metrics_30d?.conversions ?? 0),
    0,
  );
  const totalClicks30d = snapshot.campaigns.reduce(
    (s, c) => s + (c.metrics_30d?.clicks ?? 0),
    0,
  );
  if (totalConv30d === 0 && totalClicks30d > 200) {
    blockers.push({
      gate: "TRACKING",
      message:
        `0 konverteringar men ${totalClicks30d} klick senaste 30d — konverteringsspårning verkar saknas eller vara trasig.`,
      resolution:
        "Verifiera att konverteringstaggen är korrekt installerad och att rätt konverteringsåtgärd är primär.",
    });
  }

  // Per-kampanj gates
  for (const c of snapshot.campaigns) {
    const gates = new Set<string>();

    // LOW_SIGNIFICANCE: <15 konverteringar → CPA/ROAS-regler bör få lägre confidence
    if ((c.metrics_30d?.conversions ?? 0) < 15) {
      gates.add("LOW_SIGNIFICANCE");
    }

    // RECENT_CHANGE: mutation senaste 7d → vänta innan ny rekommendation
    const recentChanges = snapshot.change_history_14d.filter(
      (ch) => ch.campaign_id === c.id && isWithinDays(ch.change_date, 7),
    );
    if (recentChanges.length > 0) {
      gates.add("RECENT_CHANGE");
    }

    if (gates.size > 0) campaignGates.set(c.id, gates);
  }

  return { blockers, campaignGates };
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) < days;
}
