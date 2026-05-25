// Determinism + classification tests for the Commercial Intelligence v1
// pure layer. These modules live under supabase/functions/_shared/ but contain
// no Deno-specific APIs, so Vitest can import them directly.

import { describe, expect, it } from "vitest";

import {
  classifyIntent,
} from "../../supabase/functions/_shared/commercial-intent/intent.ts";
import {
  normalizeKeyword,
  tokenize,
  hasAnyToken,
} from "../../supabase/functions/_shared/commercial-intent/normalize.ts";
import {
  assessSerp,
} from "../../supabase/functions/_shared/commercial-intent/serp.ts";
import {
  assessRelevance,
} from "../../supabase/functions/_shared/commercial-intent/relevance.ts";
import {
  estimateValue,
} from "../../supabase/functions/_shared/commercial-intent/value.ts";
import {
  buildVerdict,
} from "../../supabase/functions/_shared/commercial-intent/verdict.ts";
import {
  canonicalJSON,
} from "../../supabase/functions/_shared/commercial-intent/hash.ts";
import {
  MODEL_VERSION,
  SIGNALS_VERSION,
  REASON_CODES,
} from "../../supabase/functions/_shared/commercial-intent/constants.ts";

describe("normalize", () => {
  it("lowercases and trims", () => {
    expect(normalizeKeyword("  Köpa CNC-Maskin  ")).toBe("köpa cnc-maskin");
  });

  it("collapses whitespace", () => {
    expect(normalizeKeyword("buy   cnc    machine")).toBe("buy cnc machine");
  });

  it("tokenizes on whitespace and hyphens", () => {
    expect(tokenize("köpa cnc-maskin")).toEqual(["köpa", "cnc", "maskin"]);
  });

  it("hasAnyToken matches word boundaries", () => {
    expect(hasAnyToken("köpa cnc-maskin", ["köp", "köpa"])).toBe("köpa");
    // 'cn' is not a standalone token
    expect(hasAnyToken("köpa cnc-maskin", ["cn"])).toBeNull();
  });
});

describe("intent classification", () => {
  it("transactional + ready_to_buy on 'köpa'", () => {
    const r = classifyIntent({ normalized_keyword: "köpa cnc maskin" });
    expect(r.search_intent).toBe("transactional");
    expect(r.buyer_stage).toBe("ready_to_buy");
    expect(r.commercial_intent_score).toBeGreaterThan(0.9);
    expect(r.reason_codes).toContain(REASON_CODES.INTENT_TRANSACTIONAL_MODIFIER);
  });

  it("commercial + product_aware on 'best vs'", () => {
    const r = classifyIntent({ normalized_keyword: "best cnc machine vs lathe" });
    expect(r.search_intent).toBe("commercial");
    expect(r.buyer_stage).toBe("product_aware");
  });

  it("informational + problem_aware on 'varför fungerar inte'", () => {
    const r = classifyIntent({ normalized_keyword: "varför fungerar inte cnc" });
    expect(r.search_intent).toBe("informational");
    expect(r.buyer_stage).toBe("problem_aware");
  });

  it("navigational when brand token present without transactional modifier", () => {
    const r = classifyIntent({
      normalized_keyword: "acme login",
      brand_tokens: ["acme"],
    });
    expect(r.search_intent).toBe("navigational");
  });

  it("is deterministic — same input twice", () => {
    const a = classifyIntent({ normalized_keyword: "jämför crm system" });
    const b = classifyIntent({ normalized_keyword: "jämför crm system" });
    expect(a).toEqual(b);
  });
});

describe("serp assessment", () => {
  it("returns floor + no_data when no signals present", () => {
    const r = assessSerp({});
    expect(r.coverage).toBe(0);
    expect(r.reason_codes).toContain(REASON_CODES.SERP_NO_DATA);
    expect(r.serp_competitiveness).toBeCloseTo(0.5, 5);
  });

  it("KD high triggers high competitiveness", () => {
    const r = assessSerp({ keyword_difficulty: 85 });
    expect(r.serp_competitiveness).toBeGreaterThan(0.7);
    expect(r.reason_codes).toContain(REASON_CODES.SERP_KD_HIGH);
  });

  it("commoditized features raise commoditization score", () => {
    const r = assessSerp({
      keyword_difficulty: 50,
      serp_features: ["shopping_pack", "product_carousel"],
      top_domains: ["prisjakt.nu", "amazon.se", "nicheshop.se"],
    });
    expect(r.commoditization_score).toBeGreaterThan(0.4);
    expect(r.reason_codes).toContain(REASON_CODES.SERP_COMMODITIZED_FEATURES);
  });
});

