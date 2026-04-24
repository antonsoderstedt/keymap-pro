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

    // === Keyword Research Pass (per segment) ===
    if (options?.keywordResearch && Array.isArray(resultJson?.segments)) {
      console.log(`Running keyword research for ${resultJson.segments.length} segments...`);

      const researchSchema = {
        type: "object",
        properties: {
          clusters: {
            type: "array",
            description: "3-6 semantically grouped clusters covering the segment",
            items: {
              type: "object",
              properties: {
                cluster: { type: "string", description: "Cluster name e.g. 'Laserskärning — pris & offert'" },
                recommendedH1: { type: "string" },
                metaDescription: { type: "string", description: "120-160 chars" },
                urlSlug: { type: "string", description: "kebab-case slug" },
                keywords: {
                  type: "array",
                  description: "8-15 keywords in this cluster",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      category: { type: "string", enum: ["Produkt", "Tjänst", "Geo", "Pris", "Fråga"] },
                      channel: { type: "string", enum: ["SEO", "Ads", "Båda"] },
                      volume: { type: "string", enum: ["<100", "100-500", "500-2000", "2000+"] },
                      cpc: { type: "string", enum: ["Låg", "Medium", "Hög"] },
                      intent: { type: "string", enum: ["Köp", "Info", "Nav"] },
                      usage: { type: "string", enum: ["Landningssida", "Blogg", "Ads-grupp"] },
                    },
                    required: ["keyword", "category", "channel", "volume", "cpc", "intent", "usage"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["cluster", "recommendedH1", "metaDescription", "urlSlug", "keywords"],
              additionalProperties: false,
            },
          },
        },
        required: ["clusters"],
        additionalProperties: false,
      };

      const allClusters: any[] = [];

      // Process segments in parallel batches of 2 to balance speed and rate limits
      const segments = resultJson.segments.slice(0, 6);
      for (let i = 0; i < segments.length; i += 2) {
        const batch = segments.slice(i, i + 2);
        const batchResults = await Promise.all(batch.map(async (seg: any) => {
          const researchPrompt = `Du är en SEO- och Google Ads-strateg specialiserad på svensk B2B. Generera 40–60 sökord för segmentet "${seg.name}" (SNI ${seg.sniCode}) i tre logiska pass:

PASS 1 — KÄRNSÖKORD (8-12 termer)
Tjänstenamn, produktnamn och branschtermer. Utgå från:
- Primary keywords: ${(seg.primaryKeywords || []).map((k: any) => k.keyword).join(", ")}
- Språkmönster: ${(seg.languagePatterns || []).join(", ")}
- Hur de söker: ${(seg.howTheySearch || []).join(", ")}

PASS 2 — MATRISEXPANSION (20-30 termer)
Kombinera kärntermerna med dessa modifiers:
- Pris/offert: pris, kostnad, offert, prisförslag
- Leverans: snabb, express, online, leveranstid
- Geo: Stockholm, Göteborg, Malmö, Sverige
- Intent: köpa, beställa, hitta leverantör, jämför
- Format: liten serie, prototyp, engångsbeställning, volym

PASS 3 — LONG-TAIL & FRÅGOR (10-15 termer)
Använd mönster: "hur [verb] [tjänst]", "var köper man [produkt]", "bästa [tjänst] för [bransch]", "vad kostar [tjänst]".

KONTEXT:
Företag: ${project.company}
Produkter: ${project.products || "ej angivet"}
Marknad: ${project.market}
Use cases för segmentet: ${(seg.useCases || []).join("; ")}

INSTRUKTIONER:
- Gruppera alla 40-60 sökord i 3-6 semantiska kluster (t.ex. "Laserskärning — pris & offert", "Laserskärning — prototyp & småserie")
- Varje kluster blir en Google Ads-annonsgrupp eller SEO-landningssida
- För varje sökord: sätt korrekt category, channel, volume, cpc, intent, usage
- Volume-bedömning baserat på svensk B2B (de flesta är <100 eller 100-500)
- Generera meta description (120-160 tecken) och URL-slug per kluster
- Sökord ska vara på svenska (om marknad = se-sv) och realistiska B2B-termer

Returnera 3-6 kluster där summan av sökord är 40-60.`;

          try {
            const researchRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "Du är en senior SEO/Ads-strateg. Använd verktyget för att returnera strukturerad keyword research." },
                  { role: "user", content: researchPrompt },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "submit_keyword_research",
                    description: "Submit clustered keyword research for a segment",
                    parameters: researchSchema,
                  },
                }],
                tool_choice: { type: "function", function: { name: "submit_keyword_research" } },
              }),
            });

            if (!researchRes.ok) {
              console.error(`Research failed for segment ${seg.name}:`, researchRes.status);
              return [];
            }

            const data = await researchRes.json();
            const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
            if (!toolCall?.function?.arguments) return [];

            const parsed = JSON.parse(toolCall.function.arguments);
            const clusters = (parsed.clusters || []).map((c: any) => ({ ...c, segment: seg.name }));
            console.log(`Segment "${seg.name}": ${clusters.length} clusters, ${clusters.reduce((s: number, c: any) => s + (c.keywords?.length || 0), 0)} keywords`);
            return clusters;
          } catch (err) {
            console.error(`Research error for segment ${seg.name}:`, err);
            return [];
          }
        }));

        batchResults.forEach((clusters) => allClusters.push(...clusters));
      }

      resultJson.keywordResearch = allClusters;
      console.log(`Total: ${allClusters.length} clusters across all segments`);

      // === Enrich with real DataForSEO metrics ===
      try {
        const allKeywords = Array.from(new Set(
          allClusters.flatMap((c: any) => (c.keywords || []).map((k: any) => String(k.keyword || "").toLowerCase().trim())).filter(Boolean)
        ));

        if (allKeywords.length > 0) {
          console.log(`Enriching ${allKeywords.length} unique keywords with DataForSEO...`);
          const enrichRes = await fetch(`${supabaseUrl}/functions/v1/enrich-keywords`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ keywords: allKeywords }),
          });

          if (enrichRes.ok) {
            const { metrics } = await enrichRes.json();
            const metricsMap: Record<string, any> = metrics || {};

            // Merge metrics into each keyword
            allClusters.forEach((cluster: any) => {
              cluster.keywords = (cluster.keywords || []).map((k: any) => {
                const key = String(k.keyword || "").toLowerCase().trim();
                const m = metricsMap[key];
                if (m && m.search_volume != null) {
                  return {
                    ...k,
                    realVolume: m.search_volume,
                    realCpc: m.cpc_sek,
                    competition: m.competition,
                    dataSource: "real",
                  };
                }
                return { ...k, dataSource: "estimated" };
              });
            });

            // Sort clusters by total real volume (desc)
            allClusters.sort((a: any, b: any) => {
              const sumA = (a.keywords || []).reduce((s: number, k: any) => s + (k.realVolume || 0), 0);
              const sumB = (b.keywords || []).reduce((s: number, k: any) => s + (k.realVolume || 0), 0);
              return sumB - sumA;
            });

            // Sort keywords within cluster by volume desc
            allClusters.forEach((c: any) => {
              c.keywords.sort((a: any, b: any) => (b.realVolume || 0) - (a.realVolume || 0));
            });

            const enrichedCount = allClusters.flatMap((c: any) => c.keywords).filter((k: any) => k.dataSource === "real").length;
            console.log(`Enrichment complete: ${enrichedCount}/${allKeywords.length} got real data`);
          } else {
            console.error("Enrichment failed:", enrichRes.status, await enrichRes.text());
          }
        }
      } catch (enrichErr) {
        console.error("Enrichment error (continuing without real data):", enrichErr);
      }
    }

    // === Keyword Universe (skalad sökordsanalys) ===
    let keywordUniverse: any = null;
    if (options?.keywordUniverse) {
      try {
        console.log(`[analyse] running keyword-universe (scale=${options.universeScale || "broad"})`);
        const uniRes = await fetch(`${supabaseUrl}/functions/v1/keyword-universe`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ project_id, scale: options.universeScale || "broad" }),
        });
        if (uniRes.ok) {
          const j = await uniRes.json();
          keywordUniverse = j.universe || null;
          console.log(`[analyse] universe: ${keywordUniverse?.totalKeywords} kw, ${keywordUniverse?.totalEnriched} berikade`);
        } else {
          console.error("[analyse] universe failed", uniRes.status, await uniRes.text());
        }
      } catch (e) {
        console.error("[analyse] universe error", e);
      }
    }

    // Save analysis
    const { error: saveErr } = await supabase.from("analyses").insert({
      project_id,
      options,
      result_json: resultJson,
      keyword_universe_json: keywordUniverse,
      universe_scale: options?.universeScale || null,
    } as any);

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
