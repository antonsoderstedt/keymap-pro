import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Finding {
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description?: string;
  recommendation?: string;
  affected_url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).maybeSingle();
    if (!project?.domain) throw new Error("Project has no domain");

    const domain = project.domain.trim();
    const url = domain.startsWith("http") ? domain : `https://${domain}`;

    // 1. Create audit run (running)
    const { data: run } = await supabase.from("audit_runs").insert({
      project_id, domain, status: "running", started_at: new Date().toISOString(),
    }).select().single();

    const findings: Finding[] = [];

    // 2. Fetch homepage HTML for on-page checks
    let html = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 KEYMAP-Audit" } });
      html = await r.text();
    } catch (e) {
      findings.push({ category: "technical", severity: "critical", title: "Sajten kunde inte hämtas", description: String(e), recommendation: "Kontrollera DNS, SSL och servertillgänglighet.", affected_url: url });
    }

    // On-page checks
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!titleMatch || !titleMatch[1].trim()) {
      findings.push({ category: "on-page", severity: "high", title: "Title saknas på startsidan", recommendation: "Lägg till en unik <title> på 50-60 tecken med primärt sökord.", affected_url: url });
    } else if (titleMatch[1].length < 30 || titleMatch[1].length > 65) {
      findings.push({ category: "on-page", severity: "medium", title: `Title-längd suboptimal (${titleMatch[1].length} tecken)`, description: `Aktuell: "${titleMatch[1]}"`, recommendation: "Sikta på 50-60 tecken inkl. sökord och brand.", affected_url: url });
    }

    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (!metaDescMatch || !metaDescMatch[1].trim()) {
      findings.push({ category: "on-page", severity: "high", title: "Meta description saknas", recommendation: "Skriv en unik meta description på 140-155 tecken med CTA.", affected_url: url });
    }

    const h1Matches = html.match(/<h1[^>]*>/gi) || [];
    if (h1Matches.length === 0) {
      findings.push({ category: "on-page", severity: "high", title: "Ingen H1 på startsidan", recommendation: "Lägg till exakt en H1 med huvudsökord.", affected_url: url });
    } else if (h1Matches.length > 1) {
      findings.push({ category: "on-page", severity: "medium", title: `Flera H1 på startsidan (${h1Matches.length})`, recommendation: "Använd endast en H1 per sida.", affected_url: url });
    }

    // Schema check
    if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(html)) {
      findings.push({ category: "technical", severity: "medium", title: "Strukturerad data (JSON-LD) saknas", recommendation: "Lägg till Organization + WebSite schema för bättre SERP-features.", affected_url: url });
    }

    // OG tags
    if (!/<meta\s+property=["']og:title["']/i.test(html)) {
      findings.push({ category: "on-page", severity: "low", title: "Open Graph-taggar saknas", recommendation: "Lägg till og:title, og:description, og:image för bättre social-delning." });
    }

    // Robots & sitemap
    try {
      const rRobots = await fetch(`${url}/robots.txt`);
      if (!rRobots.ok) {
        findings.push({ category: "technical", severity: "medium", title: "robots.txt hittades inte", recommendation: "Skapa /robots.txt med Sitemap-direktiv." });
      }
    } catch {}
    try {
      const rSitemap = await fetch(`${url}/sitemap.xml`);
      if (!rSitemap.ok) {
        findings.push({ category: "technical", severity: "high", title: "sitemap.xml hittades inte", recommendation: "Generera och deklarera /sitemap.xml för bättre indexering." });
      }
    } catch {}

    // HTTPS
    if (!url.startsWith("https://")) {
      findings.push({ category: "technical", severity: "critical", title: "Sajten använder inte HTTPS", recommendation: "Aktivera SSL och redirecta http -> https." });
    }

    // 3. PageSpeed Insights (if available)
    const PSI_KEY = Deno.env.get("PAGESPEED_API_KEY");
    let healthScore = 70;
    try {
      const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile${PSI_KEY ? `&key=${PSI_KEY}` : ""}`;
      const psiRes = await fetch(psiUrl);
      if (psiRes.ok) {
        const psi = await psiRes.json();
        const perf = psi?.lighthouseResult?.categories?.performance?.score;
        const seo = psi?.lighthouseResult?.categories?.seo?.score;
        if (typeof perf === "number") {
          healthScore = Math.round(((perf + (seo ?? 0.7)) / 2) * 100);
          if (perf < 0.5) findings.push({ category: "technical", severity: "high", title: `Mobil prestanda låg (${Math.round(perf*100)}/100)`, recommendation: "Optimera bilder, minska JS, använd lazy loading. Se Lighthouse-rapport.", affected_url: url });
          else if (perf < 0.8) findings.push({ category: "technical", severity: "medium", title: `Mobil prestanda kan förbättras (${Math.round(perf*100)}/100)`, recommendation: "Förbättra LCP och CLS." });
        }
      }
    } catch (e) {
      console.log("PSI failed:", e);
    }

    // Adjust health score based on findings
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    healthScore = Math.max(0, Math.min(100, healthScore - criticalCount * 15 - highCount * 5));

    // 4. Insert findings
    if (findings.length > 0) {
      await supabase.from("audit_findings").insert(
        findings.map(f => ({ ...f, run_id: run.id, project_id }))
      );
    }

    // 5. Update run as complete
    await supabase.from("audit_runs").update({
      status: "complete",
      health_score: healthScore,
      completed_at: new Date().toISOString(),
      totals: {
        total: findings.length,
        critical: criticalCount,
        high: highCount,
        medium: findings.filter(f => f.severity === "medium").length,
        low: findings.filter(f => f.severity === "low").length,
      },
    }).eq("id", run.id);

    return new Response(JSON.stringify({ run_id: run.id, health_score: healthScore, findings_count: findings.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
