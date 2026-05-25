// ASK-mode: read-only operational intelligence.
// Single grounded answer per request. No streaming, no memory, no tools, no mutations.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROUTES = ["", "actions", "performance", "keywords", "settings", "ads-history", "prelaunch"];

type SnapshotSection = { name: string; data: unknown };

function safeJson(input: string | null | undefined): unknown {
  if (!input) return null;
  try { return JSON.parse(input); } catch { return null; }
}

async function buildSnapshot(sb: ReturnType<typeof createClient>, projectId: string) {
  const sections: SnapshotSection[] = [];

  const [project, sources, goals, actions, mutations, ga4, gsc, adsDiag, seoDiag] = await Promise.all([
    sb.from("projects").select("id,name,company,domain,created_at,last_active_at").eq("id", projectId).maybeSingle(),
    sb.from("data_source_status").select("source,status,last_synced_at,last_error").eq("project_id", projectId),
    sb.from("project_goals").select("*").eq("project_id", projectId).maybeSingle(),
    sb.from("action_items")
      .select("id,title,category,priority,status,expected_impact,expected_impact_sek,implemented_at,created_at,updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(25),
    sb.from("ads_mutations")
      .select("id,action_type,status,created_at,error_message")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(15),
    sb.from("ga4_snapshots")
      .select("start_date,end_date,totals,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(3),
    sb.from("gsc_snapshots")
      .select("start_date,end_date,totals,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(3),
    sb.from("ads_diagnostics_cache")
      .select("report,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("seo_diagnostics_cache")
      .select("report,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  sections.push({ name: "project", data: project.data ?? null });
  sections.push({ name: "data_sources", data: sources.data ?? [] });
  sections.push({ name: "goals", data: goals.data ?? null });
  sections.push({
    name: "recent_actions",
    data: (actions.data ?? []).map((a: any) => ({
      title: a.title, category: a.category, priority: a.priority, status: a.status,
      impact_sek: a.expected_impact_sek, implemented_at: a.implemented_at, updated_at: a.updated_at,
    })),
  });
  sections.push({
    name: "recent_ads_mutations",
    data: (mutations.data ?? []).map((m: any) => ({
      type: m.action_type, status: m.status, at: m.created_at, error: m.error_message ?? null,
    })),
  });
  sections.push({
    name: "ga4_recent",
    data: (ga4.data ?? []).map((s: any) => ({ period: `${s.start_date}..${s.end_date}`, totals: s.totals, fetched_at: s.created_at })),
  });
  sections.push({
    name: "gsc_recent",
    data: (gsc.data ?? []).map((s: any) => ({ period: `${s.start_date}..${s.end_date}`, totals: s.totals, fetched_at: s.created_at })),
  });
  // Trim diagnostics to top items only
  const adsReport: any = adsDiag?.data?.report ?? null;
  if (adsReport) {
    sections.push({
      name: "ads_diagnoses_top",
      data: {
        generated_at: adsReport.generated_at,
        blockers: adsReport.blockers ?? [],
        account_health: adsReport.account_health ?? null,
        top_diagnoses: (adsReport.diagnoses ?? []).slice(0, 8).map((d: any) => ({
          title: d.title, severity: d.severity, confidence: d.confidence,
          why: d.why, value_sek: d.estimated_value_sek,
        })),
      },
    });
  }
  const seoReport: any = seoDiag?.data?.report ?? null;
  if (seoReport) {
    sections.push({
      name: "seo_diagnoses_top",
      data: {
        generated_at: seoReport.generated_at,
        top_diagnoses: (seoReport.diagnoses ?? []).slice(0, 8).map((d: any) => ({
          title: d.title, severity: d.severity, confidence: d.confidence, why: d.why,
        })),
      },
    });
  }

  return sections;
}

const SYSTEM_PROMPT = `Du är en operativ analytiker inbäddad i ett SEO/Ads-arbetsverktyg.
Du SVARAR endast på operativa frågor om den aktuella kundens data nedan.

Regler — följ dem absolut:
- Du är INTE en chatbot. Ingen hälsning, ingen personlighet, inga emojis, ingen filler.
- Skriv på svenska. Max 3 korta stycken. Inga rubriker.
- Varje faktisk påstående MÅSTE backas av evidence (metric+värde+period). Hittar du inte stöd: säg det rakt ut och sätt confidence=low.
- Gissa aldrig. Är frågan tvetydig (saknad period, kanal, kampanjtyp): fyll i need_clarification med EN konkret motfråga och lämna answer tomt.
- Är frågan utanför scope (kod, strategigenerering, copy, prognoser, "gör X åt mig"): sätt out_of_scope=true.
- Citations får endast peka på dessa sub-routes: ${ALLOWED_ROUTES.map(r => `"${r}"`).join(", ")}.
- Föreslå aldrig att utföra ändringar. Du läser och förklarar — du agerar inte.
- Konfidens: "high" endast när färska data direkt stödjer slutsatsen. "low" när data saknas, är gammal, eller slutsatsen kräver antaganden.`;

function buildTool() {
  return {
    type: "function",
    function: {
      name: "operator_answer",
      description: "Strukturerat operativt svar.",
      parameters: {
        type: "object",
        properties: {
          out_of_scope: { type: "boolean" },
          need_clarification: { type: "string", description: "Tom om inget behövs. Annars EN konkret motfråga på svenska." },
          answer: { type: "string", description: "Max 3 korta stycken på svenska. Tom om out_of_scope eller need_clarification." },
          evidence: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                claim: { type: "string" },
                metric: { type: "string" },
                value: { type: "string" },
                period: { type: "string" },
                delta: { type: "string" },
              },
              required: ["claim", "metric", "value", "period"],
              additionalProperties: false,
            },
          },
          citations: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                route: { type: "string", enum: ALLOWED_ROUTES },
              },
              required: ["label", "route"],
              additionalProperties: false,
            },
          },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["out_of_scope", "need_clarification", "answer", "evidence", "citations", "confidence"],
        additionalProperties: false,
      },
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { projectId, question, context } = body ?? {};
    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "projectId krävs" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Frågan är för kort." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (question.length > 500) {
      return new Response(JSON.stringify({ error: "Frågan är för lång (max 500 tecken)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Auth: use the caller's token so RLS scopes everything to their accessible projects.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Ej autentiserad." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sections = await buildSnapshot(userClient, projectId);
    if (!sections[0]?.data) {
      return new Response(JSON.stringify({ error: "Kund hittades inte eller saknar åtkomst." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI-tjänsten är inte konfigurerad." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const snapshotJson = JSON.stringify(sections);
    // Hard cap snapshot size to keep latency bounded.
    const snapshotTrimmed = snapshotJson.length > 60000 ? snapshotJson.slice(0, 60000) + "...[trunkerad]" : snapshotJson;

    const userMsg = `KUNDDATA (JSON):\n${snapshotTrimmed}\n\nAKTIV VY: ${context?.route ?? "okänd"}\n\nFRÅGA:\n${question.trim()}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        tools: [buildTool()],
        tool_choice: { type: "function", function: { name: "operator_answer" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "För många frågor just nu. Försök igen om en stund." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI-krediter är slut för arbetsytan." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("ask-operator AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI-tjänsten svarade med fel." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await aiRes.json();
    const call = payload?.choices?.[0]?.message?.tool_calls?.[0];
    const args = safeJson(call?.function?.arguments ?? null) as any;
    if (!args) {
      return new Response(JSON.stringify({ error: "Kunde inte tolka AI-svaret." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sanitize: enforce caps & route allow-list defensively.
    const out = {
      out_of_scope: !!args.out_of_scope,
      need_clarification: typeof args.need_clarification === "string" ? args.need_clarification : "",
      answer: typeof args.answer === "string" ? args.answer : "",
      evidence: Array.isArray(args.evidence) ? args.evidence.slice(0, 5) : [],
      citations: Array.isArray(args.citations)
        ? args.citations
            .filter((c: any) => c && typeof c.route === "string" && ALLOWED_ROUTES.includes(c.route))
            .slice(0, 4)
        : [],
      confidence: ["low", "medium", "high"].includes(args.confidence) ? args.confidence : "low",
      latency_ms: Date.now() - t0,
    };

    // Safeguard: if model produced an "answer" without any evidence on a substantive query, downgrade confidence.
    if (!out.out_of_scope && !out.need_clarification && out.answer && out.evidence.length === 0) {
      out.confidence = "low";
    }

    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ask-operator error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Internt fel." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
