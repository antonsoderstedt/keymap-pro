import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreKeyword, type ScoringContext } from "../_shared/keyword-intel/scoring.ts";
import { discoverOpportunities } from "../_shared/keyword-intel/opportunities.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOP_CITIES = [
  "Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås",
  "Örebro", "Linköping", "Helsingborg", "Jönköping", "Norrköping",
];

type Scale = "focused" | "broad" | "max" | "ultra";

const SCALE_CONFIG: Record<Scale, { maxKeywords: number; aiCities: number; geoPerProduct: number; problemPairs: number; segmentPairs: number; semrushCap: number }> = {
  focused: { maxKeywords: 500,   aiCities: 5,  geoPerProduct: 4,  problemPairs: 3,  segmentPairs: 3,  semrushCap: 200 },
  broad:   { maxKeywords: 1500,  aiCities: 8,  geoPerProduct: 8,  problemPairs: 5,  segmentPairs: 5,  semrushCap: 600 },
  max:     { maxKeywords: 8000,  aiCities: 25, geoPerProduct: 20, problemPairs: 12, segmentPairs: 12, semrushCap: 3000 },
  ultra:   { maxKeywords: 15000, aiCities: 40, geoPerProduct: 30, problemPairs: 18, segmentPairs: 18, semrushCap: 5000 },
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const normalizeKw = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let analysisIdGlobal: string | null = null;
  let supabaseGlobal: ReturnType<typeof createClient> | null = null;

  try {
    const { project_id, scale: scaleInput, analysis_id, background } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const scale: Scale = (scaleInput || "broad") as Scale;
    const cfg = SCALE_CONFIG[scale] || SCALE_CONFIG.broad;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabaseGlobal = supabase;
    analysisIdGlobal = analysis_id || null;

    const setProgress = async (stage: string, count = 0, extra: Record<string, any> = {}) => {
      if (!analysis_id) return;
      try {
        await supabase.from("analyses").update({
          universe_progress: { stage, count, scale, updated_at: new Date().toISOString(), ...extra },
        } as any).eq("id", analysis_id);
      } catch (e) {
        console.error("[universe] progress update failed", e);
      }
    };

    // If caller wants background mode (analysis_id given + background=true), respond immediately
    // and continue work via EdgeRuntime.waitUntil by self-fetching synchronously.
    if (background && analysis_id) {
      await setProgress("queued", 0);
      const selfTask = fetch(`${supabaseUrl}/functions/v1/keyword-universe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id, scale, analysis_id, background: false }),
      }).then(async (r) => {
        const t = await r.text();
        if (!r.ok) console.error(`[universe] self-fetch failed ${r.status}: ${t}`);
        else console.log(`[universe] self-fetch done`);
      }).catch((e) => console.error("[universe] self-fetch error:", e));

      const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil;
      if (typeof waitUntil === "function") waitUntil(selfTask);

      return new Response(JSON.stringify({ success: true, status: "processing", analysis_id }), {
        status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project, error: pErr } = await supabase.from("projects").select("*").eq("id", project_id).single();
    if (pErr || !project) throw new Error("Project not found");

    const { data: customers } = await supabase.from("customers").select("*").eq("project_id", project_id).limit(50);
    const industries = Array.from(new Set((customers || []).map((c: any) => c.industry).filter(Boolean)));

    // === PASS 1: Ask AI for structured dimension lists ===
    console.log(`[universe] scale=${scale} cap=${cfg.maxKeywords}`);
    await setProgress("dimensions", 0);

    const dimensionSchema = {
      type: "object",
      properties: {
        products:    { type: "array", items: { type: "string" }, description: "Konkreta produktnamn (10-20)" },
        services:    { type: "array", items: { type: "string" }, description: "Tjänstenamn (8-15)" },
        materials:   { type: "array", items: { type: "string" }, description: "Material (5-12)" },
        problems:    { type: "array", items: { type: "string" }, description: "Problem kunden har (8-15) — kort form, t.ex. 'rost', 'läckage'" },
        solutions:   { type: "array", items: { type: "string" }, description: "Lösningar (8-15) — t.ex. 'reparation', 'installation'" },
        useCases:    { type: "array", items: { type: "string" }, description: "Användningsområden (6-12) — t.ex. 'för lager', 'för verkstad'" },
        segments:    { type: "array", items: { type: "string" }, description: "Kundsegment (5-12) — t.ex. 'industri', 'BRF', 'kommun'" },
        industries:  { type: "array", items: { type: "string" }, description: "Branscher (5-12)" },
        cities:      { type: "array", items: { type: "string" }, description: `Relevanta svenska städer/kommuner utöver topp 10 (${cfg.aiCities} st baserat på var kundsegmenten finns)` },
        competitors: { type: "array", items: { type: "string" }, description: "Konkurrentnamn — använd input om finns, annars gissa 3-6" },
        questions:   { type: "array", items: { type: "string" }, description: "Frågefrasstammar (6-10) — t.ex. 'vad kostar', 'hur fungerar', 'vilken är bäst'" },
      },
      required: ["products", "services", "materials", "problems", "solutions", "useCases", "segments", "industries", "cities", "competitors", "questions"],
      additionalProperties: false,
    };

    const dimPrompt = `Du är en svensk B2B-SEO-strateg. Extrahera strukturerade dimensioner för att bygga ett keyword universe.

FÖRETAG: ${project.company}
DOMÄN: ${project.domain || "—"}
PRODUKTER/TJÄNSTER: ${project.products || "—"}
KÄNDA SEGMENT: ${project.known_segments || "—"}
KONKURRENTER (input): ${(project as any).competitors || "—"}
KUNDBRANSCHER: ${industries.join(", ") || "—"}

Returnera korta, sökbara svenska termer (1-3 ord). Inga meningar. Inga modifierare som "pris" — det lägger vi till själva.`;

    const dimRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Returnera strukturerad data via verktyg." },
          { role: "user", content: dimPrompt },
        ],
        tools: [{ type: "function", function: { name: "submit_dimensions", description: "Submit dimension lists", parameters: dimensionSchema } }],
        tool_choice: { type: "function", function: { name: "submit_dimensions" } },
      }),
    });

    if (!dimRes.ok) {
      const t = await dimRes.text();
      console.error("[universe] AI dim error", dimRes.status, t);
      if (dimRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit nått. Försök igen om en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (dimRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Lägg till krediter i Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${dimRes.status}`);
    }

    const dimData = await dimRes.json();
    const dimToolCall = dimData.choices?.[0]?.message?.tool_calls?.[0];
    if (!dimToolCall?.function?.arguments) throw new Error("AI returnerade inga dimensioner");
    const dims = JSON.parse(dimToolCall.function.arguments);

    // === PASS 2: Generate keyword universe via deterministic patterns ===
    const cities = Array.from(new Set([...TOP_CITIES, ...(dims.cities || [])])).slice(0, 10 + cfg.aiCities);

    type RawKw = { keyword: string; cluster: string; dimension: string; intent: string; funnel: string; channel: string; isNegative?: boolean };
    const universe: RawKw[] = [];
    const seen = new Set<string>();
    const add = (kw: RawKw) => {
      const k = normalizeKw(kw.keyword);
      if (!k || k.length < 3 || seen.has(k)) return;
      if (universe.length >= cfg.maxKeywords) return;
      seen.add(k);
      universe.push({ ...kw, keyword: k });
    };

    const products: string[] = (dims.products || []).slice(0, 20);
    const services: string[] = (dims.services || []).slice(0, 15);
    const materials: string[] = (dims.materials || []).slice(0, 12);
    const problems: string[] = (dims.problems || []).slice(0, 15);
    const solutions: string[] = (dims.solutions || []).slice(0, 15);
    const useCases: string[] = (dims.useCases || []).slice(0, 12);
    const segments: string[] = (dims.segments || []).slice(0, 12);
    const branches: string[] = (dims.industries || []).slice(0, 12);
    const competitors: string[] = (dims.competitors || []).slice(0, 8);
    const questions: string[] = (dims.questions || []).slice(0, 10);

    // 1. Bare products & services (commercial, consideration)
    products.forEach((p) => add({ keyword: p, cluster: `Produkt: ${p}`, dimension: "produkt", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    services.forEach((s) => add({ keyword: s, cluster: `Tjänst: ${s}`, dimension: "tjanst", intent: "commercial", funnel: "consideration", channel: "SEO" }));

    // 2. Product + commercial modifiers
    const commMods = ["pris", "offert", "köpa", "beställa", "leverantör", "kostnad", "bäst", "online"];
    products.forEach((p) => {
      commMods.forEach((m) => add({ keyword: `${p} ${m}`, cluster: `Produkt: ${p} — kommersiell`, dimension: "kommersiell", intent: "transactional", funnel: "conversion", channel: "Google Ads" }));
    });
    services.forEach((s) => {
      ["pris", "offert", "kostnad", "leverantör", "specialist"].forEach((m) =>
        add({ keyword: `${s} ${m}`, cluster: `Tjänst: ${s} — kommersiell`, dimension: "kommersiell", intent: "transactional", funnel: "conversion", channel: "Google Ads" }));
    });

    // 3. Product + material
    products.slice(0, 12).forEach((p) => {
      materials.slice(0, 6).forEach((m) =>
        add({ keyword: `${p} ${m}`, cluster: `Produkt: ${p} — material`, dimension: "material", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    });

    // 4. Product + problem
    products.slice(0, 10).forEach((p) => {
      problems.slice(0, cfg.problemPairs).forEach((pr) =>
        add({ keyword: `${p} ${pr}`, cluster: `Problem: ${pr}`, dimension: "problem", intent: "informational", funnel: "awareness", channel: "Content" }));
    });

    // 5. Problem + solution
    problems.forEach((pr) => {
      solutions.slice(0, 4).forEach((sol) =>
        add({ keyword: `${pr} ${sol}`, cluster: `Problem: ${pr} → ${sol}`, dimension: "losning", intent: "commercial", funnel: "consideration", channel: "SEO" }));
      add({ keyword: `${pr} hjälp`, cluster: `Problem: ${pr}`, dimension: "problem", intent: "informational", funnel: "awareness", channel: "Content" });
      add({ keyword: `${pr} reparation`, cluster: `Problem: ${pr}`, dimension: "losning", intent: "transactional", funnel: "conversion", channel: "Google Ads" });
    });

    // 6. Service + industry
    services.forEach((s) => {
      branches.slice(0, cfg.segmentPairs).forEach((b) =>
        add({ keyword: `${s} ${b}`, cluster: `Bransch: ${b}`, dimension: "bransch", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    });
    products.slice(0, 8).forEach((p) => {
      branches.slice(0, cfg.segmentPairs).forEach((b) =>
        add({ keyword: `${p} ${b}`, cluster: `Bransch: ${b}`, dimension: "bransch", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    });

    // 7. Solution + customer segment
    solutions.forEach((sol) => {
      segments.slice(0, 5).forEach((seg) =>
        add({ keyword: `${sol} ${seg}`, cluster: `Segment: ${seg}`, dimension: "kundsegment", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    });

    // 8. Use cases
    useCases.forEach((uc) => {
      products.slice(0, 5).forEach((p) =>
        add({ keyword: `${p} ${uc}`, cluster: `Use case: ${uc}`, dimension: "use_case", intent: "commercial", funnel: "consideration", channel: "SEO" }));
      services.slice(0, 4).forEach((s) =>
        add({ keyword: `${s} ${uc}`, cluster: `Use case: ${uc}`, dimension: "use_case", intent: "commercial", funnel: "consideration", channel: "SEO" }));
    });

    // 9. Geo: service + city, product + city, "nära mig"
    services.slice(0, 8).forEach((s) => {
      cities.slice(0, cfg.geoPerProduct).forEach((c) =>
        add({ keyword: `${s} ${c.toLowerCase()}`, cluster: `Lokal: ${c}`, dimension: "location", intent: "transactional", funnel: "conversion", channel: "Lokal SEO" }));
      add({ keyword: `${s} nära mig`, cluster: `Lokal: nära mig`, dimension: "location", intent: "transactional", funnel: "conversion", channel: "Lokal SEO" });
    });
    products.slice(0, 6).forEach((p) => {
      cities.slice(0, Math.min(cfg.geoPerProduct, 6)).forEach((c) =>
        add({ keyword: `${p} ${c.toLowerCase()}`, cluster: `Lokal: ${c}`, dimension: "location", intent: "commercial", funnel: "consideration", channel: "Lokal SEO" }));
    });
    // Material + product + city (long-tail)
    if (scale !== "focused") {
      materials.slice(0, 4).forEach((m) => {
        products.slice(0, 4).forEach((p) => {
          cities.slice(0, 3).forEach((c) =>
            add({ keyword: `${m} ${p} ${c.toLowerCase()}`, cluster: `Long-tail: ${m} + ${p} + geo`, dimension: "location", intent: "commercial", funnel: "consideration", channel: "Lokal SEO" }));
        });
      });
    }

    // 10. Questions
    questions.forEach((q) => {
      [...products.slice(0, 5), ...services.slice(0, 5)].forEach((t) =>
        add({ keyword: `${q} ${t}`, cluster: `Fråga: ${q}`, dimension: "fraga", intent: "informational", funnel: "awareness", channel: "Content" }));
    });

    // 11. Competitors
    competitors.forEach((co) => {
      add({ keyword: co, cluster: `Konkurrent: ${co}`, dimension: "konkurrent", intent: "navigational", funnel: "consideration", channel: "Google Ads" });
      add({ keyword: `alternativ till ${co}`, cluster: `Konkurrent: ${co}`, dimension: "konkurrent", intent: "commercial", funnel: "consideration", channel: "SEO" });
      add({ keyword: `${co} jämförelse`, cluster: `Konkurrent: ${co}`, dimension: "konkurrent", intent: "commercial", funnel: "consideration", channel: "Content" });
    });

    // 12. Negative keyword candidates (free, jobb, gratis, wikipedia)
    const negModifiers = ["gratis", "jobb", "wikipedia", "kurs", "utbildning", "praktik"];
    products.slice(0, 5).forEach((p) =>
      negModifiers.forEach((n) =>
        add({ keyword: `${p} ${n}`, cluster: `Negativa kandidater`, dimension: "kommersiell", intent: "informational", funnel: "awareness", channel: "Google Ads", isNegative: true })));

    console.log(`[universe] generated ${universe.length} unique keywords`);
    await setProgress("generated", universe.length);

    // === PASS 3: Enrich via DataForSEO (batched, with retry) ===
    await setProgress("enriching_dataforseo", universe.length);
    let metricsMap: Record<string, any> = {};
    try {
      const allKws = universe.map((u) => u.keyword);
      const ENRICH_BATCH = 700;
      const batches: string[][] = [];
      for (let i = 0; i < allKws.length; i += ENRICH_BATCH) batches.push(allKws.slice(i, i + ENRICH_BATCH));

      const callBatch = async (batch: string[], attempt = 1): Promise<Record<string, any>> => {
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/enrich-keywords`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: batch }),
          });
          if (r.ok) {
            const j = await r.json();
            return j.metrics || {};
          }
          if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 3) {
            await new Promise(res => setTimeout(res, 2000 * attempt));
            return callBatch(batch, attempt + 1);
          }
          console.error("[universe] enrich batch failed", r.status, await r.text());
          return {};
        } catch (e) {
          if (attempt < 3) {
            await new Promise(res => setTimeout(res, 2000 * attempt));
            return callBatch(batch, attempt + 1);
          }
          console.error("[universe] enrich batch error", e);
          return {};
        }
      };

      // Run batches with concurrency 3
      let idx = 0;
      const runners = Array.from({ length: Math.min(3, batches.length) }, async () => {
        while (idx < batches.length) {
          const my = idx++;
          const m = await callBatch(batches[my]);
          Object.assign(metricsMap, m);
          await setProgress("enriching_dataforseo", Object.keys(metricsMap).length, { total: allKws.length });
        }
      });
      await Promise.all(runners);
    } catch (e) {
      console.error("[universe] enrich error", e);
    }

    // === PASS 3.5: Semrush enrichment for top N (sorted by DataForSEO volume), batched ===
    await setProgress("enriching_semrush", 0, { total: cfg.semrushCap });
    let semrushMap: Record<string, any> = {};
    try {
      const sortedByVol = [...universe]
        .map((u) => ({ kw: u.keyword, vol: metricsMap[u.keyword]?.search_volume ?? 0 }))
        .sort((a, b) => b.vol - a.vol)
        .slice(0, cfg.semrushCap)
        .map((x) => x.kw);

      if (sortedByVol.length > 0 && Deno.env.get("SEMRUSH_API_KEY")) {
        const SEMRUSH_BATCH = 500;
        const semBatches: string[][] = [];
        for (let i = 0; i < sortedByVol.length; i += SEMRUSH_BATCH) {
          semBatches.push(sortedByVol.slice(i, i + SEMRUSH_BATCH));
        }

        const callSem = async (batch: string[], attempt = 1): Promise<Record<string, any>> => {
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/enrich-semrush`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ keywords: batch, max_keywords: batch.length }),
            });
            if (r.ok) {
              const j = await r.json();
              return j.metrics || {};
            }
            if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 3) {
              await new Promise(res => setTimeout(res, 3000 * attempt));
              return callSem(batch, attempt + 1);
            }
            console.error("[universe] semrush batch failed", r.status, await r.text());
            return {};
          } catch (e) {
            if (attempt < 3) {
              await new Promise(res => setTimeout(res, 3000 * attempt));
              return callSem(batch, attempt + 1);
            }
            console.error("[universe] semrush batch error", e);
            return {};
          }
        };

        // Run with concurrency 2 (Semrush is heavier)
        let sIdx = 0;
        const sRunners = Array.from({ length: Math.min(2, semBatches.length) }, async () => {
          while (sIdx < semBatches.length) {
            const my = sIdx++;
            const m = await callSem(semBatches[my]);
            Object.assign(semrushMap, m);
            await setProgress("enriching_semrush", Object.keys(semrushMap).length, { total: sortedByVol.length });
          }
        });
        await Promise.all(sRunners);
        console.log(`[universe] semrush enriched ${Object.keys(semrushMap).length}/${sortedByVol.length}`);
      }
    } catch (e) {
      console.error("[universe] semrush error", e);
    }

    // === PASS 3.6: SERP-expansion (PAA + related searches) med cache + hård cap ===
    // Fix 4: max 10 live DataForSEO-anrop per körning, 14d cache i keyword_serp_cache
    await setProgress("expanding_serp", 0);
    try {
      const dfLogin = Deno.env.get("DATAFORSEO_LOGIN");
      const dfPassword = Deno.env.get("DATAFORSEO_PASSWORD");
      if (dfLogin && dfPassword) {
        const dfAuth = btoa(`${dfLogin}:${dfPassword}`);
        const seedCandidates = [
          ...products.slice(0, 6),
          ...services.slice(0, 5),
          ...(problems || []).slice(0, 3),
        ].filter(Boolean);

        const MAX_SERP_CALLS = 10;
        const serpExpanded = new Set<string>();
        let liveCallCount = 0;

        const fetchSerpForSeed = async (seed: string) => {
          const { data: cached } = await supabase
            .from("keyword_serp_cache")
            .select("result_json")
            .eq("keyword", seed.toLowerCase())
            .eq("location_code", 2752)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (cached?.result_json) {
            const r = cached.result_json as any;
            return { paa: r.paa || [], related: r.related || [], fromCache: true };
          }
          if (liveCallCount >= MAX_SERP_CALLS) {
            return { paa: [], related: [], fromCache: false };
          }
          liveCallCount++;
          try {
            const res = await fetch(
              "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
              {
                method: "POST",
                headers: { Authorization: `Basic ${dfAuth}`, "Content-Type": "application/json" },
                body: JSON.stringify([{
                  keyword: seed,
                  language_code: "sv",
                  location_code: 2752,
                  calculate_rectangles: false,
                  load_async_ai_overview: false,
                }]),
              },
            );
            if (!res.ok) return { paa: [], related: [], fromCache: false };
            const data = await res.json();
            const items = data.tasks?.[0]?.result?.[0]?.items || [];
            const paa: string[] = [];
            const related: string[] = [];
            for (const item of items) {
              if (item.type === "people_also_ask") {
                for (const i of (item.items || [])) {
                  const q = i.title?.toLowerCase()?.trim();
                  if (q && q.length >= 6 && q.length <= 80) paa.push(q);
                }
              }
              if (item.type === "related_searches") {
                for (const i of (item.items || [])) {
                  const kw = i.title?.toLowerCase()?.trim();
                  if (kw && kw.length >= 4 && kw.length <= 60) related.push(kw);
                }
              }
            }
            const resultJson = { paa, related };
            await supabase.from("keyword_serp_cache").upsert({
              keyword: seed.toLowerCase(),
              location_code: 2752,
              result_json: resultJson,
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            } as any, { onConflict: "keyword,location_code" });
            return { paa, related, fromCache: false };
          } catch (e) {
            console.warn(`[universe] SERP live fail for "${seed}":`, e);
            return { paa: [], related: [], fromCache: false };
          }
        };

        for (const seed of seedCandidates) {
          if (universe.length >= cfg.maxKeywords) break;
          const { paa, related } = await fetchSerpForSeed(seed);
          for (const q of paa) {
            if (!seen.has(q) && universe.length < cfg.maxKeywords) {
              add({
                keyword: q,
                cluster: `Fråga: ${seed}`,
                dimension: "fraga",
                intent: "informational",
                funnel: "awareness",
                channel: "Content",
              });
              serpExpanded.add(q);
            }
          }
          for (const kw of related) {
            if (!seen.has(kw) && universe.length < cfg.maxKeywords) {
              const isTrans = /pris|köpa|beställ|offert|kostnad|leverant/.test(kw);
              add({
                keyword: kw,
                cluster: `Relaterat: ${seed}`,
                dimension: "losning",
                intent: isTrans ? "transactional" : "commercial",
                funnel: isTrans ? "conversion" : "consideration",
                channel: isTrans ? "Google Ads" : "SEO",
              });
              serpExpanded.add(kw);
            }
          }
        }
        console.log(
          `[universe] SERP-expanded: +${serpExpanded.size} sökord, ${liveCallCount} live-anrop (${seedCandidates.length - liveCallCount} från cache)`,
        );
        await setProgress("expanding_serp", serpExpanded.size, {
          live_calls: liveCallCount,
          cache_hits: seedCandidates.length - liveCallCount,
        });

        // Berika de nya sökorden med DataForSEO-volym (en extra batch)
        const newKws = [...serpExpanded].filter((k) => !metricsMap[k]);
        if (newKws.length > 0) {
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/enrich-keywords`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ keywords: newKws }),
            });
            if (r.ok) {
              const j = await r.json();
              Object.assign(metricsMap, j.metrics || {});
            }
          } catch (e) {
            console.warn("[universe] SERP-expanded enrich failed", e);
          }
        }
      }
    } catch (e) {
      console.error("[universe] SERP expand error:", e);
    }

    // Determine project domain (for competitor-gap detection)
    const projectDomain = (project as any).domain
      ? String((project as any).domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
      : null;

    // === Bygg ScoringContext (en gång) ===
    const customerProductHints: string[] = Array.from(new Set(
      (customers || [])
        .flatMap((c: any) => String(c.products || "").toLowerCase().split(/[,;\n]+/))
        .map((s: string) => s.trim())
        .filter((s: string) => s.length >= 3 && s.length <= 40),
    )).slice(0, 40);

    const scoringCtx: ScoringContext = {
      workspaceType: (project as any).workspace_type || "b2b_service",
      productTerms: products.map((p) => p.toLowerCase()),
      serviceTerms: services.map((s) => s.toLowerCase()),
      materialTerms: materials.map((m) => m.toLowerCase()),
      customerProductHints,
      customerIndustries: new Set(
        (industries as string[]).map((i) => String(i).toLowerCase()),
      ),
      diagFlaggedKeywords: new Set<string>(),
      goals: undefined,
    };

    // === PASS 4: Build final output med multi-signal scoring ===
    const final = universe.map((u) => {
      const m = metricsMap[u.keyword];
      const sm = semrushMap[u.keyword];
      const vol = m?.search_volume ?? null;
      const cpc = m?.cpc_sek ?? null;
      const comp = m?.competition ?? null;
      const kd = sm?.kd ?? null;
      const serpFeatures = sm?.serp_features ?? null;
      const topDomains: string[] | null = sm?.top_domains ?? null;

      const competitorGap = projectDomain && topDomains && topDomains.length > 0
        ? !topDomains.some((d: string) => d.toLowerCase().includes(projectDomain))
        : false;

      // Priority heuristic (improved with KD)
      let priority: "high" | "medium" | "low" = "low";
      if (vol != null) {
        if (vol >= 200 && (kd == null || kd < 50)) priority = "high";
        else if (vol >= 50 && (kd == null || kd < 70)) priority = "medium";
        else if (vol >= 50) priority = "low";
      } else if (u.intent === "transactional") {
        priority = "medium";
      }
      // Boost: competitor ranks but you don't = big opportunity
      if (competitorGap && vol != null && vol >= 100) {
        priority = priority === "low" ? "medium" : "high";
      }

      const slug = slugify(u.cluster);
      return {
        keyword: u.keyword,
        cluster: u.cluster,
        dimension: u.dimension,
        intent: u.intent,
        funnelStage: u.funnel,
        priority,
        channel: u.channel,
        recommendedLandingPage: u.isNegative ? undefined : `/${slug}`,
        recommendedAdGroup: u.cluster,
        contentIdea: u.intent === "informational" ? `Guide: ${u.keyword}` : undefined,
        isNegative: u.isNegative || false,
        searchVolume: vol ?? undefined,
        cpc: cpc ?? undefined,
        competition: comp ?? undefined,
        dataSource: vol != null ? "real" : "estimated",
        kd: kd ?? undefined,
        serpFeatures: serpFeatures ?? undefined,
        topRankingDomains: topDomains ?? undefined,
        competitorGap: competitorGap || undefined,
      };
    });

    const enrichedCount = final.filter((k) => k.dataSource === "real").length;
    console.log(`[universe] enriched ${enrichedCount}/${final.length}`);

    const result = {
      scale,
      generatedAt: new Date().toISOString(),
      totalKeywords: final.length,
      totalEnriched: enrichedCount,
      cities,
      keywords: final,
    };

    // If called with analysis_id, write the universe back to the analyses row
    if (analysis_id) {
      const { error: writeErr } = await supabase
        .from("analyses")
        .update({
          keyword_universe_json: result,
          universe_scale: scale,
          universe_progress: { stage: "done", count: final.length, scale, totalEnriched: enrichedCount, finished_at: new Date().toISOString() },
        } as any)
        .eq("id", analysis_id);
      if (writeErr) console.error("[universe] write-back error", writeErr);
      else console.log(`[universe] wrote ${final.length} kw to analysis ${analysis_id}`);
    }

    return new Response(JSON.stringify({ success: true, universe: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[universe] error", e);
    if (analysisIdGlobal && supabaseGlobal) {
      try {
        await supabaseGlobal.from("analyses").update({
          universe_progress: { stage: "error", error: e instanceof Error ? e.message : "Unknown error", finished_at: new Date().toISOString() },
        } as any).eq("id", analysisIdGlobal);
      } catch {}
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
