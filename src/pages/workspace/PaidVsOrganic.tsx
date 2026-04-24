import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Layers } from "lucide-react";

export default function PaidVsOrganic() {
  const { id } = useParams<{ id: string }>();
  const [gsc, setGsc] = useState<any>(null);
  const [ga4, setGa4] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [g, a] = await Promise.all([
        supabase.from("gsc_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ga4_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setGsc(g.data);
      setGa4(a.data);
      setLoading(false);
    })();
  }, [id]);

  // Brand vs non-brand split (heuristic — assumes GSC queries containing project name = brand)
  const queries: any[] = (gsc?.rows || []).filter((r: any) => r.query);
  const brandTerms = new Set<string>();
  // Without project context here, default heuristic: short single-word queries with high CTR
  const brandQueries = queries.filter((q) => q.ctr > 0.15 && q.position < 3);
  const nonBrandQueries = queries.filter((q) => !brandQueries.includes(q));

  const brandClicks = brandQueries.reduce((s, q) => s + (q.clicks || 0), 0);
  const nonBrandClicks = nonBrandQueries.reduce((s, q) => s + (q.clicks || 0), 0);

  // Channel split from GA4
  const channelData: Record<string, number> = {};
  (ga4?.rows || []).forEach((r: any) => {
    const channel = r.channelGroup || r.sessionDefaultChannelGroup || r.medium || "Other";
    channelData[channel] = (channelData[channel] || 0) + (r.sessions || 0);
  });

  const paidVsOrganic = [
    { name: "Organic Search", sessions: channelData["Organic Search"] || channelData["organic"] || 0 },
    { name: "Paid Search", sessions: channelData["Paid Search"] || channelData["cpc"] || 0 },
    { name: "Direct", sessions: channelData["Direct"] || channelData["(none)"] || 0 },
    { name: "Referral", sessions: channelData["Referral"] || channelData["referral"] || 0 },
    { name: "Social", sessions: channelData["Organic Social"] || channelData["Social"] || 0 },
  ].filter((c) => c.sessions > 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Paid vs Organic</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Brand vs non-brand · Kanal-split · SEO-kannibalisering på Ads.
        </p>
      </div>

      {!gsc && !ga4 && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Koppla GSC och GA4 för att se brand-/kanal-fördelning.
          </CardContent>
        </Card>
      )}

      {/* Brand vs non-brand */}
      {queries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              Brand vs non-brand (organiskt)
              <Badge variant="outline" className="text-[10px]">heuristik</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <Stat label="Brand-klick" value={brandClicks} sub={`${brandQueries.length} sökord`} accent />
              <Stat label="Non-brand-klick" value={nonBrandClicks} sub={`${nonBrandQueries.length} sökord`} />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Brand-termer identifieras med heuristik (hög CTR + topp-position). Förbättras när vi
              kopplar Google Ads och vet faktiska brand-keywords.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Channel breakdown */}
      {paidVsOrganic.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Kanal-fördelning (sessioner)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={paidVsOrganic}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Sessioner" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Kommer i Fas 3</p>
          Full SEO-kannibalisering: vilka organiska top-3 sökord du också betalar för i Google Ads
          (sparar budget) — kräver Google Ads-koppling.
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className={accent ? "p-4 rounded-lg bg-primary/5 border border-primary/20" : "p-4 rounded-lg border border-border"}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="font-serif text-3xl mt-1">{value.toLocaleString("sv-SE")}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
