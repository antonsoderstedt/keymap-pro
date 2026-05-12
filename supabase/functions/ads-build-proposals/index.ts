// ads-build-proposals — bygger draft-proposals från senaste diagnos + ad_drafts.
// Skapar rader i ads_change_proposals med påkopplad action_type, payload, rationale, evidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Diagnosis {
  id: string;
  rule_id: string;
  scope?: string;
  scope_ref?: { id: string; name: string }[];
  severity?: string;
  confidence?: number;
  title?: string;
  why?: string;
  evidence?: any[];
  expected_impact?: any;
  estimated_value_sek?: number;
  proposed_actions?: any[];
}

// Map diagnosis rule_id + proposed_action.action_type → ads-mutate action_type + payload builder
function buildPayloadFromDiagnosis(d: Diagnosis): { action_type: string; payload: any; scope_label: string } | null {
  const action = d.proposed_actions?.[0];
  if (!action) return null;
  const ref = d.scope_ref || [];
  const scope_label = ref.map((r) => r.name).join(" › ");

  // 1. Wasted keyword → pause_keyword
  if (d.rule_id === "wasted_keyword_no_conversions" && ref.length >= 3) {
    return {
      action_type: "pause_keyword",
      payload: { ad_group_id: ref[1].id, criterion_id: ref[2].id },
      scope_label,
    };
  }
  // 2. Negative keyword candidate
  if (d.rule_id === "negative_keyword_candidate" && action.payload?.term) {
    return {
      action_type: "add_negative_keyword",
      payload: {
        keyword: action.payload.term,
        match_type: action.payload.match_type || "PHRASE",
        campaign_id: ref[0]?.id,
        scope: "campaign",
      },
      scope_label,
    };
  }
  // 3. Pause underperforming ad
  if (d.rule_id === "ad_strength_poor" && ref.length >= 3) {
    return {
      action_type: "pause_ad",
      payload: { ad_group_id: ref[1].id, ad_id: ref[2].id },
      scope_label,
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Auth: who is calling?
    const auth = req.headers.get("Authorization");
    let createdBy: string | null = null;
    if (auth) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data } = await userClient.auth.getUser();
      createdBy = data?.user?.id ?? null;
    }

    // Fetch latest diagnosis run
    const { data: diagRun } = await admin
      .from("ads_diagnostics_runs")
      .select("report, created_at, customer_id")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let diagProposals = 0;
    if (diagRun?.report?.diagnoses) {
      const diagnoses: Diagnosis[] = diagRun.report.diagnoses;
      for (const d of diagnoses) {
        const built = buildPayloadFromDiagnosis(d);
        if (!built) continue;

        // Skip if already exists with same rule + scope (avoid duplicates)
        const { data: existing } = await admin
          .from("ads_change_proposals")
          .select("id")
          .eq("project_id", project_id)
          .eq("rule_id", d.rule_id)
          .eq("scope_label", built.scope_label)
          .in("status", ["draft", "approved"])
          .maybeSingle();
        if (existing) continue;

        await admin.from("ads_change_proposals").insert({
          project_id,
          source: "diagnosis",
          action_type: built.action_type,
          scope_label: built.scope_label,
          payload: built.payload,
          diff: { proposed_action: d.proposed_actions?.[0] },
          estimated_impact_sek: d.estimated_value_sek ?? null,
          rationale: d.why || d.title || null,
          evidence: d.evidence || [],
          rule_id: d.rule_id,
          created_by: createdBy,
        });
        diagProposals++;
      }
    }

    // Fetch latest analysis + ad_drafts
    const { data: latestAnalysis } = await admin
      .from("analyses")
      .select("id, created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let rsaProposals = 0;
    if (latestAnalysis?.id) {
      const { data: drafts } = await admin
        .from("ad_drafts")
        .select("ad_group, payload")
        .eq("analysis_id", latestAnalysis.id);
      for (const d of drafts || []) {
        const scope_label = `Ny RSA › ${d.ad_group}`;
        const { data: existing } = await admin
          .from("ads_change_proposals")
          .select("id")
          .eq("project_id", project_id)
          .eq("scope_label", scope_label)
          .in("status", ["draft", "approved"])
          .maybeSingle();
        if (existing) continue;

        const p: any = d.payload || {};
        await admin.from("ads_change_proposals").insert({
          project_id,
          analysis_id: latestAnalysis.id,
          source: "ai_generation",
          action_type: "create_rsa_pending_adgroup", // requires user to choose target ad_group
          scope_label,
          payload: {
            ad_group_name: d.ad_group,
            headlines: p.headlines || [],
            descriptions: p.descriptions || [],
            path1: p.path1 || "",
            path2: p.path2 || "",
            final_url: p.final_url || "",
          },
          diff: { rsa: p },
          rationale: `AI-genererat RSA-utkast för annonsgruppen "${d.ad_group}". Välj mål-annonsgrupp i kontot för att pusha pausat.`,
          evidence: [],
          created_by: createdBy,
        });
        rsaProposals++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      created: { from_diagnosis: diagProposals, from_rsa_drafts: rsaProposals, total: diagProposals + rsaProposals },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ads-build-proposals error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
