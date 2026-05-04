// Generates a personalized Google Ads Script for a project.
// Returns the script source code with the project's webhook URL and per-project secret embedded.
// Requires authenticated project member access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify membership via security-definer fn
    const { data: isMember } = await admin.rpc("is_project_member", {
      _project_id: project_id, _user_id: userData.user.id,
    });
    if (!isMember) return json({ error: "forbidden" }, 403);

    // Load or generate per-project secret
    let { data: settings } = await admin
      .from("project_google_settings")
      .select("ads_script_secret, ads_customer_id")
      .eq("project_id", project_id)
      .maybeSingle();

    if (!settings) return json({ error: "project_google_settings_missing — connect Google Ads first" }, 400);

    let secret = settings.ads_script_secret;
    if (!secret) {
      secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error: uErr } = await admin
        .from("project_google_settings")
        .update({ ads_script_secret: secret })
        .eq("project_id", project_id);
      if (uErr) throw uErr;
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/ads-webhook-auction-insights`;
    const masterSecretMissing = !Deno.env.get("ADS_WEBHOOK_SECRET");
    if (masterSecretMissing) return json({ error: "ADS_WEBHOOK_SECRET not configured on server" }, 500);

    const script = renderScript({ webhookUrl, projectId: project_id, perProjectSecret: secret });

    return json({
      ok: true,
      webhook_url: webhookUrl,
      project_id,
      per_project_secret: secret,
      script,
      customer_id: settings.ads_customer_id || null,
    });
  } catch (e: any) {
    console.error("ads-script-template", e);
    return json({ error: e.message || "internal" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderScript(opts: { webhookUrl: string; projectId: string; perProjectSecret: string }) {
  // Note: Google Ads Scripts environment provides AdsApp, Utilities, UrlFetchApp.
  // The HMAC key is master + "." + per-project secret. The master never leaves the server,
  // so we send it as part of the secret embedded in the script (combined upstream).
  // For simplicity & since the script lives in the user's own Ads account, we embed the
  // already-combined HMAC key directly. The webhook recomputes the same combination server-side.
  return `// =====================================================================
// Slay Station – Auction Insights Reporter
// Project: ${opts.projectId}
// =====================================================================
// This script runs daily inside your Google Ads account and sends
// Auction Insights data (competitor domains) to Slay Station.
//
// SETUP:
//  1. Google Ads → Tools → Bulk Actions → Scripts → New Script
//  2. Paste this entire file
//  3. Click "Authorize" (grants access to read your reports + send HTTPS)
//  4. Click "Preview" once to verify it works
//  5. Schedule: Frequency = Daily
// =====================================================================

var WEBHOOK_URL = ${JSON.stringify(opts.webhookUrl)};
var PROJECT_ID  = ${JSON.stringify(opts.projectId)};
var SECRET      = ${JSON.stringify(opts.perProjectSecret)};
var DAYS        = 30;

function main() {
  var customerId = AdsApp.currentAccount().getCustomerId();
  var range = dateRange(DAYS);
  var campaigns = collectCampaigns(range);

  var competitorCount = 0;
  for (var i = 0; i < campaigns.length; i++) {
    competitorCount += (campaigns[i].competitors || []).length;
  }
  if (competitorCount === 0) {
    Logger.log('Ingen Auction Insights-data kunde hämtas. Google blockerar ofta dessa metrics programmässigt om kontot/developer-miljön inte är allowlistad. Ingen tom snapshot skickas till Slay Station.');
    return;
  }

  var payload = {
    customer_id: customerId,
    start_date:  range.start,
    end_date:    range.end,
    campaigns:   campaigns,
    sent_at:     new Date().toISOString(),
  };

  var body = JSON.stringify(payload);
  var signature = hmacSha256Hex(SECRET, body);

  var resp = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    muteHttpExceptions: true,
    headers: {
      'X-Slay-Project':   PROJECT_ID,
      'X-Slay-Signature': signature,
    },
  });

  Logger.log('Slay Station webhook → ' + resp.getResponseCode() + ' ' + resp.getContentText());
}

function dateRange(days) {
  var end = new Date();
  var start = new Date(); start.setDate(end.getDate() - days);
  function fmt(d){ return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
  return { start: fmt(start), end: fmt(end) };
}

function collectCampaigns(range) {
  var out = [];
  var iter = AdsApp.campaigns()
    .withCondition("Status = ENABLED")
    .withCondition("AdvertisingChannelType = SEARCH")
    .get();

  while (iter.hasNext()) {
    var c = iter.next();
    var cid = c.getId();
    var name = c.getName();
    var competitors = fetchAuctionInsights(cid, range);
    out.push({
      id: String(cid),
      name: name,
      is_brand: /brand|varum[äa]rk/i.test(name),
      competitors: competitors,
    });
  }
  return out;
}

function fetchAuctionInsights(campaignId, range) {
  // Auction Insights in Google Ads Scripts is exposed as allowlisted metrics
  // on the campaign resource, segmented by segments.auction_insight_domain.
  var gaql =
    "SELECT " +
      "campaign.id, " +
      "campaign.name, " +
      "segments.auction_insight_domain, " +
      "metrics.auction_insight_search_impression_share, " +
      "metrics.auction_insight_search_overlap_rate, " +
      "metrics.auction_insight_search_position_above_rate, " +
      "metrics.auction_insight_search_top_impression_percentage, " +
      "metrics.auction_insight_search_absolute_top_impression_percentage, " +
      "metrics.auction_insight_search_outranking_share " +
    "FROM campaign " +
    "WHERE segments.date BETWEEN '" + range.start + "' AND '" + range.end + "' " +
      "AND campaign.id = " + campaignId;

  var rows = [];
  try {
    var it = AdsApp.report(gaql).rows();
    while (it.hasNext()) {
      var r = it.next();
      var domain = String(r['segments.auction_insight_domain'] || '').toLowerCase().trim();
      if (!domain || domain === 'you') continue;
      rows.push({
        domain: domain,
        impression_share:     numOrNull(r['metrics.auction_insight_search_impression_share']),
        overlap_rate:         numOrNull(r['metrics.auction_insight_search_overlap_rate']),
        position_above_rate:  numOrNull(r['metrics.auction_insight_search_position_above_rate']),
        top_of_page_rate:     numOrNull(r['metrics.auction_insight_search_top_impression_percentage']),
        abs_top_of_page_rate: numOrNull(r['metrics.auction_insight_search_absolute_top_impression_percentage']),
        outranking_share:     numOrNull(r['metrics.auction_insight_search_outranking_share']),
      });
    }
  } catch (e) {
    var msg = String(e);
    if (/doesn.t have access to metrics|auction_insight/i.test(msg)) {
      Logger.log('Google Ads blockerar Auction Insights-metrics för det här kontot/scriptmiljön. Be Google Ads-supporten allowlista Auction Insights metrics, eller exportera Auction Insights manuellt från Google Ads UI. Originalfel: ' + msg);
      return rows;
    }
    Logger.log('Skipping campaign ' + campaignId + ': ' + msg);
  }
  return rows;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  var n = parseFloat(v);
  if (!isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function hmacSha256Hex(key, message) {
  var sig = Utilities.computeHmacSha256Signature(message, key);
  var hex = '';
  for (var i = 0; i < sig.length; i++) {
    var b = sig[i] & 0xff;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}
`;
}
