// Receives Auction Insights data from a Google Ads Script.
// Authenticates via HMAC-SHA256 signature using ADS_WEBHOOK_SECRET + per-project ads_script_secret.
// Public endpoint — no JWT verification (auth is HMAC-based).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-slay-signature, x-slay-project",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToHex(new Uint8Array(sig));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const projectId = req.headers.get("x-slay-project");
    const signature = req.headers.get("x-slay-signature");
    if (!projectId || !signature) return json({ error: "missing_auth_headers" }, 401);

    const rawBody = await req.text();
    if (rawBody.length > 5_000_000) return json({ error: "payload_too_large" }, 413);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up per-project secret
    const { data: settings, error: sErr } = await supabase
      .from("project_google_settings")
      .select("project_id, ads_script_secret, ads_customer_id")
      .eq("project_id", projectId)
      .maybeSingle();
    if (sErr || !settings?.ads_script_secret) return json({ error: "project_not_configured" }, 401);

    // Verify HMAC using per-project secret (64+ hex chars, generated server-side)
    const expected = await hmacHex(settings.ads_script_secret, rawBody);
    if (!timingSafeEqual(expected, signature.toLowerCase())) {
      return json({ error: "invalid_signature" }, 401);
    }

    // Parse body
    let body: any;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400); }

    const customerId = String(body.customer_id || "").replace(/-/g, "");
    const startDate = String(body.start_date || "");
    const endDate = String(body.end_date || "");
    const campaigns = Array.isArray(body.campaigns) ? body.campaigns : [];

    if (!customerId || !startDate || !endDate) return json({ error: "missing_fields" }, 400);
    // Optional sanity: customer_id should match settings if set
    if (settings.ads_customer_id && settings.ads_customer_id.replace(/-/g, "") !== customerId) {
      return json({ error: "customer_id_mismatch" }, 400);
    }

    // Aggregate unique competitor domains across campaigns
    const compMap = new Map<string, {
      domain: string; impressionShare: number[]; overlapRate: number[];
      positionAbove: number[]; topOfPage: number[]; absTopOfPage: number[]; outranking: number[];
      campaigns: Set<string>;
    }>();
    const cleanCampaigns = campaigns.map((c: any) => {
      const compsRaw = Array.isArray(c.competitors) ? c.competitors : [];
      const comps = compsRaw.map((x: any) => ({
        domain: String(x.domain || "").toLowerCase().trim(),
        impression_share: numOrNull(x.impression_share),
        overlap_rate: numOrNull(x.overlap_rate),
        position_above_rate: numOrNull(x.position_above_rate),
        top_of_page_rate: numOrNull(x.top_of_page_rate),
        abs_top_of_page_rate: numOrNull(x.abs_top_of_page_rate),
        outranking_share: numOrNull(x.outranking_share),
      })).filter((x: any) => x.domain && x.domain !== "you");

      for (const x of comps) {
        const key = x.domain;
        if (!compMap.has(key)) compMap.set(key, {
          domain: key, impressionShare: [], overlapRate: [],
          positionAbove: [], topOfPage: [], absTopOfPage: [], outranking: [],
          campaigns: new Set(),
        });
        const m = compMap.get(key)!;
        if (x.impression_share != null) m.impressionShare.push(x.impression_share);
        if (x.overlap_rate != null) m.overlapRate.push(x.overlap_rate);
        if (x.position_above_rate != null) m.positionAbove.push(x.position_above_rate);
        if (x.top_of_page_rate != null) m.topOfPage.push(x.top_of_page_rate);
        if (x.abs_top_of_page_rate != null) m.absTopOfPage.push(x.abs_top_of_page_rate);
        if (x.outranking_share != null) m.outranking.push(x.outranking_share);
        if (c.name) m.campaigns.add(String(c.name));
      }

      return {
        id: String(c.id || ""),
        name: String(c.name || ""),
        is_brand: !!c.is_brand,
        competitors: comps,
      };
    });

    const avg = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
    const competitors = Array.from(compMap.values()).map((m) => ({
      domain: m.domain,
      impressionShare: avg(m.impressionShare),
      overlapRate: avg(m.overlapRate),
      positionAbove: avg(m.positionAbove),
      topOfPage: avg(m.topOfPage),
      absTopOfPage: avg(m.absTopOfPage),
      outrankingShare: avg(m.outranking),
      campaigns: Array.from(m.campaigns),
    })).sort((a, b) => (b.impressionShare ?? 0) - (a.impressionShare ?? 0));

    const { data: ins, error: iErr } = await supabase
      .from("auction_insights_snapshots")
      .insert({
        project_id: projectId,
        start_date: startDate,
        end_date: endDate,
        source: "script",
        rows: { competitors, campaigns: cleanCampaigns },
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    return json({ ok: true, snapshot_id: ins.id, competitors: competitors.length, campaigns: cleanCampaigns.length });
  } catch (e: any) {
    console.error("ads-webhook-auction-insights", e);
    return json({ error: e.message || "internal" }, 500);
  }
});

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
