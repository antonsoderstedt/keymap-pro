// prelaunch-factcheck — verifierar klientens påståenden ur briefen mot
// SERP, Maps Pack och konkurrentsidor. Sparar resultatet i prelaunch_briefs.fact_check
// så att senare AI-syntes kan basera sig på verklighet, inte påståenden.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const LOCATION_CODE = 2752; // Sweden
const LANGUAGE_CODE = "sv";
const PER_REQUEST_TIMEOUT = 25_000;

type Verdict = "verified" | "contradicted" | "partially_true" | "unverifiable";

interface ClaimSource {
  url: string;
  title?: string;
  snippet: string;
  source_type: "serp" | "maps" | "scrape";
}

interface ClaimResult {
  claim: string;
  type: string;
  verdict: Verdict;
  confidence: "high" | "medium" | "low";
  evidence: string;
  recommendation: string;
  sources: ClaimSource[];
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = PER_REQUEST_TIMEOUT): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) {
      console.error(`fetch ${url} -> ${r.status}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error(`fetch ${url} failed:`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function dfsSerp(query: string, login: string, password: string): Promise<ClaimSource[]> {
  const auth = btoa(`${login}:${password}`);
  const data = await fetchJson(`${DATAFORSEO_BASE}/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{
      keyword: query,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      depth: 10,
      device: "desktop",
    }]),
  });
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .filter((i: any) => i.type === "organic")
    .slice(0, 10)
    .map((i: any) => ({
      url: i.url,
      title: i.title,
      snippet: i.description || i.snippet || "",
      source_type: "serp" as const,
    }));
}

async function dfsMaps(query: string, login: string, password: string): Promise<ClaimSource[]> {
  const auth = btoa(`${login}:${password}`);
  const data = await fetchJson(`${DATAFORSEO_BASE}/serp/google/maps/live/advanced`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{
      keyword: query,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      depth: 20,
    }]),
  });
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .filter((i: any) => i.type === "maps_search")
    .slice(0, 15)
    .map((i: any) => ({
      url: i.url || i.domain || "",
      title: i.title || i.name || "",
      snippet: [i.address, i.category, i.description].filter(Boolean).join(" · "),
      source_type: "maps" as const,
    }));
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string | null> {
  const data = await fetchJson(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["summary"],
      onlyMainContent: true,
    }),
  }, 20_000);
  return data?.data?.summary || data?.summary || null;
}

