import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractJson(raw: string): any {
  if (!raw || typeof raw !== "string") throw new Error("Empty AI content");

  let s = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;

  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);

  if (start === -1) throw new Error("No JSON found");

  const isObj = s[start] === "{";
  const lastClose = isObj ? s.lastIndexOf("}") : s.lastIndexOf("]");
  if (lastClose > start) s = s.slice(start, lastClose + 1);
  else s = s.slice(start);

  try {
    return JSON.parse(s);
  } catch {}

  const cleaned = s
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  try {
    return JSON.parse(cleaned);
  } catch {}

  let inStr = false;
  let esc = false;
  const stack: string[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }

    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = cleaned;
  if (inStr) repaired += '"';
  repaired = repaired.replace(/[,:\s]+$/g, "");
  while (stack.length) repaired += stack.pop();

  return JSON.parse(repaired);
}

function buildFailureResult(message: string) {
  return {
    summary: "",
    totalKeywords: 0,
    segments: [],
    keywords: [],
    expansion: [],
    adsStructure: [],
    quickWins: [],
    __error: message,
  };
}

async function runAnalysisJob({
  projectId,
  options,
  analysisId,
  supabaseUrl,
  supabaseKey,
  lovableApiKey,
}: {
  projectId: string;
  options: Record<string, unknown>;
  analysisId: string;
  supabaseUrl: string;
  supabaseKey: string;
  lovableApiKey: string;
}) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (pErr || !project) throw new Error("Project not found");

    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .eq("project_id", projectId)
      .limit(20);

    let scanContext = "";
    if (options?.webscan) {
      const { data: latestAnalysis } = await supabase
        .from("analyses")
        .select("scan_data_json")
        .eq("project_id", projectId)
        .not("scan_data_json", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestAnalysis?.scan_data_json) {
        scanContext = `\n\nWebbscan-data från kundföretag:\n${JSON.stringify(latestAnalysis.scan_data_json)}`;
      }
    }

    const customerSummary = (customers || [])
      .map(
        (c: any) =>
          `${c.name} | ${c.industry || "?"} | SNI: ${c.sni || "?"} | ${c.domain || "?"} | Oms: ${c.revenue || "?"} | Frekvens: ${c.frequency || "?"} | Produkter: ${c.products || "?"}`,
      )
      .join("\n");

    const enabledModules = Object.entries(options || {})
      .filter(([_, value]) => value)
      .map(([key]) => key)
      .join(", ");

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
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) throw new Error("AI rate limit nått. Försök igen om en stund.");
      if (response.status === 402) throw new Error("AI-krediter slut. Lägg till krediter i Settings → Workspace → Usage.");
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from AI");

    let resultJson;
    try {
      resultJson = extractJson(content);
    } catch {
      console.error("Failed to parse AI response (first 500 chars):", String(content).slice(0, 500));
      console.error("...last 500 chars:", String(content).slice(-500));
      throw new Error("AI returnerade ogiltigt JSON-format");
    }

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
      const segments = resultJson.segments.slice(0, 6);

      for (let i = 0; i < segments.length; i += 2) {
        const batch = segments.slice(i, i + 2);
        const batchResults = await Promise.all(
          batch.map(async (seg: any) => {
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
                  Authorization: `Bearer ${lovableApiKey}`,
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
              const clusters = (parsed.clusters || []).map((cluster: any) => ({ ...cluster, segment: seg.name }));
              console.log(`Segment "${seg.name}": ${clusters.length} clusters, ${clusters.reduce((sum: number, cluster: any) => sum + (cluster.keywords?.length || 0), 0)} keywords`);
              return clusters;
            } catch (error) {
              console.error(`Research error for segment ${seg.name}:`, error);
              return [];
            }
          }),
        );

        batchResults.forEach((clusters) => allClusters.push(...clusters));
      }

      resultJson.keywordResearch = allClusters;
      console.log(`Total: ${allClusters.length} clusters across all segments`);

      try {
        const allKeywords = Array.from(
          new Set(
            allClusters
              .flatMap((cluster: any) => (cluster.keywords || []).map((keyword: any) => String(keyword.keyword || "").toLowerCase().trim()))
              .filter(Boolean),
          ),
        );

        if (allKeywords.length > 0) {
          console.log(`Enriching ${allKeywords.length} unique keywords with DataForSEO...`);
          const enrichRes = await fetch(`${supabaseUrl}/functions/v1/enrich-keywords`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ keywords: allKeywords }),
          });

          if (enrichRes.ok) {
            const { metrics } = await enrichRes.json();
            const metricsMap: Record<string, any> = metrics || {};

            allClusters.forEach((cluster: any) => {
              cluster.keywords = (cluster.keywords || []).map((keyword: any) => {
                const key = String(keyword.keyword || "").toLowerCase().trim();
                const metric = metricsMap[key];
                if (metric && metric.search_volume != null) {
                  return {
                    ...keyword,
                    realVolume: metric.search_volume,
                    realCpc: metric.cpc_sek,
                    competition: metric.competition,
                    dataSource: "real",
                  };
                }
                return { ...keyword, dataSource: "estimated" };
              });
            });

            allClusters.sort((a: any, b: any) => {
              const sumA = (a.keywords || []).reduce((sum: number, keyword: any) => sum + (keyword.realVolume || 0), 0);
              const sumB = (b.keywords || []).reduce((sum: number, keyword: any) => sum + (keyword.realVolume || 0), 0);
              return sumB - sumA;
            });

            allClusters.forEach((cluster: any) => {
              cluster.keywords.sort((a: any, b: any) => (b.realVolume || 0) - (a.realVolume || 0));
            });

            const enrichedCount = allClusters.flatMap((cluster: any) => cluster.keywords).filter((keyword: any) => keyword.dataSource === "real").length;
            console.log(`Enrichment complete: ${enrichedCount}/${allKeywords.length} got real data`);
          } else {
            console.error("Enrichment failed:", enrichRes.status, await enrichRes.text());
          }
        }
      } catch (enrichErr) {
        console.error("Enrichment error (continuing without real data):", enrichErr);
      }
    }

    let keywordUniverse: any = null;
    let universeBackgrounded = false;
    if (options?.keywordUniverse) {
      const scale = options.universeScale || "broad";
      const isHeavy = scale === "max" || scale === "ultra";

      if (isHeavy) {
        // Heavy scales run as background job — keyword-universe writes back to analyses itself.
        console.log(`[analyse] dispatching keyword-universe in background (scale=${scale})`);
        try {
          const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/keyword-universe`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: projectId, scale, analysis_id: analysisId, background: true }),
          });
          if (!dispatchRes.ok) {
            console.error(`[analyse] background dispatch failed`, dispatchRes.status, await dispatchRes.text());
          } else {
            universeBackgrounded = true;
          }
        } catch (e) {
          console.error("[analyse] background dispatch error", e);
        }
      } else {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`[analyse] running keyword-universe (scale=${scale}) attempt ${attempt}/${maxAttempts}`);
            const uniRes = await fetch(`${supabaseUrl}/functions/v1/keyword-universe`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ project_id: projectId, scale }),
            });

            if (uniRes.ok) {
              const payload = await uniRes.json();
              keywordUniverse = payload.universe || null;
              console.log(`[analyse] universe: ${keywordUniverse?.totalKeywords} kw, ${keywordUniverse?.totalEnriched} berikade`);
              break;
            }

            const text = await uniRes.text();
            console.error(`[analyse] universe failed (attempt ${attempt})`, uniRes.status, text);
            if ([429, 500, 502, 503, 504].includes(uniRes.status) && attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
              continue;
            }
            break;
          } catch (error) {
            console.error(`[analyse] universe error (attempt ${attempt})`, error);
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
              continue;
            }
          }
        }
      }
    }

    const { error: updateErr } = await supabase
      .from("analyses")
      .update({
        options,
        result_json: resultJson,
        keyword_universe_json: keywordUniverse,
        universe_scale: (options?.universeScale as string | undefined) || null,
      } as any)
      .eq("id", analysisId);

    if (updateErr) {
      console.error("Save error:", updateErr);
      throw new Error("Kunde inte spara analysresultat");
    }

    console.log("Analysis complete, saved to DB");
  } catch (error) {
    console.error("analyse background error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    const { error: failUpdateErr } = await supabase
      .from("analyses")
      .update({
        result_json: buildFailureResult(message),
        keyword_universe_json: null,
      } as any)
      .eq("id", analysisId);

    if (failUpdateErr) {
      console.error("Failed to persist analysis error:", failUpdateErr);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, options = {}, analysis_id } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let analysisId = analysis_id as string | undefined;
    if (!analysisId) {
      const { data: inserted, error: insertErr } = await supabase
        .from("analyses")
        .insert({
          project_id,
          options,
          result_json: null,
          keyword_universe_json: null,
          universe_scale: options?.universeScale || null,
        } as any)
        .select("id")
        .single();

      if (insertErr || !inserted?.id) {
        console.error("Create analysis error:", insertErr);
        throw new Error("Kunde inte starta analysen");
      }

      analysisId = inserted.id;
    }

    const task = runAnalysisJob({
      projectId: project_id,
      options,
      analysisId,
      supabaseUrl,
      supabaseKey,
      lovableApiKey,
    });

    const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(task);
    } else {
      task.catch((error) => console.error("Background task failed without waitUntil:", error));
    }

    return new Response(JSON.stringify({ success: true, analysis_id: analysisId, status: "processing" }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyse error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
