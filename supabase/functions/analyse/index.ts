import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, options } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project
    const { data: project, error: pErr } = await supabase.from("projects").select("*").eq("id", project_id).single();
    if (pErr || !project) throw new Error("Project not found");

    // Get customers
    const { data: customers } = await supabase.from("customers").select("*").eq("project_id", project_id).limit(20);

    // Check for existing scan data
    let scanContext = "";
    if (options?.webscan) {
      const { data: latestAnalysis } = await supabase
        .from("analyses")
        .select("scan_data_json")
        .eq("project_id", project_id)
        .not("scan_data_json", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latestAnalysis?.scan_data_json) {
        scanContext = `\n\nWebbscan-data från kundföretag:\n${JSON.stringify(latestAnalysis.scan_data_json)}`;
      }
    }

    const customerSummary = (customers || []).map((c: any) =>
      `${c.name} | ${c.industry || "?"} | SNI: ${c.sni || "?"} | ${c.domain || "?"} | Oms: ${c.revenue || "?"} | Frekvens: ${c.frequency || "?"} | Produkter: ${c.products || "?"}`
    ).join("\n");

    const enabledModules = Object.entries(options || {}).filter(([_, v]) => v).map(([k]) => k).join(", ");

    const systemPrompt = `Du är en senior SEO- och Google Ads-strateg för den svenska B2B-marknaden. Analysera kunddata och returnera ENBART ett JSON-objekt utan backticks. Tänk som en analytiker: förstå varje bransch inifrån, hur de söker, vilket språk de använder om sina behov och problem.

Returnera EXAKT denna JSON-struktur (inget annat, inga backticks, inga kommentarer):
{
  "summary": "sammanfattning av analysen",
  "totalKeywords": antal_sökord,
  "segments": [{"name": "segmentnamn", "sniCode": "kod", "size": antal, "isNew": false, "opportunityScore": 1-10, "howTheySearch": ["..."], "languagePatterns": ["..."], "useCases": ["..."], "primaryKeywords": [{"keyword": "sökord", "channel": "SEO/Ads", "volumeEstimate": "100-500", "difficulty": "Låg/Medel/Hög", "cpc": "5-15 SEK", "intent": "Köp/Info/Jämför"}], "insight": "insikt"}],
  "keywords": [{"cluster": "klusternamn", "segment": "segmentnamn", "keywords": [{"keyword": "sökord", "type": "Produkt/Problem/Lösning", "channel": "SEO/Ads", "volumeEstimate": "100-500", "difficulty": "Låg/Medel/Hög", "cpc": "5-15 SEK"}]}],
  "expansion": [{"name": "nytt segment", "sniCode": "kod", "why": "motivering", "language": ["termer de använder"], "topKeywords": ["sökord"], "opportunityScore": 1-10}],
  "adsStructure": [{"campaignName": "kampanjnamn", "segment": "segment", "adGroups": [{"name": "annonsgrupp", "broadMatch": ["sökord"], "phraseMatch": ["sökord"], "exactMatch": ["sökord"], "negatives": ["sökord"]}]}],
  "quickWins": [{"keyword": "sökord", "reason": "varför det är en quick win", "channel": "SEO/Ads", "volumeEstimate": "volym", "intent": "Köp/Info", "action": "konkret åtgärd"}]
}

Generera: 4-6 segment, 4-6 kluster, 3-5 expansion, 3-4 kampanjer, 6-10 quick wins.
Använd verkliga svenska B2B-söktermer. Tänk djupt på branschspecifikt språk.
Alla sökord ska vara på det språk som matchar marknaden.`;

    const userPrompt = `Analysera detta företag och dess kunder:

FÖRETAG: ${project.company}
DOMÄN: ${project.domain || "ej angiven"}
MARKNAD: ${project.market}
PRODUKTER/TJÄNSTER: ${project.products || "ej angivet"}
KÄNDA SEGMENT: ${project.known_segments || "ej angivet"}

KUNDDATA (${(customers || []).length} kunder):
${customerSummary}

VALDA MODULER: ${enabledModules}
${scanContext}`;

    console.log("Calling AI gateway for analysis...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit nått. Försök igen om en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Lägg till krediter i Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from AI");

    // Parse JSON from response (handle markdown code blocks)
    let resultJson;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      resultJson = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      throw new Error("AI returnerade ogiltigt JSON-format");
    }

    // Save analysis
    const { error: saveErr } = await supabase.from("analyses").insert({
      project_id,
      options,
      result_json: resultJson,
    });

    if (saveErr) {
      console.error("Save error:", saveErr);
      throw new Error("Kunde inte spara analysresultat");
    }

    console.log("Analysis complete, saved to DB");

    return new Response(JSON.stringify({ success: true, result: resultJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyse error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
