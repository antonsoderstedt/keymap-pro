// ads-keyword-planner — Google Ads KeywordPlanIdeaService.GenerateKeywordIdeas.
// Fetches keyword ideas for a project and persists them as raw data (no scoring).
// Pattern mirrors ads-fetch-auction-insights (auth, ads context, error classification).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADS_API_VERSION = "v21";
const ADS_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

// in-memory rate limit (best-effort, per-instance only)
const lastRunByProject = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

interface RequestBody {
  project_id: string;
  customer_id: string;
  login_customer_id?: string;
  seed_keywords?: string[];
  seed_url?: string;
  language_code?: string;
  location_codes?: string[];
  include_adult?: boolean;
  max_ideas?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    const body = (await req.json()) as RequestBody;
    const {
      project_id,
      customer_id,
      login_customer_id,
      seed_keywords = [],
      seed_url,
      language_code = "1015",
      location_codes = ["2752"],
      include_adult = false,
      max_ideas = 200,
    } = body || ({} as RequestBody);

    if (!project_id) return json({ ok: false, error: "project_id required" }, 400);
    if (!customer_id) return json({ ok: false, error: "customer_id required" }, 400);

    const seeds = (seed_keywords || []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 20);
    if (seeds.length === 0 && !seed_url) {
      return json({ ok: false, error: "Provide seed_keywords (up to 20) or seed_url" }, 400);
    }

    const cap = Math.max(1, Math.min(Number(max_ideas) || 200, 1000));

    // Membership check via user-scoped client
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth ?? "" } } });
    const { data: project, error: projErr } = await sbUser
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .maybeSingle();
    if (projErr || !project) return json({ ok: false, error: "project not found" }, 404);

    // Best-effort rate limit
    const now = Date.now();
    const last = lastRunByProject.get(project_id) || 0;
    if (now - last < RATE_LIMIT_MS) {
      return json({ ok: false, error: "rate_limited", retry_in_ms: RATE_LIMIT_MS - (now - last) }, 429);
    }
    lastRunByProject.set(project_id, now);

    // Build Ads context (handles token refresh + scope verification)
    let ctx;
    try {
      ctx = await getAdsContext(auth);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("GOOGLE_REAUTH_REQUIRED") || msg.includes("MISSING_ADS_SCOPE") || msg.includes("Not authenticated")) {
        return json({ ok: false, reason: "reauth_required", error: msg }, 200);
      }
      return json({ ok: false, error: msg }, 500);
    }

    const cid = String(customer_id).replace(/[^0-9]/g, "");
    const loginCid = (login_customer_id || ctx.loginCustomerId).replace(/[^0-9]/g, "");

    // Build request body for generateKeywordIdeas
    const reqBody: Record<string, unknown> = {
      language: `languageConstants/${language_code}`,
      geoTargetConstants: location_codes.map((c) => `geoTargetConstants/${c}`),
      includeAdultKeywords: !!include_adult,
      keywordPlanNetwork: "GOOGLE_SEARCH",
    };
    if (seeds.length > 0 && seed_url) {
      reqBody.keywordAndUrlSeed = { url: seed_url, keywords: seeds };
    } else if (seeds.length > 0) {
      reqBody.keywordSeed = { keywords: seeds };
    } else if (seed_url) {
      reqBody.urlSeed = { url: seed_url };
    }

    const apiRes = await fetch(`${ADS_BASE}/customers/${cid}:generateKeywordIdeas`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "developer-token": ctx.developerToken,
        "login-customer-id": loginCid,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });
    const text = await apiRes.text();
    if (!apiRes.ok) {
      if (apiRes.status === 401) {
        return json({ ok: false, reason: "reauth_required", error: text.slice(0, 400) }, 200);
      }
      if (apiRes.status === 403 && /DEVELOPER_TOKEN_NOT_APPROVED/i.test(text)) {
        return json({
          ok: false,
          reason: "developer_token_not_approved",
          error: "Google Ads developer token har bara test-/explorer-åtkomst. Keyword Planner kräver Basic eller Standard access — ansök via Google Ads API Center.",
        }, 200);
      }
      console.error("generateKeywordIdeas failed", { status: apiRes.status, body: text.slice(0, 500) });
      return json({ ok: false, error: `ADS_API_ERROR [${apiRes.status}]: ${text.slice(0, 400)}` }, 502);
    }

    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return json({ ok: false, error: "Invalid JSON from Google Ads" }, 502);
    }

    const results: any[] = parsed.results || [];
    const run_id = crypto.randomUUID();
    const fetchedAt = new Date().toISOString();
    const primarySeedKw = seeds[0] || null;
    const primarySeedUrl = seed_url || null;
    const primaryLocation = location_codes[0] || "2752";

    const ideas = results.slice(0, cap).map((r: any) => {
      const m = r.keywordIdeaMetrics || {};
      return {
        project_id,
        run_id,
        seed_keyword: primarySeedKw,
        seed_url: primarySeedUrl,
        keyword: String(r.text || "").trim().toLowerCase(),
        language_code,
        location_code: primaryLocation,
        avg_monthly_searches: m.avgMonthlySearches != null ? Number(m.avgMonthlySearches) : null,
        competition: m.competition || null,
        competition_index: m.competitionIndex != null ? Number(m.competitionIndex) : null,
        low_top_of_page_bid_micros: m.lowTopOfPageBidMicros != null ? Number(m.lowTopOfPageBidMicros) : null,
        high_top_of_page_bid_micros: m.highTopOfPageBidMicros != null ? Number(m.highTopOfPageBidMicros) : null,
        fetched_at: fetchedAt,
      };
    }).filter((i) => i.keyword);

    // Dedupe within batch on keyword
    const seen = new Set<string>();
    const unique = ideas.filter((i) => (seen.has(i.keyword) ? false : (seen.add(i.keyword), true)));

    const sbAdmin = createClient(url, service);
    if (unique.length > 0) {
      // chunked insert
      const CHUNK = 500;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const slice = unique.slice(i, i + CHUNK);
        const { error: insErr } = await sbAdmin.from("keyword_planner_ideas").insert(slice);
        if (insErr) {
          console.error("kpi insert failed", insErr);
          return json({ ok: false, error: insErr.message }, 500);
        }
      }
    }

    return json({ ok: true, run_id, count: unique.length, ideas: unique });
  } catch (e: any) {
    console.error("ads-keyword-planner error", e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
