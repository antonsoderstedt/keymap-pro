// Extract brand profile (palette, fonts, tone, logo) from a website URL
// Uses Firecrawl to scrape, then Lovable AI (Gemini) to extract structured data.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url) return j({ error: "url required" }, 400);

    const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!fcKey || !aiKey) return j({ error: "missing api keys" }, 500);

    // 1. Scrape with Firecrawl (markdown + html for color/font extraction)
    const fc = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: false }),
    });
    const fcData = await fc.json();
    if (!fc.ok) return j({ error: "firecrawl failed", raw: fcData }, 502);

    const html: string = fcData?.data?.html?.slice(0, 60000) || "";
    const markdown: string = fcData?.data?.markdown?.slice(0, 8000) || "";
    const meta = fcData?.data?.metadata || {};
    const logo_url = meta.ogImage || meta["og:image"] || meta.favicon || null;

    // Extract hex colors from inline styles / CSS in HTML for hints
    const colorHints = Array.from(html.matchAll(/#[0-9a-fA-F]{6}\b/g)).map((m) => m[0]);
    const topColors = Array.from(new Set(colorHints)).slice(0, 20);
    const fontHints = Array.from(html.matchAll(/font-family\s*:\s*([^;"'}]+)/gi))
      .map((m) => m[1].trim().split(",")[0].replace(/['"]/g, "").trim())
      .filter((x) => x && x.length < 40);
    const topFonts = Array.from(new Set(fontHints)).slice(0, 8);

    // 2. Ask Gemini to summarise into a brand kit JSON
    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du extraherar brand-profil från en hemsida. Returnera ENDAST giltig JSON enligt schemat. Välj färger som faktiskt syns på sajten. Tone på svenska.",
          },
          {
            role: "user",
            content: `URL: ${url}
Färg-hints från CSS: ${topColors.join(", ")}
Font-hints: ${topFonts.join(", ")}
Title: ${meta.title || ""}
Description: ${meta.description || ""}

Innehåll (markdown, kortat):
${markdown}

Returnera JSON:
{
  "palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "success": "#10B981", "warning": "#F59E0B", "neutral_bg": "#hex", "neutral_fg": "#hex" },
  "fonts": { "heading": "Font Name", "body": "Font Name" },
  "tone": "professional|expert|friendly|bold|playful|premium",
  "voice_guidelines": "1-3 meningar på svenska om språk/ton",
  "image_style": "1-2 meningar"
}`,
          },
        ],
      }),
    });
    const aiData = await ai.json();
    if (!ai.ok) return j({ error: "ai failed", raw: aiData }, 502);

    const text: string = aiData?.choices?.[0]?.message?.content || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: any = {};
    try { parsed = JSON.parse(match ? match[0] : text); } catch { parsed = {}; }

    return j({
      ok: true,
      logo_url,
      palette: parsed.palette || null,
      fonts: parsed.fonts || null,
      tone: parsed.tone || "professional",
      voice_guidelines: parsed.voice_guidelines || "",
      image_style: parsed.image_style || "",
      meta: { title: meta.title, description: meta.description },
    });
  } catch (e) {
    console.error("brand-kit-extract", e);
    return j({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
