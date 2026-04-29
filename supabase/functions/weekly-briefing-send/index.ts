// Skickar veckans briefing som email till mottagare i briefing_email_recipients.
// Triggas manuellt via UI eller automatiskt av cron (passa { auto: true }).
// Beroende: send-transactional-email (scaffoldas av email-infra).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function startOfIsoWeek(d: Date): string {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const auto = !!body.auto;
    const week_start = body.week_start || startOfIsoWeek(new Date());
    const projectIds: string[] | undefined = body.project_ids;
    const singleProject: string | undefined = body.project_id;

    // Bestäm vilka projekt som ska bearbetas
    let projects: { id: string; name: string; company: string | null }[] = [];
    if (singleProject) {
      const { data } = await supabase.from("projects").select("id,name,company").eq("id", singleProject);
      projects = data || [];
    } else if (projectIds?.length) {
      const { data } = await supabase.from("projects").select("id,name,company").in("id", projectIds);
      projects = data || [];
    } else if (auto) {
      // Cron-flöde: alla projekt med minst en aktiv auto_send-mottagare
      const { data: rec } = await supabase
        .from("briefing_email_recipients")
        .select("project_id")
        .eq("enabled", true)
        .eq("auto_send", true);
      const ids = Array.from(new Set((rec || []).map((r: any) => r.project_id)));
      if (ids.length) {
        const { data } = await supabase.from("projects").select("id,name,company").in("id", ids);
        projects = data || [];
      }
    }

    if (!projects.length) {
      return j({ ok: true, sent: 0, message: "Inga projekt att processa." });
    }

    const results: any[] = [];

    for (const proj of projects) {
      // Hämta briefing — generera om saknas
      let { data: briefing } = await supabase
        .from("weekly_briefings")
        .select("*")
        .eq("project_id", proj.id)
        .eq("week_start", week_start)
        .maybeSingle();

      if (!briefing) {
        const gen = await supabase.functions.invoke("weekly-briefing", {
          body: { project_id: proj.id, week_start, trigger: auto ? "cron_email" : "email_send" },
        });
        if (gen.error) {
          results.push({ project_id: proj.id, status: "skipped", reason: `kunde inte generera: ${gen.error.message}` });
          continue;
        }
        briefing = gen.data?.briefing;
      }
      if (!briefing) {
        results.push({ project_id: proj.id, status: "skipped", reason: "ingen briefing att skicka" });
        continue;
      }

      // Mottagare per projekt
      const { data: recipients } = await supabase
        .from("briefing_email_recipients")
        .select("*")
        .eq("project_id", proj.id)
        .eq("enabled", true);

      const filtered = (recipients || []).filter((r: any) => (auto ? r.auto_send : true));
      if (!filtered.length) {
        results.push({ project_id: proj.id, status: "skipped", reason: "inga mottagare" });
        continue;
      }

      let sent = 0;
      let failed = 0;
      for (const rcp of filtered) {
        const idempotencyKey = `briefing-${briefing.id}-${rcp.email.toLowerCase()}`;
        const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "weekly-briefing",
            recipientEmail: rcp.email,
            idempotencyKey,
            templateData: {
              recipientName: rcp.name || "",
              clientName: proj.company || proj.name,
              weekStart: briefing.week_start,
              totalValueSek: briefing.total_value_at_stake_sek || 0,
              wins: (briefing.wins || []).slice(0, 5),
              risks: (briefing.risks || []).slice(0, 5),
              actions: (briefing.actions || []).slice(0, 5),
              summaryMd: briefing.summary_md || "",
            },
          },
        });
        if (sendErr) {
          failed++;
          console.error("send fail", proj.id, rcp.email, sendErr);
        } else {
          sent++;
        }
      }

      // Logga senaste utskick i metadata
      await supabase.from("weekly_briefings").update({
        metadata: {
          ...(briefing.metadata || {}),
          last_email_at: new Date().toISOString(),
          last_email_sent: sent,
          last_email_failed: failed,
          last_email_trigger: auto ? "cron" : "manual",
        },
      }).eq("id", briefing.id);

      results.push({ project_id: proj.id, status: "sent", sent, failed, briefing_id: briefing.id });
    }

    const totalSent = results.reduce((s, r) => s + (r.sent || 0), 0);
    return j({ ok: true, week_start, total_sent: totalSent, results });
  } catch (e: any) {
    console.error("weekly-briefing-send error", e);
    return j({ error: e?.message || "unknown" }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
