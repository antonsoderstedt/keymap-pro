// Search Console: list sites + query analytics
import { getGoogleAccessToken } from "../_shared/google-token.ts";
import { classifyGoogleError, markSourceStatus } from "../_shared/source-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let projectId: string | undefined;
  try {
    const { token } = await getGoogleAccessToken(req.headers.get("Authorization"));
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "sites";
    projectId = body.projectId || body.project_id;

    if (action === "sites") {
      const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const reauth = detectScopeError(res.status, data);
      if (reauth) {
        if (projectId) await markSourceStatus({ projectId, source: "gsc", status: "reauth_required", lastError: reauth.error, bumpSynced: false });
        return json(reauth, 200);
      }
      return json(data, res.status);
    }

    if (action === "query") {
      const { siteUrl, startDate, endDate, dimensions = ["query"], rowLimit = 100 } = body;
      if (!siteUrl) return json({ error: "siteUrl required" }, 400);
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
        },
      );
      const data = await res.json();
      const reauth = detectScopeError(res.status, data);
      if (reauth) {
        if (projectId) await markSourceStatus({ projectId, source: "gsc", status: "reauth_required", lastError: reauth.error, bumpSynced: false });
        return json(reauth, 200);
      }
      if (projectId && res.ok) await markSourceStatus({ projectId, source: "gsc", status: "ok", meta: { siteUrl } });
      else if (projectId && !res.ok) await markSourceStatus({ projectId, source: "gsc", status: "error", lastError: data?.error?.message || `HTTP ${res.status}`, bumpSynced: false });
      return json(data, res.status);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("gsc-fetch error", e);
    const msg = String(e instanceof Error ? e.message : e);
    if (projectId) await markSourceStatus({ projectId, source: "gsc", status: classifyGoogleError(msg), lastError: msg, bumpSynced: false });
    return json({ error: msg }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function detectScopeError(status: number, data: any): { error: string; code: string; reauthRequired: true } | null {
  if (status !== 403) return null;
  const reason = data?.error?.details?.[0]?.reason || data?.error?.errors?.[0]?.reason || "";
  const msg = data?.error?.message || "";
  if (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || reason === "insufficientPermissions" || /insufficient authentication scopes/i.test(msg)) {
    return {
      error: "MISSING_GSC_SCOPE: Search Console-scope saknas i sparad token. Anslut Google igen.",
      code: "MISSING_GSC_SCOPE",
      reauthRequired: true,
    };
  }
  return null;
}
