import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cleanDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

async function fetchBacklinkOverview(target: string, key: string) {
  // backlinks_overview gives total backlinks, referring domains, AS
  const url = `https://api.semrush.com/analytics/v1/?key=${key}&type=backlinks_overview&target=${encodeURIComponent(target)}&target_type=root_domain&export_columns=ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const text = await r.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const headers = lines[0].split(";");
  const values = lines[1].split(";");
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => obj[h] = values[i]);
  return {
    authorityScore: Number(obj.ascore || 0),
    totalBacklinks: Number(obj.total || 0),
    referringDomains: Number(obj.domains_num || 0),
    referringIps: Number(obj.ips_num || 0),
    follows: Number(obj.follows_num || 0),
    nofollows: Number(obj.nofollows_num || 0),
  };
}

async function fetchReferringDomains(target: string, key: string, limit = 100) {
  const url = `https://api.semrush.com/analytics/v1/?key=${key}&type=backlinks_refdomains&target=${encodeURIComponent(target)}&target_type=root_domain&export_columns=domain,ascore,backlinks_num,domain_ascore&display_limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const text = await r.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = vals[i]);
    return { domain: obj.domain, authority: Number(obj.ascore || obj.domain_ascore || 0), backlinks: Number(obj.backlinks_num || 0) };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { analysis_id, force } = await req.json();
    if (!analysis_id) throw new Error("analysis_id required");

    const SEMRUSH_API_KEY = Deno.env.get("SEMRUSH_API_KEY");
    if (!SEMRUSH_API_KEY) throw new Error("SEMRUSH_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!force) {
      const { data: existing } = await supabase.from("backlink_gaps").select("payload, updated_at").eq("analysis_id", analysis_id).maybeSingle();
      if (existing) {
        const ageDays = (Date.now() - new Date(existing.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 14) {
          return new Response(JSON.stringify({ data: existing.payload, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const { data: analysis } = await supabase.from("analyses").select("project_id").eq("id", analysis_id).single();
    if (!analysis) throw new Error("Analysis not found");
    const { data: project } = await supabase.from("projects").select("domain, competitors").eq("id", analysis.project_id).single();
    const rawDomain = (project as any)?.domain;
    if (!rawDomain) throw new Error("Projektet har ingen domän satt");
    const domain = cleanDomain(rawDomain);
    const competitorList = String((project as any)?.competitors || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const competitors = competitorList.map(cleanDomain).filter((d) => d.includes("."));

    const [ownOverview, ownDomains, ...competitorData] = await Promise.all([
      fetchBacklinkOverview(domain, SEMRUSH_API_KEY),
      fetchReferringDomains(domain, SEMRUSH_API_KEY, 200),
      ...competitors.map(async (c) => ({
        competitor: c,
        overview: await fetchBacklinkOverview(c, SEMRUSH_API_KEY),
        refDomains: await fetchReferringDomains(c, SEMRUSH_API_KEY, 100),
      })),
    ]);

    // Find gap: domains linking to competitors but NOT to us
    const ownDomainSet = new Set(ownDomains.map((d) => d.domain));
    const gaps: any[] = [];
    competitorData.forEach((cd) => {
      cd.refDomains.forEach((rd) => {
        if (rd.domain && !ownDomainSet.has(rd.domain) && rd.authority >= 20) {
          const existing = gaps.find((g) => g.domain === rd.domain);
          if (existing) {
            if (!existing.linksToCompetitors.includes(cd.competitor)) {
              existing.linksToCompetitors.push(cd.competitor);
              existing.competitorCount += 1;
            }
          } else {
            gaps.push({
              domain: rd.domain,
              authority: rd.authority,
              backlinks: rd.backlinks,
              linksToCompetitors: [cd.competitor],
              competitorCount: 1,
            });
          }
        }
      });
    });
    gaps.sort((a, b) => (b.competitorCount - a.competitorCount) || (b.authority - a.authority));

    const payload = {
      domain,
      ownOverview,
      competitors: competitorData.map((cd) => ({ domain: cd.competitor, overview: cd.overview })),
      gapDomains: gaps.slice(0, 100),
      generatedAt: new Date().toISOString(),
    };

    await supabase.from("backlink_gaps").upsert({ analysis_id, domain, payload }, { onConflict: "analysis_id" });

    return new Response(JSON.stringify({ data: payload, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[semrush-backlinks] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
