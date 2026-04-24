// Search Console: list sites + query analytics
import { getGoogleAccessToken } from "../_shared/google-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getGoogleAccessToken(req.headers.get("Authorization"));
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "sites";

    if (action === "sites") {
      const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return json(data, res.status);
    }

    if (action === "query") {
      const { siteUrl, startDate, endDate, dimensions = ["query"], rowLimit = 100 } = body;
      if (!siteUrl) return json({ error: "siteUrl required" }, 400);
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
        },
      );
      const data = await res.json();
      return json(data, res.status);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("gsc-fetch error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
