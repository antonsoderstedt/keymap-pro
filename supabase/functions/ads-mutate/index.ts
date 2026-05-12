// Write-back to Google Ads. Audit-loggar i ads_mutations.
// Stödda action_type: add_negative_keyword, pause_keyword, pause_ad, resume_keyword, resume_ad,
// remove_resource, replace_rsa_asset, rsa_batch
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, mutateAds, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const KEYWORD_MATCH_TYPES = ["EXACT", "PHRASE", "BROAD"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { project_id, action_type, payload, source_action_item_id, proposal_id } = body;
    if (!project_id || !action_type || !payload) throw new Error("project_id, action_type, payload required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER: Inget Google Ads-konto valt");
    const cid = settings.ads_customer_id.replace(/[^0-9]/g, "");

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    // Pre-insert log entry
    const { data: logRow, error: logErr } = await admin.from("ads_mutations").insert({
      project_id,
      customer_id: cid,
      action_type,
      payload,
      source_action_item_id: source_action_item_id || null,
      status: "pending",
      created_by: ctx.userId,
    }).select().single();
    if (logErr) throw logErr;

    let response: any;
    let revertPayload: any = null;

    try {
      if (action_type === "add_negative_keyword") {
        // payload: { keyword: string, match_type: EXACT|PHRASE|BROAD, scope: 'campaign'|'shared', campaign_id?: string }
        const matchType = (payload.match_type || "PHRASE").toUpperCase();
        if (!KEYWORD_MATCH_TYPES.includes(matchType as any)) throw new Error("INVALID_MATCH_TYPE");
        if (!payload.keyword) throw new Error("MISSING_KEYWORD");
        if (!payload.campaign_id) throw new Error("MISSING_CAMPAIGN_ID");

        const op = {
          create: {
            campaign: `customers/${cid}/campaigns/${payload.campaign_id}`,
            negative: true,
            keyword: { text: String(payload.keyword), matchType },
          },
        };
        response = await mutateAds(ctx, cid, "campaignCriteria", [op]);
        const created = response?.results?.[0]?.resourceName;
        revertPayload = created ? { resource_name: created } : null;
      } else if (action_type === "pause_keyword") {
        // payload: { ad_group_id: string, criterion_id: string }
        if (!payload.ad_group_id || !payload.criterion_id) throw new Error("MISSING_IDS");
        const rn = `customers/${cid}/adGroupCriteria/${payload.ad_group_id}~${payload.criterion_id}`;
        const op = {
          update: { resourceName: rn, status: "PAUSED" },
          updateMask: "status",
        };
        response = await mutateAds(ctx, cid, "adGroupCriteria", [op]);
        revertPayload = { resource_name: rn, prev_status: "ENABLED" };
      } else if (action_type === "resume_keyword") {
        if (!payload.ad_group_id || !payload.criterion_id) throw new Error("MISSING_IDS");
        const rn = `customers/${cid}/adGroupCriteria/${payload.ad_group_id}~${payload.criterion_id}`;
        const op = { update: { resourceName: rn, status: "ENABLED" }, updateMask: "status" };
        response = await mutateAds(ctx, cid, "adGroupCriteria", [op]);
        revertPayload = { resource_name: rn, prev_status: "PAUSED" };
      } else if (action_type === "pause_ad") {
        // payload: { ad_group_id: string, ad_id: string }
        if (!payload.ad_group_id || !payload.ad_id) throw new Error("MISSING_IDS");
        const rn = `customers/${cid}/adGroupAds/${payload.ad_group_id}~${payload.ad_id}`;
        const op = { update: { resourceName: rn, status: "PAUSED" }, updateMask: "status" };
        response = await mutateAds(ctx, cid, "adGroupAds", [op]);
        revertPayload = { resource_name: rn, prev_status: "ENABLED" };
      } else if (action_type === "resume_ad") {
        if (!payload.ad_group_id || !payload.ad_id) throw new Error("MISSING_IDS");
        const rn = `customers/${cid}/adGroupAds/${payload.ad_group_id}~${payload.ad_id}`;
        const op = { update: { resourceName: rn, status: "ENABLED" }, updateMask: "status" };
        response = await mutateAds(ctx, cid, "adGroupAds", [op]);
        revertPayload = { resource_name: rn, prev_status: "PAUSED" };
      } else if (action_type === "remove_resource") {
        // Generic revert helper. payload: { service: string, resource_name: string }
        if (!payload.service || !payload.resource_name) throw new Error("MISSING_REVERT");
        const op = { remove: payload.resource_name };
        response = await mutateAds(ctx, cid, payload.service, [op]);
      } else if (action_type === "replace_rsa_asset") {
        // payload: { ad_group_id, ad_id, replacements: [{ field: 'HEADLINE'|'DESCRIPTION', original_text, new_text }] }
        if (!payload.ad_group_id || !payload.ad_id || !Array.isArray(payload.replacements)) {
          throw new Error("MISSING_IDS");
        }
        const result = await replaceRsaAssets(ctx, cid, payload);
        response = result.response;
        revertPayload = result.revert;
      } else if (action_type === "rsa_batch") {
        // payload: { items: [{ ad_group_id, ad_id, replacements: [...] }] }
        if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error("MISSING_IDS");
        const results: any[] = [];
        const reverts: any[] = [];
        for (const item of payload.items) {
          try {
            const r = await replaceRsaAssets(ctx, cid, item);
            results.push({ ad_id: item.ad_id, ok: true, response: r.response });
            reverts.push({ ad_id: item.ad_id, ...r.revert });
          } catch (err: any) {
            results.push({ ad_id: item.ad_id, ok: false, error: err.message });
          }
        }
        response = { batch: results, success: results.filter(r => r.ok).length, total: results.length };
        revertPayload = { items: reverts };
      } else {
        throw new Error(`UNSUPPORTED_ACTION: ${action_type}`);
      }

      // Mark success + optionally close the action item
      await admin.from("ads_mutations").update({
        status: "success",
        response,
        revert_payload: revertPayload,
      }).eq("id", logRow.id);

      if (source_action_item_id) {
        await admin.from("action_items").update({
          status: "done",
          implemented_at: new Date().toISOString(),
          implementation_notes: `Pushat till Google Ads (${action_type}).`,
        }).eq("id", source_action_item_id);
      }

      return json({ ok: true, mutation_id: logRow.id, response, revert_payload: revertPayload });
    } catch (innerErr: any) {
      await admin.from("ads_mutations").update({
        status: "error",
        error_message: innerErr.message?.slice(0, 1000) || "Unknown",
      }).eq("id", logRow.id);
      throw innerErr;
    }
  } catch (e: any) {
    console.error("ads-mutate", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    const map: Record<string, number> = {
      NO_ADS_CUSTOMER: 400, MISSING_IDS: 400, MISSING_KEYWORD: 400,
      MISSING_CAMPAIGN_ID: 400, INVALID_MATCH_TYPE: 400, UNSUPPORTED_ACTION: 400,
      MISSING_REVERT: 400, MISSING_ADS_SCOPE: 403,
    };
    return json({ error: msg, code }, map[code] ?? 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Replace specific RSA headlines/descriptions on an existing ad.
 * Strategy: fetch current RSA via GAQL → build new headlines/descriptions arrays
 * with replacements applied → update via ads:mutate with updateMask.
 * Returns response + revert_payload (containing original arrays for undo).
 */
async function replaceRsaAssets(ctx: any, cid: string, payload: any) {
  const { ad_group_id, ad_id, replacements } = payload;
  const rn = `customers/${cid}/adGroupAds/${ad_group_id}~${ad_id}`;

  // 1. Fetch current RSA
  const gaql = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.responsive_search_ad.path1,
      ad_group_ad.ad.responsive_search_ad.path2,
      ad_group_ad.ad.final_urls
    FROM ad_group_ad
    WHERE ad_group_ad.ad.id = ${ad_id}
      AND ad_group.id = ${ad_group_id}
    LIMIT 1
  `;
  const rows = await searchGaql(ctx, cid, gaql);
  const ad = rows?.[0]?.adGroupAd?.ad;
  const rsa = ad?.responsiveSearchAd;
  if (!rsa) throw new Error("RSA_NOT_FOUND: Annonsen är inte en RSA eller hittades inte");

  const originalHeadlines = [...(rsa.headlines || [])];
  const originalDescriptions = [...(rsa.descriptions || [])];

  const newHeadlines = originalHeadlines.map((a: any) => ({ ...a }));
  const newDescriptions = originalDescriptions.map((a: any) => ({ ...a }));

  for (const r of replacements) {
    const isHeadline = String(r.field).toUpperCase().includes("HEADLINE");
    const list = isHeadline ? newHeadlines : newDescriptions;
    const idx = list.findIndex((a: any) => a.text === r.original_text);
    if (idx >= 0 && r.new_text) {
      list[idx] = { ...list[idx], text: String(r.new_text).slice(0, isHeadline ? 30 : 90) };
    }
  }

  // 2. Validate min counts (RSA needs ≥3 headlines, ≥2 descriptions)
  if (newHeadlines.length < 3) throw new Error("RSA_INVALID: minst 3 headlines krävs");
  if (newDescriptions.length < 2) throw new Error("RSA_INVALID: minst 2 descriptions krävs");

  // 3. Mutate
  const op = {
    update: {
      resourceName: rn,
      ad: {
        responsiveSearchAd: {
          headlines: newHeadlines,
          descriptions: newDescriptions,
        },
      },
    },
    updateMask: "ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
  };
  const response = await mutateAds(ctx, cid, "adGroupAds", [op]);
  const revert = {
    resource_name: rn,
    rsa_revert: {
      headlines: originalHeadlines,
      descriptions: originalDescriptions,
    },
  };
  return { response, revert };
}
