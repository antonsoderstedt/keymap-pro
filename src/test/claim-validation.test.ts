import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLAIM_RX =
  /(konverteringar|klick|ctr|kostnad|sessions|impressions|users|pageviews)\s*[-:]?\s*[-+]?\d+%/i;

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/decision-context-build/index.ts"),
  "utf8",
);

describe("claim validation — title vs what_changed", () => {
  it("regex matches numeric-claim titles like 'konverteringar -61%'", () => {
    expect(CLAIM_RX.test("PMax: konverteringar -61% senaste 14d")).toBe(true);
    expect(CLAIM_RX.test("CTR +12% efter ändring")).toBe(true);
    expect(CLAIM_RX.test("sessions -25%")).toBe(true);
  });

  it("regex does NOT match non-claim titles", () => {
    expect(CLAIM_RX.test("Förbättra QS eller pausa: 'Durkplåt'")).toBe(false);
    expect(CLAIM_RX.test("Skapa landningssida för laserskärning")).toBe(false);
  });

  it("worker triggers 'claim_unverified' gate + narrative_status='failed' when empty what_changed", () => {
    // Source-level invariant: the worker must apply both the gate trigger
    // and the narrative status override when the title carries a claim but
    // what_changed is empty.
    expect(SRC).toMatch(/claim_unverified/);
    expect(SRC).toMatch(/CLAIM_RX\.test\(title\)/);
    expect(SRC).toMatch(/context\.what_changed\.length\s*===\s*0/);
    expect(SRC).toMatch(/narrativeStatus\s*=\s*"failed"/);
  });
});
