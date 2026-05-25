// commercial-intent-build
//
// Idempotent worker that materializes IntelligenceVerdict rows into
// public.commercial_intent_labels and writes keyword embeddings into
// public.keyword_embeddings.
//
// Idempotency:
//   - existing labels with same (project_id, normalized_keyword, model_version)
//     are skipped unless force=true
//   - existing embeddings with same (project_id, normalized_keyword, model_version)
//     are kept; content_hash is checked to invalidate when keyword text changes
//   - UPSERTs are used everywhere; no DELETE
//
// Batching:
//   - keywords normalized + deduped before any I/O
//   - embedding API called in chunks of EMBED_BATCH (64) to stay under
//     token limits and to keep latency bounded
//   - signal lookups batched via .in(...) on (keyword, location_code=2752)
//
// Inputs:
//   POST body:
//     {
//       project_id: uuid (required),
//       keywords: string[] (required, ≤ 5000 per call),
//       force?: boolean,
//       location_code?: number (default 2752, Sweden)
//     }
//
// Auth: Authorization: Bearer <user JWT>. Caller must be project owner or
// member; verified via is_project_member().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  buildVerdict,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL_VERSION,
  hashCanonical,
  MODEL_VERSION,
  normalizeKeyword,
  SIGNALS_VERSION,
  sha256Hex,
} from "../_shared/commercial-intent/index.ts";
import { embedTexts, EmbeddingError } from "../_shared/commercial-intent/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBED_BATCH = 64;
const MAX_KEYWORDS_PER_CALL = 5000;
const DEFAULT_LOCATION = 2752; // Sweden

interface RequestBody {
  project_id: string;
  keywords: string[];
  force?: boolean;
  location_code?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json() as RequestBody;
    const { project_id, keywords, force = false } = body;
    const locationCode = body.location_code ?? DEFAULT_LOCATION;

