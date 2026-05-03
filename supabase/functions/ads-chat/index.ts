// AI PPC chat — låter användaren ställa frågor om sina Ads-data och få actionable svar.
// Hämtar senaste audit + pacing + RSA-performance som kontext, streamar svar via Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id, messages } = await req.json();
    if (!project_id || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "project_id och messages krävs" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Bygg kontext: senaste audit, pacing-snapshot, RSA-performance, action items
    const [{ data: audit }, { data: pacing }, { data: rsa }, { data: actions }, { data: project }] = await Promise.all([
      sb.from("ads_audits").select("summary, health_score, created_at").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("ads_pacing_snapshots").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r).catch(() => ({ data: null })),
      sb.from("ads_rsa_performance").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(5).then((r) => r).catch(() => ({ data: [] })),
      sb.from("action_items").select("title, category, priority, status, expected_impact_sek").eq("project_id", project_id).neq("status", "done").order("created_at", { ascending: false }).limit(20),
      sb.from("projects").select("name, company, domain, market").eq("id", project_id).maybeSingle(),
    ]);

    const context = {
      project: project ?? null,
      latest_audit: audit ?? null,
      latest_pacing: pacing ?? null,
      recent_rsa_performance: rsa ?? [],
      open_actions: actions ?? [],
    };

    const systemPrompt = `Du är en svensk Google Ads-strateg. Svara KORT, konkret och med siffror när möjligt.
Använd kontextdatan nedan för att besvara frågor om kontot. Om data saknas, säg det rakt ut.
Föreslå alltid konkreta åtgärder (t.ex. "pausa kampanj X", "höj budget på ad group Y med 20%").
Formatera svar i markdown med rubriker, listor och fetstil där det hjälper.

KONTEXT (JSON):
${JSON.stringify(context).slice(0, 12000)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: String(m.content || "") })),
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[ads-chat] AI error", aiRes.status, t);
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "AI rate limit nått." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI-krediter slut." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    return new Response(aiRes.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[ads-chat] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
