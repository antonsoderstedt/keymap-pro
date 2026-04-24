import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cleanDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

// Semrush domain_overview & domain_organic give us authority + top pages.
// We use domain_overview for authority/traffic and domain_organic for top ranking pages
async function fetchOverview(domain: string, key: string) {
  const url = `https://api.semrush.com/?type=domain_ranks&key=${key}&export_columns=Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac,Sh,Sv&domain=${encodeURIComponent(domain)}&database=se`;
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
    rank: Number(obj.Rk || 0),
    organicKeywords: Number(obj.Or || 0),
    organicTraffic: Number(obj.Ot || 0),
    organicCost: Number(obj.Oc || 0),
    paidKeywords: Number(obj.Ad || 0),
    paidTraffic: Number(obj.At || 0),
  };
}

async function fetchTopPages(domain: string, key: string, limit = 25) {
  const url = `https://api.semrush.com/?type=domain_organic_pages&key=${key}&export_columns=Ur,Pc,Tg,Tr&domain=${encodeURIComponent(domain)}&database=se&display_limit=${limit}`;
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
    return { url: obj.Ur, keywordCount: Number(obj.Pc || 0), trafficShare: Number(obj.Tg || 0), traffic: Number(obj.Tr || 0) };
  });
}

// Heuristic on-page issues using Firecrawl/HTTP head check (light audit since full Site Audit API requires project setup)
async function lightAudit(domain: string) {
  const issues: any[] = [];
  const url = `https://${domain}`;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "LovableSEO/1.0" } });
    const html = await r.text();
    const ms = r.headers.get("server-timing") || "";

    if (!html.match(/<title>[^<]{10,70}<\/title>/i)) issues.push({ severity: "high", category: "on-page", title: "Title saknas eller är dålig längd", url });
    if (!html.match(/<meta\s+name=["']description["']\s+content=["'][^"']{50,170}["']/i)) issues.push({ severity: "high", category: "on-page", title: "Meta description saknas eller fel längd", url });
    if (!html.match(/<h1[^>]*>/i)) issues.push({ severity: "high", category: "on-page", title: "H1 saknas", url });
    if ((html.match(/<h1/gi) || []).length > 1) issues.push({ severity: "medium", category: "on-page", title: "Flera H1-taggar", url });
    if (!html.match(/<link\s+rel=["']canonical["']/i)) issues.push({ severity: "medium", category: "technical", title: "Canonical-tag saknas", url });
    if (!html.match(/viewport/i)) issues.push({ severity: "high", category: "mobile", title: "Viewport meta saknas (ej mobil)", url });
    if (html.length > 250000) issues.push({ severity: "medium", category: "performance", title: "HTML-storlek > 250kb", url });
    if (!html.match(/<html[^>]*lang=/i)) issues.push({ severity: "low", category: "on-page", title: "lang-attribut saknas på <html>", url });
    if (!html.match(/<meta[^>]*property=["']og:title["']/i)) issues.push({ severity: "low", category: "social", title: "Open Graph saknas", url });
    if (!html.match(/application\/ld\+json/i)) issues.push({ severity: "medium", category: "schema", title: "Schema.org structured data saknas", url });

    const httpsRedirect = r.url.startsWith("https://");
    if (!httpsRedirect) issues.push({ severity: "high", category: "security", title: "Redirectar inte till HTTPS", url });

    return { issues, fetchedAt: new Date().toISOString(), htmlSize: html.length };
  } catch (e: any) {
    return { issues: [{ severity: "high", category: "fetch", title: `Kunde inte hämta startsidan: ${e?.message}`, url }], fetchedAt: new Date().toISOString() };
  }
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
      const { data: existing } = await supabase.from("site_audits").select("payload, updated_at").eq("analysis_id", analysis_id).maybeSingle();
      if (existing) {
        const ageDays = (Date.now() - new Date(existing.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 7) {
          return new Response(JSON.stringify({ audit: existing.payload, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const { data: analysis } = await supabase.from("analyses").select("project_id").eq("id", analysis_id).single();
    if (!analysis) throw new Error("Analysis not found");
    const { data: project } = await supabase.from("projects").select("domain").eq("id", analysis.project_id).single();
    const rawDomain = (project as any)?.domain;
    if (!rawDomain) throw new Error("Projektet har ingen domän satt");
    const domain = cleanDomain(rawDomain);

    const [overview, topPages, lightAuditRes] = await Promise.all([
      fetchOverview(domain, SEMRUSH_API_KEY),
      fetchTopPages(domain, SEMRUSH_API_KEY, 25),
      lightAudit(domain),
    ]);

    const payload = {
      domain,
      semrush: { overview, topPages },
      onPage: lightAuditRes,
      generatedAt: new Date().toISOString(),
    };

    await supabase.from("site_audits").upsert({ analysis_id, domain, payload }, { onConflict: "analysis_id" });

    return new Response(JSON.stringify({ audit: payload, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[semrush-audit] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
