// RSA Asset Performance — analyserar headlines/descriptions per ad group och föreslår
// ersättare för LOW/PENDING-assets baserat på BEST-mönster + brand voice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trim = (s: string, max: number) => {
  const t = (s || "").replace(/[\r\n]+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { project_id, suggest_replacements = true } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER: Inget Google Ads-konto valt");

    const [{ data: project }, { data: brand }] = await Promise.all([
      admin.from("projects").select("company, domain, description").eq("id", project_id).maybeSingle(),
      admin.from("brand_kits").select("tone, voice_guidelines").eq("project_id", project_id).maybeSingle(),
    ]);

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    // Fetch RSA asset performance per ad
    const rows = await searchGaql(ctx, settings.ads_customer_id, `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad_asset_view.field_type,
        ad_group_ad_asset_view.performance_label,
        asset.text_asset.text,
        asset.id,
        ad_group.name,
        ad_group.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
      FROM ad_group_ad_asset_view
      WHERE segments.date DURING LAST_30_DAYS
        AND ad_group_ad_asset_view.field_type IN (HEADLINE, DESCRIPTION)
        AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
      ORDER BY metrics.impressions DESC
      LIMIT 500
    `);

    // Group by ad_group + ad
    type AssetRow = {
      ad_id: string;
      ad_group_id: string;
      ad_group: string;
      campaign: string;
      asset_id: string;
      field_type: string;
      label: string; // BEST/GOOD/LOW/PENDING/LEARNING
      text: string;
      impressions: number;
      clicks: number;
      conversions: number;
      cost_sek: number;
    };

    const assets: AssetRow[] = rows.map((r: any) => ({
      ad_id: String(r.adGroupAd?.ad?.id ?? ""),
      ad_group_id: String(r.adGroup?.id ?? ""),
      ad_group: r.adGroup?.name ?? "",
      campaign: r.campaign?.name ?? "",
      asset_id: String(r.asset?.id ?? ""),
      field_type: r.adGroupAdAssetView?.fieldType ?? "",
      label: r.adGroupAdAssetView?.performanceLabel ?? "PENDING",
      text: r.asset?.textAsset?.text ?? "",
      impressions: Number(r.metrics?.impressions || 0),
      clicks: Number(r.metrics?.clicks || 0),
      conversions: Number(r.metrics?.conversions || 0),
      cost_sek: Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000),
    }));

    // Aggregate ads
    const adsMap = new Map<string, {
      ad_id: string; ad_group_id: string; ad_group: string; campaign: string;
      best: AssetRow[]; good: AssetRow[]; low: AssetRow[]; pending: AssetRow[];
    }>();
    for (const a of assets) {
      if (!a.ad_id) continue;
      let bucket = adsMap.get(a.ad_id);
      if (!bucket) {
        bucket = { ad_id: a.ad_id, ad_group_id: a.ad_group_id, ad_group: a.ad_group, campaign: a.campaign, best: [], good: [], low: [], pending: [] };
        adsMap.set(a.ad_id, bucket);
      }
      const lbl = (a.label || "").toUpperCase();
      if (lbl === "BEST") bucket.best.push(a);
      else if (lbl === "GOOD") bucket.good.push(a);
      else if (lbl === "LOW") bucket.low.push(a);
      else bucket.pending.push(a);
    }

    const adGroups = Array.from(adsMap.values())
      .filter((g) => g.low.length > 0 || g.best.length > 0)
      .sort((a, b) => b.low.length - a.low.length)
      .slice(0, 10);

    // Generate AI replacement suggestions for ad groups with LOW assets
    const suggestions: any[] = [];
    if (suggest_replacements && adGroups.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

      for (const ag of adGroups.filter((g) => g.low.length > 0).slice(0, 5)) {
        const winners = [...ag.best, ...ag.good].map((a) => ({ field: a.field_type, text: a.text }));
        const losers = ag.low.map((a) => ({ asset_id: a.asset_id, field: a.field_type, text: a.text }));
        if (losers.length === 0) continue;

        const prompt = `Företag: ${project?.company || "Vårt företag"}
${project?.description ? `Beskrivning: ${project.description}` : ""}
Annonsgrupp: ${ag.ad_group}
Kampanj: ${ag.campaign}
Brand voice: ${brand?.tone || "professional"}${brand?.voice_guidelines ? `\nGuidelines: ${brand.voice_guidelines}` : ""}

VINNANDE assets (BEST/GOOD) — efterlikna dessa mönster:
${winners.length > 0 ? winners.map((w) => `- [${w.field}] ${w.text}`).join("\n") : "(inga vinnare ännu)"}

FÖRLORANDE assets (LOW) — föreslå ersättare:
${losers.map((l) => `- [${l.field}] (id ${l.asset_id}) ${l.text}`).join("\n")}

Generera EXAKT 3 ersättningsförslag för VARJE förlorande asset. Headlines max 30 tecken, descriptions max 90 tecken. Variera vinkel: USP, CTA, fördel, social proof.`;

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: "Du är expert Google Ads copywriter på svenska. Följ alltid teckengränser." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "suggest_replacements",
                description: "Ersättningsförslag per LOW-asset",
                parameters: {
                  type: "object",
                  properties: {
                    replacements: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          loser_asset_id: { type: "string" },
                          field: { type: "string", enum: ["HEADLINE", "DESCRIPTION"] },
                          original: { type: "string" },
                          candidates: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                          rationale: { type: "string" },
                        },
                        required: ["loser_asset_id", "field", "original", "candidates"],
                      },
                    },
                  },
                  required: ["replacements"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "suggest_replacements" } },
          }),
        });

        if (!aiRes.ok) {
          console.error("[ads-rsa-performance] AI failed", aiRes.status);
          continue;
        }
        const aiJson = await aiRes.json();
        const tc = aiJson.choices?.[0]?.message?.tool_calls?.[0];
        const args = tc ? JSON.parse(tc.function.arguments) : { replacements: [] };

        const cleaned = (args.replacements || []).map((r: any) => ({
          ...r,
          candidates: (r.candidates || []).map((c: string) => trim(c, r.field === "HEADLINE" ? 30 : 90)),
        }));

        suggestions.push({
          ad_id: ag.ad_id,
          ad_group: ag.ad_group,
          ad_group_id: ag.ad_group_id,
          campaign: ag.campaign,
          best_count: ag.best.length,
          good_count: ag.good.length,
          low_count: ag.low.length,
          replacements: cleaned,
        });
      }
    }

    // Summary
    const totalLow = adGroups.reduce((s, g) => s + g.low.length, 0);
    const totalBest = adGroups.reduce((s, g) => s + g.best.length, 0);

    return json({
      ok: true,
      summary: {
        ads_analysed: adsMap.size,
        ads_with_low_assets: adGroups.filter((g) => g.low.length > 0).length,
        total_low_assets: totalLow,
        total_best_assets: totalBest,
      },
      ad_groups: adGroups.map((g) => ({
        ad_id: g.ad_id,
        ad_group: g.ad_group,
        campaign: g.campaign,
        best: g.best.map((a) => ({ asset_id: a.asset_id, field: a.field_type, text: a.text, impressions: a.impressions })),
        low: g.low.map((a) => ({ asset_id: a.asset_id, field: a.field_type, text: a.text, impressions: a.impressions })),
      })),
      suggestions,
    });
  } catch (e: any) {
    console.error("ads-rsa-performance", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    return json({ error: msg, code }, code === "NO_ADS_CUSTOMER" ? 400 : 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
