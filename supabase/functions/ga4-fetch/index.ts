// GA4: list properties + run a basic report. Applies project ga4_filters when projectId given.
import { getGoogleAccessToken } from "../_shared/google-token.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyGoogleError, markSourceStatus } from "../_shared/source-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function buildDimensionFilter(projectId?: string, auth?: string | null) {
  if (!projectId) return undefined;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key, { global: { headers: { Authorization: auth || "" } } });
  const { data } = await sb
    .from("ga4_filters")
    .select("dimension, operator, value, exclude")
    .eq("project_id", projectId)
    .eq("is_active", true);
  const filters = (data || []) as any[];
  if (!filters.length) return undefined;
  const expressions = filters.map((f) => {
    const inner = {
      filter: {
        fieldName: f.dimension,
        stringFilter: { matchType: f.operator || "CONTAINS", value: f.value, caseSensitive: false },
      },
    };
    return f.exclude ? { notExpression: inner } : inner;
  });
  return expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let projectIdForStatus: string | undefined;
  try {
    const auth = req.headers.get("Authorization");
    const { token } = await getGoogleAccessToken(auth);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "properties";
    projectIdForStatus = body.projectId || body.project_id;

    if (action === "properties") {
      const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        const reauth = detectScopeError(res.status, parsed);
        if (reauth) {
          if (projectIdForStatus) await markSourceStatus({ projectId: projectIdForStatus, source: "ga4", status: "reauth_required", lastError: reauth.error, bumpSynced: false });
          return json(reauth, 200);
        }
        return json(parsed, res.status);
      } catch {
        console.error("ga4-fetch properties: non-JSON", res.status, text.slice(0, 500));
        return json({ error: "GA4 API non-JSON", status: res.status, details: text.slice(0, 500) }, 502);
      }
    }

    if (action === "report") {
      const {
        propertyId,
        projectId,
        startDate = "28daysAgo",
        endDate = "today",
        dimensions = [{ name: "date" }],
        metrics: rawMetrics = [{ name: "sessions" }, { name: "totalUsers" }],
        limit = 100,
        persist = false,
      } = body;
      if (!propertyId) return json({ error: "propertyId required" }, 400);

      // Dedupe metrics by name. NOTE: GA4 treats `conversions` and `keyEvents` as
      // the same metric and rejects requests with both ("duplicate metrics").
      const seen = new Set<string>();
      const metrics = (rawMetrics as any[]).filter((m) => {
        if (!m?.name || seen.has(m.name)) return false;
        if (m.name === "keyEvents" && seen.has("conversions")) return false;
        if (m.name === "conversions" && seen.has("keyEvents")) return false;
        seen.add(m.name);
        return true;
      });

      // Normalize property ID: strip whitespace, "properties/" prefix, and non-digits
      const normalizedPropertyId = String(propertyId).trim().replace(/^properties\//i, "").replace(/\D/g, "");
      if (!normalizedPropertyId) {
        return json({ error: `Ogiltigt GA4 property-ID: "${propertyId}". Ska vara numeriskt (t.ex. 123456789).` }, 400);
      }

      const dimensionFilter = await buildDimensionFilter(projectId, auth);

      const reqBody: any = { dateRanges: [{ startDate, endDate }], dimensions, metrics, limit };
      if (dimensionFilter) reqBody.dimensionFilter = dimensionFilter;

      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${normalizedPropertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        },
      );
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("ga4-fetch: non-JSON response", res.status, text.slice(0, 500));
        return json(
          {
            error: "GA4 API returned non-JSON response (sannolikt auth- eller property-fel)",
            status: res.status,
            details: text.slice(0, 500),
          },
          res.status >= 400 ? res.status : 502,
        );
      }
      if (!res.ok) {
        const reauth = detectScopeError(res.status, data);
        if (reauth) {
          if (projectId) await markSourceStatus({ projectId, source: "ga4", status: "reauth_required", lastError: reauth.error, bumpSynced: false });
          return json(reauth, 200);
        }
        if (projectId) await markSourceStatus({ projectId, source: "ga4", status: "error", lastError: data?.error?.message || `HTTP ${res.status}`, bumpSynced: false });
        return json(data, res.status);
      }
      if (projectId) await markSourceStatus({ projectId, source: "ga4", status: "ok", meta: { propertyId: String(propertyId) } });

      // Optionally persist as snapshot
      if (persist && projectId) {
        const url = Deno.env.get("SUPABASE_URL")!;
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(url, key, { global: { headers: { Authorization: auth || "" } } });
        const dimNames = (dimensions as any[]).map((d) => d.name);
        const metNames = (metrics as any[]).map((m) => m.name);
        const rows = (data.rows || []).map((r: any) => {
          const row: any = {};
          dimNames.forEach((n, i) => (row[n] = r.dimensionValues?.[i]?.value));
          metNames.forEach((n, i) => (row[n] = Number(r.metricValues?.[i]?.value || 0)));
          if (row.sessions !== undefined) row.sessions = Number(row.sessions);
          if (row.totalUsers !== undefined) row.users = Number(row.totalUsers);
          if (row.screenPageViews !== undefined) row.pageviews = Number(row.screenPageViews);
          if (row.conversions !== undefined) row.conversions = Number(row.conversions);
          return row;
        });
        const totals: any = {};
        metNames.forEach((n) => {
          totals[n] = rows.reduce((s: number, r: any) => s + (Number(r[n]) || 0), 0);
        });
        if (totals.totalUsers !== undefined) totals.users = totals.totalUsers;
        if (totals.screenPageViews !== undefined) totals.pageviews = totals.screenPageViews;

        // Apply conversion event filters: re-fetch breakdown by eventName if needed
        if (totals.conversions !== undefined || totals.keyEvents !== undefined) {
          const { data: filters } = await sb
            .from("ga4_conversion_filters")
            .select("event_name, mode, is_active")
            .eq("project_id", projectId)
            .eq("is_active", true);
          const allow = (filters || []).filter((f: any) => f.mode === "allow").map((f: any) => f.event_name);
          const deny = (filters || []).filter((f: any) => f.mode === "deny").map((f: any) => f.event_name);
          if (allow.length || deny.length) {
            // Fetch event-level conversion breakdown
            const evRes = await fetch(
              `https://analyticsdata.googleapis.com/v1beta/properties/${normalizedPropertyId}:runReport`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  dateRanges: [{ startDate, endDate }],
                  dimensions: [{ name: "eventName" }],
                  metrics: [{ name: "conversions" }],
                  limit: 200,
                }),
              },
            );
            const evData = await evRes.json().catch(() => ({}));
            const evRows = evData.rows || [];
            let filteredConv = 0;
            let filteredKey = 0;
            const breakdown: Record<string, { conversions: number; keyEvents: number }> = {};
            for (const r of evRows) {
              const name = r.dimensionValues?.[0]?.value || "";
              const c = Number(r.metricValues?.[0]?.value || 0);
              const k = c; // GA4 aliases keyEvents to conversions
              breakdown[name] = { conversions: c, keyEvents: k };
              const include = allow.length ? allow.includes(name) : !deny.includes(name);
              if (include) {
                filteredConv += c;
                filteredKey += k;
              }
            }
            totals.conversions_raw = totals.conversions;
            totals.keyEvents_raw = totals.keyEvents;
            totals.conversions = filteredConv;
            totals.keyEvents = filteredKey;
            totals.event_breakdown = breakdown;
            totals.filter_applied = { allow, deny };
          }
        }

        const today = new Date();
        const end = endDate === "today" ? today : new Date(endDate);
        const start = startDate.endsWith("daysAgo")
          ? new Date(today.getTime() - parseInt(startDate) * 86400000)
          : new Date(startDate);

        await sb.from("ga4_snapshots").insert({
          project_id: projectId,
          property_id: String(propertyId),
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          rows,
          totals,
        });
      }

      return json(data, res.status);
    }

    if (action === "eventBreakdown") {
      const { propertyId, startDate = "28daysAgo", endDate = "today" } = body;
      if (!propertyId) return json({ error: "propertyId required" }, 400);
      const normalizedPropertyId = String(propertyId).trim().replace(/^properties\//i, "").replace(/\D/g, "");
      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${normalizedPropertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "eventName" }],
            metrics: [{ name: "eventCount" }, { name: "conversions" }],
            orderBys: [{ metric: { metricName: "conversions" }, desc: true }],
            limit: 100,
          }),
        },
      );
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        return json({ error: "GA4 API non-JSON", details: text.slice(0, 500) }, 502);
      }
      if (!res.ok) return json(data, res.status);
      const events = (data.rows || []).map((r: any) => ({
        eventName: r.dimensionValues?.[0]?.value,
        eventCount: Number(r.metricValues?.[0]?.value || 0),
        conversions: Number(r.metricValues?.[1]?.value || 0),
        keyEvents: Number(r.metricValues?.[1]?.value || 0),
      }));
      return json({ events });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("ga4-fetch error", e);
    const msg = String(e instanceof Error ? e.message : e);
    if (projectIdForStatus) await markSourceStatus({ projectId: projectIdForStatus, source: "ga4", status: classifyGoogleError(msg), lastError: msg, bumpSynced: false });
    return json({ error: msg }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function detectScopeError(status: number, data: any): { error: string; code: string; reauthRequired: true } | null {
  if (status !== 403) return null;
  const reason = data?.error?.details?.[0]?.reason || data?.error?.errors?.[0]?.reason || "";
  const msg = data?.error?.message || "";
  if (
    reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    reason === "insufficientPermissions" ||
    /insufficient authentication scopes/i.test(msg)
  ) {
    return {
      error: "MISSING_GA4_SCOPE: GA4-scope saknas i sparad token. Anslut Google igen.",
      code: "MISSING_GA4_SCOPE",
      reauthRequired: true,
    };
  }
  return null;
}
