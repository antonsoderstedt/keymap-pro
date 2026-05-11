// data-sources-status — returnerar samlad status för alla datakällor i ett projekt.
// Läser google_tokens (scope), project_google_settings (vald property/site/customer)
// och data_source_status (last_synced_at + last_error).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPE_REQS: Record<string, string[]> = {
  ga4: ["https://www.googleapis.com/auth/analytics.readonly"],
  gsc: ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/webmasters"],
  ads: ["https://www.googleapis.com/auth/adwords"],
};

const TTL: Record<string, number> = { ga4: 1800, gsc: 1800, ads: 3600 };

function hasAnyScope(scopeStr: string | null | undefined, required: string[]): boolean {
  if (!scopeStr) return false;
  const have = new Set(scopeStr.split(/\s+/));
  return required.some((s) => have.has(s));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbAdmin = createClient(url, service);

    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "unauthenticated" }, 401);

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) return json({ error: "project_id required" }, 400);

    // Verify membership via RLS-safe select
    const { data: project } = await sbUser.from("projects").select("id").eq("id", project_id).maybeSingle();
    if (!project) return json({ error: "project not found" }, 404);

    const [{ data: token }, { data: settings }, { data: statusRows }] = await Promise.all([
      sbAdmin.from("google_tokens").select("scope, expires_at").eq("user_id", user.id).maybeSingle(),
      sbAdmin.from("project_google_settings")
        .select("ga4_property_id, ga4_property_name, gsc_site_url, ads_customer_id, ads_customer_name")
        .eq("project_id", project_id).maybeSingle(),
      sbAdmin.from("data_source_status").select("*").eq("project_id", project_id),
    ]);

    const tokenScope = (token as any)?.scope as string | undefined;
    const tokenExpired = token ? new Date((token as any).expires_at).getTime() < Date.now() - 5 * 60_000 : true;
    const hasToken = !!token;

    const sources = (["ga4", "gsc", "ads"] as const).map((source) => {
      const required = SCOPE_REQS[source];
      const scopeOk = hasAnyScope(tokenScope, required);
      const selection = pickSelection(source, settings);
      const stored = (statusRows || []).find((r: any) => r.source === source);
      const ttlSec = stored?.ttl_seconds ?? TTL[source];
      const lastSyncedAt = stored?.last_synced_at as string | null | undefined;
      const ageSec = lastSyncedAt ? (Date.now() - new Date(lastSyncedAt).getTime()) / 1000 : null;

      let status: string = "not_connected";
      let reason: string | null = null;

      if (!hasToken) {
        status = "not_connected";
        reason = "Google är inte ansluten";
      } else if (!scopeOk) {
        status = "reauth_required";
        reason = `Saknar scope: ${required[0]}`;
      } else if (!selection.id) {
        status = "stale";
        reason = `${selection.label} är inte vald`;
      } else if (stored?.status === "error" || stored?.status === "reauth_required") {
        status = stored.status;
        reason = stored.last_error;
      } else if (ageSec !== null && ageSec > ttlSec) {
        status = "stale";
        reason = "Data är äldre än cache-fönstret";
      } else if (lastSyncedAt) {
        status = "ok";
      } else {
        status = "stale";
        reason = "Ingen hämtning gjord ännu";
      }

      return {
        source,
        status,
        reason,
        scope_ok: scopeOk,
        token_expired: tokenExpired,
        selection,
        last_synced_at: lastSyncedAt ?? null,
        last_error: stored?.last_error ?? null,
        ttl_seconds: ttlSec,
        age_seconds: ageSec,
      };
    });

    return json({
      generated_at: new Date().toISOString(),
      google_connected: hasToken,
      token_scope: tokenScope ?? null,
      sources,
    });
  } catch (e) {
    console.error("data-sources-status error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function pickSelection(source: string, s: any): { id: string | null; name: string | null; label: string } {
  if (!s) return { id: null, name: null, label: labelOf(source) };
  if (source === "ga4") return { id: s.ga4_property_id || null, name: s.ga4_property_name || null, label: "GA4-property" };
  if (source === "gsc") return { id: s.gsc_site_url || null, name: s.gsc_site_url || null, label: "Search Console-sajt" };
  if (source === "ads") return { id: s.ads_customer_id || null, name: s.ads_customer_name || null, label: "Ads-konto" };
  return { id: null, name: null, label: labelOf(source) };
}

function labelOf(s: string) {
  return s === "ga4" ? "GA4" : s === "gsc" ? "Search Console" : s === "ads" ? "Google Ads" : s;
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
