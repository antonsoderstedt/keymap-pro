// GA4: list properties + run a basic report
import { getGoogleAccessToken } from "../_shared/google-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await getGoogleAccessToken(req.headers.get("Authorization"));
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "properties";

    if (action === "properties") {
      // List GA4 account summaries (includes property IDs)
      const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return json(data, res.status);
    }

    if (action === "report") {
      const {
        propertyId,
        startDate = "28daysAgo",
        endDate = "today",
        dimensions = [{ name: "date" }],
        metrics = [{ name: "sessions" }, { name: "totalUsers" }],
        limit = 100,
      } = body;
      if (!propertyId) return json({ error: "propertyId required" }, 400);
      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions,
            metrics,
            limit,
          }),
        },
      );
      const data = await res.json();
      return json(data, res.status);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("ga4-fetch error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