describe("relevance", () => {
  it("degrades gracefully without embedding", () => {
    const r = assessRelevance({
      normalized_keyword: "cnc fräs leverantör",
      product_terms: ["cnc", "fräs"],
    });
    expect(r.used_embedding).toBe(false);
    expect(r.business_relevance_score).toBeGreaterThanOrEqual(0.6);
    expect(r.reason_codes).toContain(REASON_CODES.RELEVANCE_TERM_MATCH);
  });

  it("uses embedding when provided", () => {
    const r = assessRelevance({
      normalized_keyword: "irrelevant query",
      embedding_cosine_top: 0.85,
    });
    expect(r.used_embedding).toBe(true);
    expect(r.business_relevance_score).toBeGreaterThan(0.7);
  });

  it("hits floor when nothing matches", () => {
    const r = assessRelevance({
      normalized_keyword: "totally unrelated",
      product_terms: ["foo", "bar"],
    });
    expect(r.business_relevance_score).toBeLessThanOrEqual(0.2);
    expect(r.reason_codes).toContain(REASON_CODES.RELEVANCE_NO_SIGNAL);
  });
});

describe("value estimation", () => {
  it("p10 < p50 < p90", () => {
    const r = estimateValue({
      search_volume: 1000,
      cpc_sek: 25,
      search_intent: "transactional",
      buyer_stage: "ready_to_buy",
      business_relevance_score: 0.9,
      serp_competitiveness: 0.4,
      commoditization_score: 0.2,
      conversion_likelihood: 0.05,
    });
    expect(r.estimated_commercial_value.p10).toBeLessThanOrEqual(r.estimated_commercial_value.p50);
    expect(r.estimated_commercial_value.p50).toBeLessThanOrEqual(r.estimated_commercial_value.p90);
    expect(r.estimated_commercial_value.currency).toBe("SEK");
  });

  it("transactional + ready_to_buy yields higher p50 than informational + unaware", () => {
    const base = {
      search_volume: 500,
      cpc_sek: 20,
      business_relevance_score: 0.7,
      serp_competitiveness: 0.5,
      commoditization_score: 0.3,
      conversion_likelihood: 0.05,
    };
    const hot = estimateValue({ ...base, search_intent: "transactional", buyer_stage: "ready_to_buy" });
    const cold = estimateValue({ ...base, search_intent: "informational", buyer_stage: "unaware" });
    expect(hot.estimated_commercial_value.p50).toBeGreaterThan(cold.estimated_commercial_value.p50);
  });

  it("missing signals widen uncertainty", () => {
    const full = estimateValue({
      search_volume: 1000,
      cpc_sek: 25,
      search_intent: "commercial",
      buyer_stage: "product_aware",
      business_relevance_score: 0.7,
      serp_competitiveness: 0.5,
      commoditization_score: 0.3,
      conversion_likelihood: 0.05,
    });
    const sparse = estimateValue({
      search_intent: "commercial",
      buyer_stage: "product_aware",
      business_relevance_score: 0.7,
      serp_competitiveness: 0.5,
      commoditization_score: 0.3,
      conversion_likelihood: 0.05,
    });
    const fullSpread = (full.estimated_commercial_value.p90 - full.estimated_commercial_value.p10) / (full.estimated_commercial_value.p50 || 1);
    const sparseSpread = (sparse.estimated_commercial_value.p90 - sparse.estimated_commercial_value.p10) / (sparse.estimated_commercial_value.p50 || 1);
    expect(sparseSpread).toBeGreaterThan(fullSpread);
  });
});

describe("buildVerdict — end-to-end determinism", () => {
  const fixture = {
    keyword: "Köpa CNC-fräs",
    normalized_keyword: "köpa cnc-fräs",
    intent: { normalized_keyword: "köpa cnc-fräs", brand_tokens: [] },
    relevance: {
      normalized_keyword: "köpa cnc-fräs",
      product_terms: ["cnc", "fräs"],
      embedding_cosine_top: null,
    },
    serp: {
      keyword_difficulty: 55,
      competition: 0.7,
      serp_features: ["organic", "people_also_ask"],
      top_domains: ["dustinhome.se", "elfa.se", "nicheshop.se"],
      own_domains: [],
    },
    value: { search_volume: 480, cpc_sek: 18, currency: "SEK" as const },
  };

  it("emits required fields with locked versions", () => {
    const v = buildVerdict(fixture);
    expect(v.model_version).toBe(MODEL_VERSION);
    expect(v.signals_version).toBe(SIGNALS_VERSION);
    expect(v.search_intent).toBe("transactional");
    expect(v.buyer_stage).toBe("ready_to_buy");
    expect(v.confidence).toBeGreaterThan(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
    expect(v.reason_codes.length).toBeGreaterThan(0);
  });

  it("two identical calls produce identical scoring fields (excluding computed_at)", () => {
    const a = buildVerdict(fixture);
    const b = buildVerdict(fixture);
    const strip = (v: ReturnType<typeof buildVerdict>) => ({ ...v, computed_at: "X", confidence: round(v.confidence) });
    expect(strip(a)).toEqual(strip(b));
  });
});

describe("canonicalJSON", () => {
  it("sorts keys for stable hashing", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });
  it("handles nested objects and arrays", () => {
    const a = canonicalJSON({ a: [1, { x: 1, y: 2 }] });
    const b = canonicalJSON({ a: [1, { y: 2, x: 1 }] });
    expect(a).toBe(b);
  });
});

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
