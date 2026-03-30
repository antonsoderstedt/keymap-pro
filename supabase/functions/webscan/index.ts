import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domains } = await req.json();
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      throw new Error("domains array is required");
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const scanResults = [];

    // Process domains in batches of 3
    for (let i = 0; i < domains.length; i += 3) {
      const batch = domains.slice(i, i + 3);

      const batchResults = await Promise.all(
        batch.map(async (item: { domain: string; company: string }) => {
          try {
            let formattedUrl = item.domain.trim();
            if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
              formattedUrl = `https://${formattedUrl}`;
            }

            console.log("Scraping:", formattedUrl);

            const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: formattedUrl,
                formats: ["markdown"],
                onlyMainContent: true,
              }),
            });

            if (!scrapeRes.ok) {
              console.error(`Firecrawl error for ${item.domain}:`, scrapeRes.status);
              return {
                domain: item.domain,
                company: item.company,
                whatTheyDo: "Kunde inte skanna webbplatsen",
                languageTheyUse: [],
                likelyNeeds: [],
                searchIntentHints: [],
              };
            }

            const scrapeData = await scrapeRes.json();
            const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";

            if (!markdown) {
              return {
                domain: item.domain,
                company: item.company,
                whatTheyDo: "Inget innehåll hittat",
                languageTheyUse: [],
                likelyNeeds: [],
                searchIntentHints: [],
              };
            }

            // Analyze with AI
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  {
                    role: "system",
                    content: `Analysera denna webbplats och returnera ENBART JSON utan backticks:
{"whatTheyDo": "kort beskrivning av vad företaget gör", "languageTheyUse": ["branschtermer de använder"], "likelyNeeds": ["produkter/tjänster de troligen behöver"], "searchIntentHints": ["söktermer de troligen använder"]}`,
                  },
                  {
                    role: "user",
                    content: `Företag: ${item.company}\nDomän: ${item.domain}\n\nWebbplatsinnehåll (första 3000 tecken):\n${markdown.slice(0, 3000)}`,
                  },
                ],
              }),
            });

            if (!aiRes.ok) {
              console.error("AI error for webscan:", aiRes.status);
              return {
                domain: item.domain,
                company: item.company,
                whatTheyDo: "AI-analys misslyckades",
                languageTheyUse: [],
                likelyNeeds: [],
                searchIntentHints: [],
              };
            }

            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

            try {
              const parsed = JSON.parse(cleaned);
              return {
                domain: item.domain,
                company: item.company,
                ...parsed,
              };
            } catch {
              return {
                domain: item.domain,
                company: item.company,
                whatTheyDo: content.slice(0, 200),
                languageTheyUse: [],
                likelyNeeds: [],
                searchIntentHints: [],
              };
            }
          } catch (err) {
            console.error(`Error scanning ${item.domain}:`, err);
            return {
              domain: item.domain,
              company: item.company,
              whatTheyDo: "Fel vid skanning",
              languageTheyUse: [],
              likelyNeeds: [],
              searchIntentHints: [],
            };
          }
        })
      );

      scanResults.push(...batchResults);
    }

    return new Response(JSON.stringify({ success: true, scanData: scanResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("webscan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
