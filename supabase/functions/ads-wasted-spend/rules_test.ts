// Regeltestsvit för wasted-spend → suggested_action.
// Körs med: deno test (eller via supabase test_edge_functions-tool).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggestAction, type RuleInput } from "./rules.ts";

const base: RuleInput = {
  clicks: 50,
  ctr: 0.06,
  qs: 8,
  cost_sek: 500,
  trackingStatus: "unknown",
};

Deno.test("highCtr + highQs + unknown tracking → kontrollera landningssida & konverteringsspårning", () => {
  assertEquals(
    suggestAction(base),
    "Kontrollera landningssida & konverteringsspårning",
  );
});

Deno.test("highCtr + highQs + active tracking → kontrollera landningssida (spårning OK)", () => {
  assertEquals(
    suggestAction({ ...base, trackingStatus: "active" }),
    "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)",
  );
});

Deno.test("missing tracking trumfar allt — även med högt CTR + QS", () => {
  assertEquals(
    suggestAction({ ...base, trackingStatus: "missing" }),
    "Installera/verifiera konverteringsspårning (hela kontot)",
  );
});

Deno.test("CTR exakt 5% + QS exakt 7 räknas som högt (gränsvärden)", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.05, qs: 7 }),
    "Kontrollera landningssida & konverteringsspårning",
  );
});

Deno.test("CTR 4.99% (precis under tröskel) → INTE landningssida-kontroll", () => {
  const result = suggestAction({ ...base, ctr: 0.0499, qs: 9 });
  assertEquals(
    result === "Kontrollera landningssida & konverteringsspårning"
      || result === "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)",
    false,
  );
});

Deno.test("QS 6 (precis under tröskel) → INTE landningssida-kontroll", () => {
  const result = suggestAction({ ...base, qs: 6 });
  assertEquals(
    result === "Kontrollera landningssida & konverteringsspårning"
      || result === "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)",
    false,
  );
});

Deno.test("Mycket högt CTR (20%) + QS 10 → fortfarande landningssida-kontroll, oavsett kostnad", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.2, qs: 10, cost_sek: 50, clicks: 200 }),
    "Kontrollera landningssida & konverteringsspårning",
  );
});

Deno.test("Lågt CTR (<1%) + >5 klick → negativt sökord", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.005, qs: 5, clicks: 20 }),
    "Lägg som negativt sökord",
  );
});

Deno.test("Lågt QS (≤4) utan högt CTR → förbättra QS eller pausa", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.02, qs: 3 }),
    "Förbättra QS eller pausa",
  );
});

Deno.test("Hög kostnad (>1000) utan andra triggers → sänk bud", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.02, qs: 6, cost_sek: 1500, clicks: 30 }),
    "Sänk maxbud −40%",
  );
});

Deno.test("≤3 klick utan andra triggers → vänta", () => {
  assertEquals(
    suggestAction({ ...base, ctr: 0.02, qs: 6, cost_sek: 100, clicks: 2 }),
    "För lite data — vänta",
  );
});

Deno.test("QS=null + högt CTR → INTE landningssida-kontroll (kräver känt högt QS)", () => {
  const result = suggestAction({ ...base, qs: null, ctr: 0.1 });
  assertEquals(
    result === "Kontrollera landningssida & konverteringsspårning"
      || result === "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)",
    false,
  );
});

// Property-style: oavsett (clicks, cost) ska kombinationen highCtr+highQs+0 konv
// alltid resultera i landningssida-/spårningskontroll när tracking ≠ missing.
Deno.test("INVARIANT: highCtr + highQs + (active|unknown) → ALLTID landningssida-kontroll", () => {
  const cases: Array<Partial<RuleInput>> = [
    { clicks: 1, cost_sek: 1 },
    { clicks: 1000, cost_sek: 50000 },
    { clicks: 10, cost_sek: 200 },
    { clicks: 6, cost_sek: 1500 },        // skulle annars trigga "sänk bud"
    { clicks: 2, cost_sek: 10 },          // skulle annars trigga "vänta"
  ];
  for (const tracking of ["active", "unknown"] as const) {
    for (const c of cases) {
      const input: RuleInput = { ...base, ...c, ctr: 0.08, qs: 9, trackingStatus: tracking };
      const result = suggestAction(input);
      const expected = tracking === "active"
        ? "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)"
        : "Kontrollera landningssida & konverteringsspårning";
      assertEquals(
        result,
        expected,
        `Misslyckades för tracking=${tracking}, input=${JSON.stringify(c)}`,
      );
    }
  }
});
