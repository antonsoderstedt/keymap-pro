// Daily wrapper that runs ads-pacing for all projects with an Ads customer ID.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data: settings } = await sb
      .from("project_google_settings")
      .select("project_id, ads_customer_id")
      .not("ads_customer_id", "is", null);

    let count = 0;
    for (const row of settings || []) {
      try {
        await fetch(`${url}/functions/v1/ads-pacing`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ project_id: row.project_id, customer_id: row.ads_customer_id }),
        });
        count++;
      } catch (e) {
        console.error("pacing failed", row.project_id, e);
      }
    }
    return new Response(JSON.stringify({ ok: true, projects: count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