async function callAI(prompt: string, schema: any, schemaName: string, lovableKey: string): Promise<any> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "function", function: { name: schemaName, parameters: schema } }],
      tool_choice: { type: "function", function: { name: schemaName } },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call output");
  return JSON.parse(args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief_id } = await req.json();
    if (!brief_id) throw new Error("brief_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const dfsLogin = Deno.env.get("DATAFORSEO_LOGIN");
    const dfsPass = Deno.env.get("DATAFORSEO_PASSWORD");
    if (!lovableKey || !dfsLogin || !dfsPass) {
      throw new Error("Missing API credentials (LOVABLE_API_KEY, DATAFORSEO_*)");
    }

    const { data: brief, error: bErr } = await supabase
      .from("prelaunch_briefs")
      .select("*, projects!inner(workspace_type)")
      .eq("id", brief_id)
      .single();
    if (bErr || !brief) throw new Error("Brief not found");

    const workspaceType: string = (brief as any).projects?.workspace_type || "b2b_manufacturer";
    const isLocal = workspaceType === "local_service";

    // 1. Extrahera verifierbara påståenden ur briefen
    const claimSchema = {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claim: { type: "string", description: "Exakt påstående från briefen, max 1 mening" },
              type: {
                type: "string",
                enum: ["uniqueness", "competitor", "feature", "market_position", "geographic"],
                description: "uniqueness=ensam om något, competitor=om konkurrent, feature=produktegenskap, market_position=marknadsposition, geographic=geografisk täckning",
              },
              search_queries: {
                type: "array",
                items: { type: "string" },
                description: "1-3 svenska Google-sökningar som verifierar påståendet (t.ex. 'fillers Norrtälje', 'injektioner hudklinik Norrtälje')",
              },
              maps_query: {
                type: "string",
                description: "Maps-sökning om påståendet är geografiskt/lokalt (t.ex. 'hudklinik Norrtälje'). Annars tom sträng.",
              },
            },
            required: ["claim", "type", "search_queries", "maps_query"],
            additionalProperties: false,
          },
          minItems: 2,
          maxItems: 6,
        },
      },
      required: ["claims"],
      additionalProperties: false,
    };

    const claimPrompt = `Du är faktagranskare. Läs nedanstående brief och extrahera 2–6 KONKRETA, VERIFIERBARA påståenden som kan kollas mot Google.

Fokusera på påståenden som:
- "vi är enda/första/största X i Y"
- "ingen annan erbjuder X"
- "vi är ledande inom X"
- "X kostar Y kr i marknaden"
- konkreta konkurrentpåståenden

IGNORERA mjuka påståenden som "vi är bäst", "högsta kvalitet", "professionella". Endast faktapåståenden som kan motbevisas.

För varje påstående: skriv 1-3 svenska sökfraser som skulle hitta motbevis om påståendet var falskt. Inkludera ortnamn när relevant.

KUNDTYP: ${workspaceType}
GEOGRAFI: ${(brief.locations || []).join(", ") || "Sverige"}

VERKSAMHET:
${brief.business_idea || "—"}

USP / DIFFERENTIERARE:
${brief.usp || "—"}

MÅLGRUPP:
${brief.target_audience || "—"}

KONKURRENTER (från klient):
${(brief.competitors || []).join(", ") || "—"}`;

    console.log("[factcheck] extracting claims");
    const { claims } = await callAI(claimPrompt, claimSchema, "extract_claims", lovableKey);
    console.log(`[factcheck] got ${claims.length} claims`);

    // 2. För varje påstående: kör SERP + Maps + scrape parallellt
    const enriched = await Promise.all(claims.map(async (c: any) => {
      const serpQueries: string[] = (c.search_queries || []).slice(0, 2);
      const mapsQuery: string = c.maps_query || "";

      const [serpResults, mapsResults] = await Promise.all([
        Promise.all(serpQueries.map(q => dfsSerp(q, dfsLogin, dfsPass))).then(arr => arr.flat()),
        (isLocal || c.type === "geographic" || c.type === "uniqueness") && mapsQuery
          ? dfsMaps(mapsQuery, dfsLogin, dfsPass)
          : Promise.resolve([] as ClaimSource[]),
      ]);

      // Scrape topp 2 SERP-träffar för djupare verifiering
      const scrapeUrls = serpResults.slice(0, 2).map(s => s.url).filter(Boolean);
      const scrapedSummaries = firecrawlKey
        ? await Promise.all(scrapeUrls.map(async (u) => {
            const summary = await firecrawlScrape(u, firecrawlKey);
            return summary ? { url: u, title: "", snippet: summary.slice(0, 400), source_type: "scrape" as const } : null;
          })).then(arr => arr.filter(Boolean) as ClaimSource[])
        : [];

      const allSources = [
        ...serpResults.slice(0, 8),
        ...mapsResults.slice(0, 10),
        ...scrapedSummaries,
      ];

      return { ...c, _sources: allSources };
    }));

    // 3. AI-syntes per påstående
    const verdictSchema = {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claim: { type: "string" },
              type: { type: "string" },
              verdict: { type: "string", enum: ["verified", "contradicted", "partially_true", "unverifiable"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              evidence: { type: "string", description: "1-3 meningar svenska som förklarar bevisen" },
              recommendation: { type: "string", description: "Vad klienten bör göra åt detta — använd uppmuntrande ton" },
              source_indices: { type: "array", items: { type: "integer" }, description: "Index (0-baserade) på de viktigaste källorna" },
            },
            required: ["claim", "type", "verdict", "confidence", "evidence", "recommendation", "source_indices"],
            additionalProperties: false,
          },
        },
        overall_summary: { type: "string", description: "1-2 meningar svensk sammanfattning av faktakollens helhet" },
      },
      required: ["results", "overall_summary"],
      additionalProperties: false,
    };

    const verdictPrompt = `Du är svensk faktagranskare. Bedöm varje påstående mot källorna.

Verdict-skala:
- verified: källor bekräftar tydligt
- contradicted: källor visar motsatsen
- partially_true: delvis sant men saknar nyans
- unverifiable: inga relevanta källor hittades

Var STRIKT med "uniqueness"-påståenden. Om kunden säger "vi är ENDA X i Y" och Maps visar 2+ liknande verksamheter → contradicted.

För Maps-källor: räkna antal träffar för samma kategori i samma stad. Om ≥2 = motbevis för ensam-påstående.

Skriv evidens och rekommendation på svenska. Var konstruktiv — om något motbevisas, hjälp kunden att ompositionera sig istället för att kritisera.

PÅSTÅENDEN OCH KÄLLOR:
${enriched.map((c: any, idx: number) => `
=== PÅSTÅENDE ${idx + 1} ===
Påstående: "${c.claim}"
Typ: ${c.type}
Sökfraser: ${(c.search_queries || []).join(", ")}
${c.maps_query ? `Maps-sökning: ${c.maps_query}` : ""}

KÄLLOR (${c._sources.length} st):
${c._sources.slice(0, 12).map((s: ClaimSource, i: number) =>
  `[${i}] (${s.source_type}) ${s.title || s.url}\n    ${s.snippet.slice(0, 250)}`
).join("\n")}
`).join("\n")}`;

    console.log("[factcheck] synthesizing verdicts");
    const synth = await callAI(verdictPrompt, verdictSchema, "synthesize_verdicts", lovableKey);

    // 4. Slå ihop verdict + sources tillbaka
    const factCheck = {
      generated_at: new Date().toISOString(),
      overall_summary: synth.overall_summary,
      claims: synth.results.map((r: any, idx: number) => {
        const orig = enriched[idx] || {};
        const allSources: ClaimSource[] = orig._sources || [];
        const pickedSources = (r.source_indices || [])
          .map((i: number) => allSources[i])
          .filter(Boolean)
          .slice(0, 5);
        return {
          claim: r.claim,
          type: r.type,
          verdict: r.verdict as Verdict,
          confidence: r.confidence,
          evidence: r.evidence,
          recommendation: r.recommendation,
          sources: pickedSources.length ? pickedSources : allSources.slice(0, 3),
        } as ClaimResult;
      }),
    };

    await supabase
      .from("prelaunch_briefs")
      .update({ fact_check: factCheck })
      .eq("id", brief_id);

    console.log(`[factcheck] complete, ${factCheck.claims.length} verdicts`);

    return new Response(
      JSON.stringify({ success: true, fact_check: factCheck }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("prelaunch-factcheck error:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