    if (!project_id || typeof project_id !== "string") {
      return json({ error: "project_id required" }, 400);
    }
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return json({ error: "keywords array required" }, 400);
    }
    if (keywords.length > MAX_KEYWORDS_PER_CALL) {
      return json({ error: `max ${MAX_KEYWORDS_PER_CALL} keywords per call` }, 400);
    }

    // ---- Auth: caller must be project member ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return json({ error: "invalid token" }, 401);

    const { data: memberRow, error: memberErr } = await userClient.rpc("is_project_member", {
      _project_id: project_id,
      _user_id: authData.user.id,
    });
    if (memberErr || memberRow !== true) {
      return json({ error: "not a project member" }, 403);
    }

    // Service-role client for all writes (bypasses RLS; we already authorized above)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ---- Project context for intent + value inputs ----
    const { data: project } = await supabase
      .from("projects")
      .select("id, company, domain, products, known_segments, competitors")
      .eq("id", project_id)
      .maybeSingle();
    if (!project) return json({ error: "project not found" }, 404);

    const { data: bizModel } = await supabase
      .from("project_business_model")
      .select("*")
      .eq("project_id", project_id)
      .maybeSingle();

    const productTerms = splitTerms(project.products);
    const brandTokens = uniqueTokens([
      ...splitTerms(project.company),
      ...domainTokens(project.domain),
    ]);
    const ownDomains = project.domain ? [domainHost(project.domain)] : [];

    // Conservative pulled-from-business-model values; treat as project-wide
    // defaults until per-service routing is in. Worker stays deterministic.
    const dealSize = pickFirstNumber(bizModel?.service_deal_size_band) ?? null;
    const margin = pickFirstNumber(bizModel?.service_margin_pct) ?? null;
    const closeRate = pickFirstNumber(bizModel?.close_rate_est) ?? null;
    const ltv = pickFirstNumber(bizModel?.ltv_multiplier) ?? null;

    // ---- Normalize + dedupe input ----
    const normalizedSet = new Map<string, string>(); // normalized -> original
    for (const raw of keywords) {
      const n = normalizeKeyword(String(raw ?? ""));
      if (!n) continue;
      if (!normalizedSet.has(n)) normalizedSet.set(n, String(raw));
    }
    const allNormalized = Array.from(normalizedSet.keys());

    // ---- Idempotency: skip already-labeled at this model_version (unless force) ----
    const { data: existingLabels } = await supabase
      .from("commercial_intent_labels")
      .select("normalized_keyword, model_version")
      .eq("project_id", project_id)
      .eq("model_version", MODEL_VERSION)
      .in("normalized_keyword", allNormalized);
    const labeledSet = new Set((existingLabels ?? []).map((r: any) => r.normalized_keyword));

    const toProcess = force
      ? allNormalized
      : allNormalized.filter((n) => !labeledSet.has(n));

    if (toProcess.length === 0) {
      return json({
        ok: true,
        processed: 0,
        skipped: allNormalized.length,
        model_version: MODEL_VERSION,
        signals_version: SIGNALS_VERSION,
      });
    }

    // ---- Batch fetch signals ----
    const [{ data: metrics }, { data: semrush }, { data: serpRows }] = await Promise.all([
      supabase.from("keyword_metrics")
        .select("keyword, search_volume, cpc_sek, competition, updated_at")
        .eq("location_code", locationCode)
        .in("keyword", toProcess),
      supabase.from("semrush_metrics")
        .select("keyword, kd, serp_features, top_domains, updated_at")
        .eq("location_code", locationCode)
        .in("keyword", toProcess),
      supabase.from("keyword_serp_cache")
        .select("keyword, result_json, fetched_at")
        .eq("location_code", locationCode)
        .in("keyword", toProcess),
    ]);

    const metricsMap = new Map<string, any>();
    (metrics ?? []).forEach((r: any) => metricsMap.set(r.keyword, r));
    const semrushMap = new Map<string, any>();
    (semrush ?? []).forEach((r: any) => semrushMap.set(r.keyword, r));
    const serpMap = new Map<string, any>();
    (serpRows ?? []).forEach((r: any) => serpMap.set(r.keyword, r));

    // ---- Embeddings: which keywords need fresh vectors? ----
    // content_hash = sha256(normalized + ":" + EMBEDDING_MODEL_VERSION)
    const hashesByKw = new Map<string, string>();
    for (const n of toProcess) {
      hashesByKw.set(n, await sha256Hex(`${n}::${EMBEDDING_MODEL_VERSION}`));
    }

    const { data: existingEmbeddings } = await supabase
      .from("keyword_embeddings")
      .select("normalized_keyword, content_hash")
      .eq("project_id", project_id)
      .eq("model_version", EMBEDDING_MODEL_VERSION)
      .in("normalized_keyword", toProcess);
    const embeddedHashes = new Map<string, string>();
    (existingEmbeddings ?? []).forEach((r: any) =>
      embeddedHashes.set(r.normalized_keyword, r.content_hash),
    );

    const needsEmbed = toProcess.filter((n) => embeddedHashes.get(n) !== hashesByKw.get(n));

    if (needsEmbed.length > 0 && lovableKey) {
      try {
        for (let i = 0; i < needsEmbed.length; i += EMBED_BATCH) {
          const chunk = needsEmbed.slice(i, i + EMBED_BATCH);
          const { vectors } = await embedTexts(chunk, lovableKey);
          const rows = chunk.map((n, idx) => ({
            project_id,
            keyword: normalizedSet.get(n) ?? n,
            normalized_keyword: n,
            content_hash: hashesByKw.get(n)!,
            embedding: vectors[idx],
            model_version: EMBEDDING_MODEL_VERSION,
          }));
          const { error } = await supabase
            .from("keyword_embeddings")
            .upsert(rows, { onConflict: "project_id,normalized_keyword,model_version" });
          if (error) console.error("[commercial-intent-build] embedding upsert error", error);
        }
      } catch (err) {
        // Embedding failure is non-fatal — verdicts still computed (term-match only).
        if (err instanceof EmbeddingError) {
          console.warn("[commercial-intent-build] embedding skipped:", err.message);
        } else {
          console.error("[commercial-intent-build] embedding error", err);
        }
      }
    }

    // ---- Build verdicts ----
    const verdictRows: any[] = [];
    for (const normalized of toProcess) {
      const original = normalizedSet.get(normalized) ?? normalized;
      const m = metricsMap.get(normalized);
      const s = semrushMap.get(normalized);
      const serp = serpMap.get(normalized);
      const serpFeatures = Array.isArray(s?.serp_features) ? s.serp_features : extractSerpFeatures(serp?.result_json);
      const topDomains = Array.isArray(s?.top_domains) ? s.top_domains : extractTopDomains(serp?.result_json);

      const verdict = buildVerdict({
        keyword: original,
        normalized_keyword: normalized,
        cluster_id: null,
        intent: {
          normalized_keyword: normalized,
          brand_tokens: brandTokens,
        },
        relevance: {
          normalized_keyword: normalized,
          product_terms: productTerms,
          service_terms: [],
          material_terms: [],
          embedding_cosine_top: null, // landing-page embeddings deferred to a later writer
        },
        serp: {
          keyword_difficulty: s?.kd ?? null,
          competition: m?.competition ?? null,
          serp_features: serpFeatures,
          top_domains: topDomains,
          own_domains: ownDomains,
        },
        value: {
          search_volume: m?.search_volume ?? null,
          cpc_sek: m?.cpc_sek ?? null,
          deal_size_sek: dealSize,
          margin_pct: margin,
          close_rate: closeRate,
          ltv_multiplier: ltv,
          currency: "SEK",
        },
        signal_observed_at: {
          keyword_metrics: m?.updated_at ?? null,
          serp: serp?.fetched_at ?? s?.updated_at ?? null,
          landing_page: null,
        },
        evidence: buildEvidence(m, s, serp),
      });

      verdictRows.push({
        project_id,
        keyword: original,
        normalized_keyword: normalized,
        cluster_id: null,
        search_intent: verdict.search_intent,
        buyer_stage: verdict.buyer_stage,
        commercial_intent_score: verdict.commercial_intent_score,
        business_relevance_score: verdict.business_relevance_score,
        conversion_likelihood: verdict.conversion_likelihood,
        serp_competitiveness: verdict.serp_competitiveness,
        commoditization_score: verdict.commoditization_score,
        lead_quality_proxy: verdict.lead_quality_proxy,
        suggested_acquisition_approach: verdict.suggested_acquisition_approach,
        estimated_commercial_value: verdict.estimated_commercial_value,
        confidence: verdict.confidence,
        evidence: verdict.evidence,
        model_version: verdict.model_version,
        signals_version: verdict.signals_version,
        computed_at: verdict.computed_at,
      });
    }

    // ---- Upsert verdicts in chunks ----
    const UPSERT_CHUNK = 500;
    let written = 0;
    for (let i = 0; i < verdictRows.length; i += UPSERT_CHUNK) {
      const chunk = verdictRows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("commercial_intent_labels")
        .upsert(chunk, { onConflict: "project_id,normalized_keyword,model_version" });
      if (error) {
        console.error("[commercial-intent-build] verdict upsert error", error);
        return json({ error: error.message, written }, 500);
      }
      written += chunk.length;
    }

    // ---- inputs_hash for downstream cache invalidation (informational) ----
    const inputsHash = await hashCanonical({
      project_id,
      keywords: toProcess,
      model_version: MODEL_VERSION,
      signals_version: SIGNALS_VERSION,
    });

    return json({
      ok: true,
      processed: written,
      skipped: allNormalized.length - toProcess.length,
      model_version: MODEL_VERSION,
      signals_version: SIGNALS_VERSION,
      embedding_model_version: EMBEDDING_MODEL_VERSION,
      embedding_dims: EMBEDDING_DIMS,
      inputs_hash: inputsHash,
    });
  } catch (err) {
    console.error("[commercial-intent-build] fatal", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function splitTerms(input: string | null | undefined): string[] {
  if (!input) return [];
  return String(input)
    .split(/[,\n;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function domainHost(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

function domainTokens(domain: string | null | undefined): string[] {
  if (!domain) return [];
  const host = domainHost(domain);
  return host.split(".").filter((p) => p.length > 2 && p !== "com" && p !== "www");
}

function uniqueTokens(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.toLowerCase().trim()).filter(Boolean)));
}

function pickFirstNumber(jsonField: unknown): number | null {
  if (!jsonField || typeof jsonField !== "object") return null;
  for (const v of Object.values(jsonField as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function extractSerpFeatures(resultJson: any): string[] {
  if (!resultJson) return [];
  // DataForSEO-ish: items[].type or result.items[].type
  const items = resultJson?.items ?? resultJson?.result?.[0]?.items ?? [];
  if (!Array.isArray(items)) return [];
  const types = new Set<string>();
  for (const it of items) {
    if (it && typeof it.type === "string") types.add(it.type.toLowerCase());
  }
  return Array.from(types);
}

function extractTopDomains(resultJson: any): string[] {
  if (!resultJson) return [];
  const items = resultJson?.items ?? resultJson?.result?.[0]?.items ?? [];
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items.slice(0, 10)) {
    if (it && typeof it.domain === "string") out.push(it.domain.toLowerCase());
    else if (it && typeof it.url === "string") {
      try { out.push(new URL(it.url).hostname.toLowerCase()); } catch { /* skip */ }
    }
  }
  return out;
}

function buildEvidence(metrics: any, semrush: any, serp: any) {
  const ev: Array<{ id: string; source: string; source_id?: string; observed_at?: string }> = [];
  if (metrics) ev.push({ id: `metrics:${metrics.keyword}`, source: "dataforseo_metrics", observed_at: metrics.updated_at });
  if (semrush) ev.push({ id: `semrush:${semrush.keyword}`, source: "semrush", observed_at: semrush.updated_at });
  if (serp) ev.push({ id: `serp:${serp.keyword}`, source: "serp_cache", observed_at: serp.fetched_at });
  return ev;
}
