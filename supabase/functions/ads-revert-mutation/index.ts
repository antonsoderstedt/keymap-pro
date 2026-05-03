// Revert a previous mutation logged in ads_mutations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, mutateAds } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { mutation_id } = await req.json();
    if (!mutation_id) throw new Error("mutation_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: m } = await admin.from("ads_mutations").select("*").eq("id", mutation_id).maybeSingle();
    if (!m) throw new Error("NOT_FOUND");
    if (m.status !== "success") throw new Error("NOT_REVERTABLE: kan endast återställa lyckade mutations");
    if (m.reverted_at) throw new Error("ALREADY_REVERTED");

    const ctx = await getAdsContext(req.headers.get("Authorization"));
    const cid = (m.customer_id || "").replace(/[^0-9]/g, "");

    let response: any = null;

    if (m.action_type === "add_negative_keyword") {
      const rn = m.revert_payload?.resource_name;
      if (!rn) throw new Error("NO_REVERT_DATA");
      response = await mutateAds(ctx, cid, "campaignCriteria", [{ remove: rn }]);
    } else if (m.action_type === "pause_keyword" || m.action_type === "resume_keyword") {
      const rn = m.revert_payload?.resource_name;
      const prev = m.revert_payload?.prev_status || "ENABLED";
      response = await mutateAds(ctx, cid, "adGroupCriteria", [{ update: { resourceName: rn, status: prev }, updateMask: "status" }]);
    } else if (m.action_type === "pause_ad" || m.action_type === "resume_ad") {
      const rn = m.revert_payload?.resource_name;
      const prev = m.revert_payload?.prev_status || "ENABLED";
      response = await mutateAds(ctx, cid, "adGroupAds", [{ update: { resourceName: rn, status: prev }, updateMask: "status" }]);
    } else if (m.action_type === "replace_rsa_asset") {
      const rn = m.revert_payload?.resource_name;
      const rsa = m.revert_payload?.rsa_revert;
      if (!rn || !rsa) throw new Error("NO_REVERT_DATA");
      response = await mutateAds(ctx, cid, "adGroupAds", [{
        update: {
          resourceName: rn,
          ad: { responsiveSearchAd: { headlines: rsa.headlines, descriptions: rsa.descriptions } },
        },
        updateMask: "ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
      }]);
    } else if (m.action_type === "rsa_batch") {
      const items = m.revert_payload?.items || [];
      const ops = items.map((it: any) => ({
        update: {
          resourceName: it.resource_name,
          ad: { responsiveSearchAd: { headlines: it.rsa_revert?.headlines, descriptions: it.rsa_revert?.descriptions } },
        },
        updateMask: "ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
      })).filter((o: any) => o.update.resourceName);
      if (ops.length === 0) throw new Error("NO_REVERT_DATA");
      response = await mutateAds(ctx, cid, "adGroupAds", ops, true);
    } else {
      throw new Error("UNSUPPORTED_REVERT");
    }

    await admin.from("ads_mutations").update({
      status: "reverted",
      reverted_at: new Date().toISOString(),
      response: { revert: response, original: m.response },
    }).eq("id", mutation_id);

    return json({ ok: true });
  } catch (e: any) {
    console.error("ads-revert-mutation", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    return json({ error: msg, code }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
