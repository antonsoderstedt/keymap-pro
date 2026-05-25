import { describe, it, expect } from "vitest";
import {
  evaluateAutoRevert,
  DEFAULT_AUTO_REVERT_POLICY,
  type AutoRevertPolicy,
} from "@/lib/autoRevert";

describe("evaluateAutoRevert", () => {
  it("returns disabled when policy.enabled = false", () => {
    const r = evaluateAutoRevert(DEFAULT_AUTO_REVERT_POLICY, { ctr: -50 });
    expect(r).toEqual({ revert: false, reason: "disabled" });
  });

  it("reverts when CTR drops below threshold", () => {
    const policy: AutoRevertPolicy = { metric: "ctr", threshold_pct: -20, window_days: 7, enabled: true };
    const r = evaluateAutoRevert(policy, { ctr: -25 });
    expect(r.revert).toBe(true);
    expect(r.reason).toContain("ctr");
    expect(r.reason).toContain("-25");
    expect(r.reason).toContain("-20");
  });

  it("does not revert when CTR within threshold", () => {
    const policy: AutoRevertPolicy = { metric: "ctr", threshold_pct: -20, window_days: 7, enabled: true };
    const r = evaluateAutoRevert(policy, { ctr: -10 });
    expect(r).toEqual({ revert: false, reason: "within_threshold" });
  });

  it("returns no_measurement when metric is missing", () => {
    const policy: AutoRevertPolicy = { metric: "clicks", threshold_pct: -20, window_days: 7, enabled: true };
    const r = evaluateAutoRevert(policy, { ctr: -50 });
    expect(r).toEqual({ revert: false, reason: "no_measurement" });
  });

  it("reverts on exact equality (<=)", () => {
    const policy: AutoRevertPolicy = { metric: "ctr", threshold_pct: -50, window_days: 7, enabled: true };
    const r = evaluateAutoRevert(policy, { ctr: -50 });
    expect(r.revert).toBe(true);
  });

  it("does not revert when just above threshold", () => {
    const policy: AutoRevertPolicy = { metric: "ctr", threshold_pct: -50, window_days: 7, enabled: true };
    const r = evaluateAutoRevert(policy, { ctr: -49 });
    expect(r.revert).toBe(false);
    expect(r.reason).toBe("within_threshold");
  });
});
