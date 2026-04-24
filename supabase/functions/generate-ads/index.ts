import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdGroupInput = {
  ad_group: string;
  keywords: string[];
  final_url?: string;
  intent?: string;
  cluster?: string;
};

type RsaPayload = {
  headlines: string[];     // exactly 15, max 30 chars each
  descriptions: string[];  // exactly 4, max 90 chars each
  path1: string;           // max 15 chars
  path2: string;           // max 15 chars
  final_url: string;
  sitelinks: { text: string; description1: string; description2: string; final_url: string }[];
  callouts: string[];      // max 25 chars each
};

const trim = (s: string, max: number) => {
  const t = (s || "").replace(/[\r\n]+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
};

function validate(payload: any, fallbackUrl: string): RsaPayload {
  const headlines: string[] = Array.isArray(payload?.headlines) ? payload.headlines : [];
  const descriptions: string[] = Array.isArray(payload?.descriptions) ? payload.descriptions : [];
  const sitelinks: any[] = Array.isArray(payload?.sitelinks) ? payload.sitelinks : [];
  const callouts: string[] = Array.isArray(payload?.callouts) ? payload.callouts : [];

  // Pad with safe defaults
  while (headlines.length < 15) headlines.push("Kontakta oss idag");
  while (descriptions.length < 4) descriptions.push("Kontakta oss för en kostnadsfri offert.");

  return {
    headlines: headlines.slice(0, 15).map((h) => trim(h, 30)),
    descriptions: descriptions.slice(0, 4).map((d) => trim(d, 90)),
    path1: trim(payload?.path1 || "", 15),
    path2: trim(payload?.path2 || "", 15),
    final_url: payload?.final_url || fallbackUrl || "https://example.com/",
    sitelinks: sitelinks.slice(0, 4).map((s) => ({
      text: trim(s?.text || "Läs mer", 25),
      description1: trim(s?.description1 || "", 35),
      description2: trim(s?.description2 || "", 35),
      final_url: s?.final_url || fallbackUrl || "https://example.com/",
    })),
    callouts: callouts.slice(0, 6).map((c) => trim(c, 25)),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, analysis_id, ad_groups, brand } = await req.json();
    if (!project_id || !analysis_id || !Array.isArray(ad_groups) || ad_groups.length === 0) {
      return new Response(JSON.stringify({ error: "project_id, analysis_id and ad_groups required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
    const brandName = brand || project?.company || "Vårt företag";
    const baseUrl = project?.domain ? (project.domain.startsWith("http") ? project.domain : `https://${project.domain}`) : "https://example.com";

    const adSchema = {
      type: "object",
      properties: {
        headlines: { type: "array", items: { type: "string" }, minItems: 15, maxItems: 15, description: "15 unika headlines, MAX 30 tecken vardera. Inkludera sökord, USP, CTA, plats om relevant." },
        descriptions: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4, description: "4 descriptions, MAX 90 tecken vardera. Med CTA." },
        path1: { type: "string", description: "MAX 15 tecken. Visnings-URL del 1." },
        path2: { type: "string", description: "MAX 15 tecken. Visnings-URL del 2." },
        final_url: { type: "string", description: "Final URL för annonsen." },
        sitelinks: {
          type: "array", minItems: 4, maxItems: 4,
          items: { type: "object", properties: {
            text: { type: "string", description: "Max 25 tecken" },
            description1: { type: "string", description: "Max 35 tecken" },
            description2: { type: "string", description: "Max 35 tecken" },
            final_url: { type: "string" },
          }, required: ["text", "description1", "description2", "final_url"] },
        },
        callouts: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 6, description: "6 callouts, MAX 25 tecken vardera (USP)." },
      },
      required: ["headlines", "descriptions", "path1", "path2", "final_url", "sitelinks", "callouts"],
    };

    const drafts: { ad_group: string; payload: RsaPayload }[] = [];

    // Sequential to avoid rate limits — adgroups usually <20 per analysis
    for (const ag of ad_groups as AdGroupInput[]) {
      const finalUrl = ag.final_url || `${baseUrl}/`;
      const prompt = `Skapa en Responsive Search Ad på SVENSKA för:

Företag: ${brandName}
Annonsgrupp: ${ag.ad_group}
Cluster: ${ag.cluster || "n/a"}
Intent: ${ag.intent || "commercial"}
Sökord (representativa): ${ag.keywords.slice(0, 8).join(", ")}
Final URL: ${finalUrl}

Krav:
- 15 UNIKA headlines, varje ≤30 tecken. Variera: sökord, USP, CTA, plats, prisnivå, garanti.
- 4 descriptions, varje ≤90 tecken, med tydlig CTA.
- path1 + path2: visnings-URL-segment ≤15 tecken vardera (t.ex. produkt + plats).
- 4 sitelinks som leder till relaterade undersidor.
- 6 callouts (USP) ≤25 tecken vardera.
Returnera STRIKT enligt schema. Räkna tecken NOGGRANT.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: "Du är expert på Google Ads copywriting på svenska. Du följer ALLTID teckengränser exakt." },
            { role: "user", content: prompt },
          ],
          tools: [{ type: "function", function: { name: "create_rsa", description: "Returnera Responsive Search Ad", parameters: adSchema } }],
          tool_choice: { type: "function", function: { name: "create_rsa" } },
        }),
      });

      if (!aiRes.ok) {
        console.error(`[generate-ads] AI ${aiRes.status} for "${ag.ad_group}":`, await aiRes.text());
        continue;
      }

      const aiJson = await aiRes.json();
      const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : {};
      const validated = validate({ ...args, final_url: args.final_url || finalUrl }, finalUrl);

      drafts.push({ ad_group: ag.ad_group, payload: validated });
    }

    // Replace existing drafts for this analysis
    await supabase.from("ad_drafts").delete().eq("analysis_id", analysis_id);
    if (drafts.length > 0) {
      const { error: insErr } = await supabase.from("ad_drafts").insert(
        drafts.map((d) => ({ analysis_id, ad_group: d.ad_group, payload: d.payload }))
      );
      if (insErr) console.error("[generate-ads] insert err:", insErr);
    }

    return new Response(JSON.stringify({ success: true, drafts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-ads] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
