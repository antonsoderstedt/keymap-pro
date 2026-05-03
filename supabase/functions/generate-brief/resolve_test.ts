import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveClusterKws } from "./index.ts";

const universe = [
  { keyword: "solceller pris", cluster: "Solceller Pris", searchVolume: 1000, isNegative: false },
  { keyword: "billiga solceller", cluster: "Solceller Pris", searchVolume: 500, isNegative: false },
  { keyword: "solpaneler test", cluster: "Solpaneler Test", searchVolume: 800, isNegative: false },
  { keyword: "installera solceller", cluster: "Installation", searchVolume: 600, isNegative: false },
  { keyword: "solceller bidrag", cluster: "Bidrag & Stöd", searchVolume: 400, isNegative: false },
];

Deno.test("exact cluster match returns only that cluster's keywords", () => {
  const r = resolveClusterKws(universe, "Solceller Pris");
  assertEquals(r.matchKind, "exact");
  assertEquals(r.matchedCluster, "Solceller Pris");
  assertEquals(r.keywords.length, 2);
});

Deno.test("substring match handles different casing", () => {
  const r = resolveClusterKws(universe, "solceller pris");
  assertEquals(r.matchKind, "substring");
  assertEquals(r.matchedCluster, "Solceller Pris");
  assertEquals(r.keywords.length, 2);
});

Deno.test("substring match handles segment name being broader than cluster", () => {
  const r = resolveClusterKws(universe, "Pris");
  assertEquals(r.matchKind, "substring");
  assertEquals(r.matchedCluster, "Solceller Pris");
  assert(r.keywords.length > 0);
});

Deno.test("substring match handles segment name being narrower (cluster contains it)", () => {
  const r = resolveClusterKws(universe, "Bidrag");
  assertEquals(r.matchKind, "substring");
  assertEquals(r.matchedCluster, "Bidrag & Stöd");
});

Deno.test("falls back to top 30 when no match exists", () => {
  const r = resolveClusterKws(universe, "Helt orelaterat segment");
  assertEquals(r.matchKind, "top");
  assertEquals(r.matchedCluster, "__top_30__");
  assertEquals(r.keywords.length, universe.length);
  // sorted desc by searchVolume
  assertEquals(r.keywords[0].searchVolume, 1000);
});

Deno.test("availableClusters is unique and complete", () => {
  const r = resolveClusterKws(universe, "x");
  assertEquals(
    [...r.availableClusters].sort(),
    ["Bidrag & Stöd", "Installation", "Solceller Pris", "Solpaneler Test"],
  );
});

Deno.test("never returns empty for non-empty universe", () => {
  for (const probe of ["", "asdf", "PRIS", "installation", "stöd"]) {
    const r = resolveClusterKws(universe, probe);
    assert(r.keywords.length > 0, `empty for "${probe}"`);
  }
});

// Simulates what the frontend does: every segment must resolve to a cluster
Deno.test("frontend flow: every UI segment resolves to a real cluster or fallback", () => {
  const segments = [
    { name: "Solceller Pris" },           // exact
    { name: "pris" },                      // substring
    { name: "Installation av paneler" },   // substring (cluster contains "Installation"? no — "Installation av paneler".includes("Installation") true)
    { name: "Helt nytt segment" },         // top fallback
  ];
  for (const s of segments) {
    const r = resolveClusterKws(universe, s.name);
    assert(r.keywords.length > 0, `segment "${s.name}" resolved to 0 keywords`);
    assert(["exact", "substring", "top"].includes(r.matchKind));
  }
});
