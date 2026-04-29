// Weekly Strategy Briefing — AI-genererad veckovärdering per kund.
// Kör manuellt via UI eller automatiskt varje måndag 05:30 via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface RevenueSettings {
  avg_order_value: number;
  conversion_rate_pct: number;
  gross_margin_pct: number;
}
const DEFAULT_REV: RevenueSettings = { avg_order_value: 1000, conversion_rate_pct: 2, gross_margin_pct: 100 };

const CTR: Record<number, number> = { 1:0.319,2:0.247,3:0.187,4:0.137,5:0.099,6:0.072,7:0.054,8:0.04,9:0.031,10:0.025 };
const ctrAt = (p: number) => p <= 10 ? CTR[Math.max(1, Math.round(p))] ?? 0.025 : p <= 20 ? 0.012 : p <= 30 ? 0.005 : 0.001;
const valueOfClicks = (clicks: number, s: RevenueSettings) =>
  Math.round(clicks * (s.conversion_rate_pct / 100) * s.avg_order_value * (s.gross_margin_pct / 100));
const annualValueAtPos = (vol: number, pos: number, s: RevenueSettings) =>
  valueOfClicks(vol * ctrAt(pos) * 12, s);

function startOfIsoWeek(d: Date): string {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  let jobId: string | null = null;
  let project_id: string | undefined;
  let week_start: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    project_id = body.project_id as string | undefined;
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    week_start = body.week_start || startOfIsoWeek(new Date());
    const trigger = body.trigger || "manual"; // manual | cron | api

    // Skapa job-record för historik
    const { data: job } = await supabase
      .from("analysis_jobs")
      .insert({
        project_id,
        job_type: "weekly_briefing",
        status: "running",
        started_at: new Date().toISOString(),
        current_step: "collecting_data",
        progress_pct: 10,
        payload: { week_start, trigger },
      })
      .select("id")
      .single();
    jobId = job?.id || null;

    // 1. Hämta projekt + revenue-settings
    const [{ data: project }, { data: revSettings }] = await Promise.all([
      supabase.from("projects").select("id,name,company,domain").eq("id", project_id).maybeSingle(),
      supabase.from("project_revenue_settings").select("*").eq("project_id", project_id).maybeSingle(),
    ]);
    if (!project) {
      if (jobId) await supabase.from("analysis_jobs").update({
        status: "failed", error_message: "project not found", completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      return new Response(JSON.stringify({ error: "project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rev: RevenueSettings = revSettings || DEFAULT_REV;

    // 2. Samla data — senaste 28 dagar
    const since = new Date(); since.setDate(since.getDate() - 28);
    const sinceIso = since.toISOString();

    const [gsc, ga4, alerts, outcomes, audit] = await Promise.all([
      supabase.from("gsc_snapshots").select("rows,totals,start_date,end_date").eq("project_id", project_id).order("created_at", { ascending: false }).limit(2),
      supabase.from("ga4_snapshots").select("rows,totals,start_date,end_date").eq("project_id", project_id).order("created_at", { ascending: false }).limit(2),
      supabase.from("alerts").select("*").eq("project_id", project_id).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(50),
      supabase.from("action_outcomes").select("metric_name,delta_pct,delta,measured_at,action_id,baseline_value,current_value").gte("measured_at", sinceIso).limit(50),
      supabase.from("audit_findings").select("title,severity,category,recommendation,affected_url").eq("project_id", project_id).eq("status", "open").order("created_at", { ascending: false }).limit(20),
    ]);

    // 3. Räkna värde
    const wins: any[] = [];
    const risks: any[] = [];
    const actions: any[] = [];
    let totalValue = 0;

    // Wins: positiva outcomes
    for (const o of (outcomes.data || [])) {
      if (o.delta_pct && o.delta_pct > 5) {
        const deltaClicks = Math.max(0, (o.current_value || 0) - (o.baseline_value || 0));
        const monetaryProxy = (o.current_value && o.baseline_value)
          ? valueOfClicks(deltaClicks * 30, rev)
          : 0;
        wins.push({
          title: `${o.metric_name} förbättrad ${o.delta_pct.toFixed(1)}%`,
          value_sek: monetaryProxy,
          source: "action_outcomes",
          details: {
            method: "Δ klick × 30 dgr × CR × AOV × marginal",
            inputs: {
              metric: o.metric_name,
              baseline_value: o.baseline_value,
              current_value: o.current_value,
              delta_pct: o.delta_pct,
              delta_absolute: deltaClicks,
            },
            steps: [
              { label: "Δ per dag", value: deltaClicks },
              { label: "Δ per månad (×30)", value: deltaClicks * 30 },
              { label: "Estimerade konv. (× CR)", value: Math.round(deltaClicks * 30 * (rev.conversion_rate_pct / 100) * 10) / 10 },
              { label: "Värde (× AOV × marginal)", value: monetaryProxy },
            ],
            settings: rev,
            measured_at: o.measured_at,
            source_table: "action_outcomes",
            source_id: o.action_id,
          },
        });
      }
    }

    // GSC opportunities (pos 4-15 = lågt hängande frukt)
    const gscRows: any[] = (gsc.data?.[0]?.rows as any[]) || [];
    const gscMeta = gsc.data?.[0] ? { start_date: gsc.data[0].start_date, end_date: gsc.data[0].end_date } : null;
    const opps = gscRows
      .filter(r => r.position >= 4 && r.position <= 15 && (r.impressions || 0) > 50)
      .map(r => {
        const vol = r.impressions || 0;
        const valueAtCurrent = annualValueAtPos(vol, r.position, rev);
        const valueAtTarget = annualValueAtPos(vol, 3, rev);
        const upliftValue = valueAtTarget - valueAtCurrent;
        return {
          keyword: r.keys?.[0] || r.query || "?",
          position: r.position,
          impressions: vol,
          clicks: r.clicks || 0,
          ctr: r.ctr || 0,
          valueAtCurrent, valueAtTarget, upliftValue,
        };
      })
      .sort((a, b) => b.upliftValue - a.upliftValue)
      .slice(0, 5);

    for (const o of opps.slice(0, 3)) {
      actions.push({
        title: `Optimera "${o.keyword}" från pos ${o.position.toFixed(1)} mot top 3`,
        value_sek: o.upliftValue,
        source: "gsc_opportunity",
        why: `${Math.round(o.impressions)} visningar/period — låg ansträngning för stor lyft`,
        details: {
          method: "Årligt värde vid pos 3 − årligt värde vid nuv. pos. CTR-kurva: AWR/Sistrix 2024.",
          inputs: {
            keyword: o.keyword,
            current_position: o.position,
            target_position: 3,
            impressions: o.impressions,
            clicks: o.clicks,
            ctr: o.ctr,
            ctr_at_current: ctrAt(o.position),
            ctr_at_target: ctrAt(3),
          },
          steps: [
            { label: "Värde vid nuv. pos (årligt)", value: o.valueAtCurrent },
            { label: "Värde vid pos 3 (årligt)", value: o.valueAtTarget },
            { label: "Uplift", value: o.upliftValue },
          ],
          settings: rev,
          source_snapshot: gscMeta,
          source_table: "gsc_snapshots",
        },
      });
      totalValue += o.upliftValue;
    }

    // Risker: position-tapp (jämför två snapshots)
    const prevRows: any[] = (gsc.data?.[1]?.rows as any[]) || [];
    const prevMeta = gsc.data?.[1] ? { start_date: gsc.data[1].start_date, end_date: gsc.data[1].end_date } : null;
    if (prevRows.length) {
      const prevMap = new Map(prevRows.map(r => [(r.keys?.[0] || r.query), r.position]));
      const drops = gscRows
        .map(r => {
          const k = r.keys?.[0] || r.query;
          const prev = prevMap.get(k);
          if (!prev || !r.position) return null;
          const drop = r.position - prev;
          if (drop < 1) return null;
          const valueBefore = annualValueAtPos(r.impressions || 0, prev, rev);
          const valueNow = annualValueAtPos(r.impressions || 0, r.position, rev);
          const lostValue = valueBefore - valueNow;
          return {
            keyword: k, prev, now: r.position, drop,
            impressions: r.impressions || 0,
            clicks: r.clicks || 0,
            valueBefore, valueNow, lostValue,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b!.lostValue - a!.lostValue)
        .slice(0, 3);
      for (const d of drops) {
        risks.push({
          title: `"${d!.keyword}" tappat från pos ${d!.prev.toFixed(1)} → ${d!.now.toFixed(1)}`,
          value_sek: d!.lostValue,
          source: "position_drop",
          details: {
            method: "Årligt värde vid tidigare pos − årligt värde vid nuvarande pos.",
            inputs: {
              keyword: d!.keyword,
              previous_position: d!.prev,
              current_position: d!.now,
              position_drop: d!.drop,
              impressions: d!.impressions,
              clicks: d!.clicks,
              ctr_before: ctrAt(d!.prev),
              ctr_after: ctrAt(d!.now),
            },
            steps: [
              { label: "Värde innan (årligt)", value: d!.valueBefore },
              { label: "Värde nu (årligt)", value: d!.valueNow },
              { label: "Tappat värde", value: d!.lostValue },
            ],
            settings: rev,
            source_snapshot: { current: gscMeta, previous: prevMeta },
            source_table: "gsc_snapshots",
          },
        });
        totalValue += d!.lostValue;
      }
    }

    // Audit findings → actions
    for (const f of (audit.data || []).slice(0, 2)) {
      const v = f.severity === "high" ? 25000 : f.severity === "medium" ? 10000 : 3000;
      actions.push({
        title: f.title,
        value_sek: v,
        source: "audit",
        why: f.recommendation || f.category,
        details: {
          method: "Schablonvärde per allvarlighetsgrad (high=25k, medium=10k, low=3k SEK).",
          inputs: { severity: f.severity, category: f.category, affected_url: f.affected_url },
          steps: [{ label: "Schablonvärde", value: v }],
          source_table: "audit_findings",
        },
      });
    }

    // Alerts → risks
    for (const a of (alerts.data || []).filter((a: any) => a.severity === "high" || a.severity === "critical").slice(0, 2)) {
      risks.push({
        title: a.title, value_sek: 0, source: "alert", why: a.message,
        details: {
          method: "Alert utan direkt monetärt värde — kvalitativ risk.",
          inputs: { severity: a.severity, category: a.category, type: a.type },
          steps: [],
          source_table: "alerts",
          source_id: a.id,
        },
      });
    }

    // 4. AI-sammanfattning
    let summary_md = "";
    if (LOVABLE_API_KEY) {
      const prompt = `Du är senior digital strateg för ${project.name}${project.company ? ` (${project.company})` : ""}.
Skriv en 1-sidig veckobriefing på svenska för vecka ${week_start}. Ton: rakt, konkret, affärsdrivet, INGA floskler.
Strukturera som markdown:
## Veckans bedömning
(2-3 meningar — vad är läget?)
## Top vinster
(för varje win: en mening + kronvärde)
## Top risker
(för varje risk: en mening + kronvärde + vad som händer om vi inget gör)
## Rekommenderade actions
(för varje action: vad, varför, kronvärde, ungefärlig insats)
## En sak att fokusera på
(en enda prioritet)

Data:
WINS: ${JSON.stringify(wins)}
RISKS: ${JSON.stringify(risks)}
ACTIONS: ${JSON.stringify(actions)}
TOTAL_VALUE_AT_STAKE: ${totalValue} SEK`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: "Du skriver koncisa, affärsdrivna strategibriefingar för B2B-marknadsföring. Aldrig generiska fraser. Alltid med kronvärde." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        summary_md = j.choices?.[0]?.message?.content || "";
      } else {
        summary_md = `_AI-sammanfattning kunde inte genereras (${r.status})._`;
      }
    } else {
      summary_md = "_LOVABLE_API_KEY saknas — kör manuellt sammandrag._";
    }

    // 5. Spara (upsert)
    const { data: saved, error: saveErr } = await supabase
      .from("weekly_briefings")
      .upsert({
        project_id, week_start, summary_md, wins, risks, actions,
        total_value_at_stake_sek: Math.round(totalValue),
        metadata: { generated_at: new Date().toISOString(), revenue_settings: rev },
      }, { onConflict: "project_id,week_start" })
      .select()
      .single();
    if (saveErr) throw saveErr;

    if (jobId) {
      await supabase.from("analysis_jobs").update({
        status: "completed",
        progress_pct: 100,
        current_step: "done",
        completed_at: new Date().toISOString(),
        payload: {
          week_start, briefing_id: saved.id,
          counts: { wins: wins.length, risks: risks.length, actions: actions.length },
          total_value_at_stake_sek: Math.round(totalValue),
        },
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({ ok: true, briefing: saved, job_id: jobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("weekly-briefing error", e);
    if (jobId) {
      await supabase.from("analysis_jobs").update({
        status: "failed",
        error_message: String(e?.message || e),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
    return new Response(JSON.stringify({ error: e?.message || "unknown", job_id: jobId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
