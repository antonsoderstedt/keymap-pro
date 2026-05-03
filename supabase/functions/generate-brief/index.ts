import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const briefSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "SEO-optimerad sidtitel (50-60 tecken)" },
    metaDescription: { type: "string", description: "Meta description 140-160 tecken" },
    h1: { type: "string", description: "Tydlig H1 med primärt sökord" },
    targetWordCount: { type: "number", description: "Rekommenderat ordantal (700-2500)" },
    primaryKeyword: { type: "string" },
    secondaryKeywords: { type: "array", items: { type: "string" }, description: "5-10 sekundära sökord/varianter" },
    lsiTerms: { type: "array", items: { type: "string" }, description: "8-15 semantiskt relaterade entiteter" },
    searchIntent: { type: "string", description: "Kort beskrivning av vad användaren vill veta/göra" },
    outline: {
      type: "array",
      description: "H2-struktur med kort beskrivning per sektion",
      items: {
        type: "object",
        properties: {
          h2: { type: "string" },
          summary: { type: "string", description: "1-2 meningar om vad sektionen ska täcka" },
          h3s: { type: "array", items: { type: "string" }, description: "Valfria H3-underrubriker" },
        },
        required: ["h2", "summary"],
        additionalProperties: false,
      },
    },
    faq: {
      type: "array",
      description: "5-8 frågor och korta svar (PAA-style)",
      items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"],
        additionalProperties: false,
      },
    },
    internalLinks: {
      type: "array",
      description: "3-6 förslag på interna länkar baserade på andra kluster",
      items: {
        type: "object",
        properties: { anchor: { type: "string" }, targetCluster: { type: "string" }, why: { type: "string" } },
        required: ["anchor", "targetCluster", "why"],
        additionalProperties: false,
      },
    },
    externalReferences: { type: "array", items: { type: "string" }, description: "2-4 typer av auktoritativa källor att referera (ex: 'Boverket', 'EU-direktiv')" },
    cta: { type: "string", description: "Konverteringsåtgärd (köp, offert, kontakt etc.)" },
    schemaMarkup: { type: "array", items: { type: "string" }, description: "Föreslagna schema.org-typer (Article, FAQPage, Product, etc.)" },
  },
  required: ["title", "metaDescription", "h1", "targetWordCount", "primaryKeyword", "secondaryKeywords", "lsiTerms", "searchIntent", "outline", "faq", "internalLinks", "cta"],
  additionalProperties: false,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { analysis_id, cluster, force } = await req.json();
    if (!analysis_id || !cluster) throw new Error("analysis_id and cluster required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!force) {
      const { data: existing } = await supabase.from("content_briefs").select("payload").eq("analysis_id", analysis_id).eq("cluster", cluster).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ brief: existing.payload, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: analysis } = await supabase.from("analyses").select("project_id, keyword_universe_json").eq("id", analysis_id).single();
    if (!analysis) throw new Error("Analysis not found");
    const { data: project } = await supabase.from("projects").select("*").eq("id", analysis.project_id).single();

    const universe: any = analysis.keyword_universe_json;
    const allKws = (universe?.keywords || []).filter((k: any) => !k.isNegative);
    const availableClusters = Array.from(new Set(allKws.map((k: any) => k.cluster).filter(Boolean))) as string[];

    let clusterKws = allKws.filter((k: any) => k.cluster === cluster);
    let matchKind: "exact" | "substring" | "top" = "exact";
    let matchedCluster: string = cluster;
    if (clusterKws.length === 0) {
      const needle = String(cluster).toLowerCase();
      const fuzzyCluster = availableClusters.find(
        (c) => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase())
      );
      if (fuzzyCluster) {
        clusterKws = allKws.filter((k: any) => k.cluster === fuzzyCluster);
        matchKind = "substring";
        matchedCluster = fuzzyCluster;
      } else {
        clusterKws = allKws
          .slice()
          .sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
          .slice(0, 30);
        matchKind = "top";
        matchedCluster = "__top_30__";
      }
    }
    if (clusterKws.length === 0) throw new Error("No keywords found for cluster");
    console.log(`[brief] cluster="${cluster}" matched=${clusterKws.length} kind=${matchKind}`);

    const otherClusters = Array.from(new Set((universe?.keywords || []).map((k: any) => k.cluster).filter((c: string) => c !== cluster))).slice(0, 25);
    const topKws = clusterKws.sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)).slice(0, 20);
    const totalVol = topKws.reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);
    const intentMix = topKws.reduce((acc: any, k: any) => { acc[k.intent] = (acc[k.intent] || 0) + 1; return acc; }, {});
    const dominantIntent = Object.entries(intentMix).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "commercial";

    const prompt = `Du är en svensk SEO content strateg. Skapa en utförlig content brief för ett kluster.

FÖRETAG: ${(project as any)?.company || ""}
DOMÄN: ${(project as any)?.domain || "—"}
PRODUKTER: ${(project as any)?.products || "—"}

KLUSTER: ${cluster}
DOMINERANDE INTENT: ${dominantIntent}
TOTAL VOLYM I KLUSTER: ${totalVol}

SÖKORD I KLUSTER (sortet på volym):
${topKws.map((k: any) => `- ${k.keyword} (vol: ${k.searchVolume ?? "?"}, kd: ${k.kd ?? "?"}, intent: ${k.intent})`).join("\n")}

ANDRA KLUSTER (för intern länkning, välj 3-6 relevanta):
${otherClusters.join("\n")}

Krav:
- Briefen ska vara på svenska
- H1 ska innehålla det primära sökordet naturligt
- Outline ska täcka sökintent fullt ut (5-9 H2:s)
- FAQ ska besvara faktiska People-Also-Ask-typ frågor
- Interna länkar ska peka på OUR ANDRA KLUSTER (inte externa sajter)
- Word count baserat på konkurrens och intent (transactional 700-1200, informational 1500-2500)`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Du är en svensk SEO-strateg. Returnera struktur via verktyg." },
          { role: "user", content: prompt },
        ],
        tools: [{ type: "function", function: { name: "submit_brief", description: "Submit content brief", parameters: briefSchema } }],
        tool_choice: { type: "function", function: { name: "submit_brief" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[brief] AI error", aiRes.status, t);
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "AI rate limit nått." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI-krediter slut." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI returned no brief");
    const brief = JSON.parse(toolCall.function.arguments);

    const meta = {
      match_kind: matchKind,
      requested_cluster: cluster,
      matched_cluster: matchedCluster,
      available_clusters: availableClusters,
    };
    const payload = { ...brief, _meta: meta };

    await supabase.from("content_briefs").upsert({ analysis_id, cluster, payload }, { onConflict: "analysis_id,cluster" });

    return new Response(JSON.stringify({ brief: payload, cached: false, meta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-brief] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
