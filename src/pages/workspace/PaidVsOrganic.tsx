// TODO: DEAD FILE — absorberat i ExecutiveDashboard kanal-split
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Layers, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface CannibalRow {
  keyword: string;
  organic_position: number;
  organic_clicks: number;
  ads_clicks: number;
  ads_cost_sek: number;
  ads_conversions: number;
  campaigns: string[];
}

export default function PaidVsOrganic() {
  const { id } = useParams<{ id: string }>();
  const [gsc, setGsc] = useState<any>(null);
  const [ga4, setGa4] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Cannibalization
  const [cannibal, setCannibal] = useState<{
    overlap: CannibalRow[];
    total_potential_savings_sek: number;
    organic_top3_count: number;
    ads_search_terms_count?: number;
    ads_customer_id: string | null;
    message?: string;
  } | null>(null);
  const [loadingCannibal, setLoadingCannibal] = useState(false);

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

  const fetchCannibal = async () => {
    if (!id) return;
    setLoadingCannibal(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Inte inloggad");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ads-cannibalization`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Kunde inte hämta kannibalisering");
      setCannibal(data);
      if (data.overlap?.length === 0) {
        toast.info("Ingen överlapp hittades — du betalar inte för organiska top-3-sökord. 👍");
      } else {
        toast.success(`${data.overlap.length} kannibaliserade sökord — potentiell besparing: ${data.total_potential_savings_sek} kr/mån`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingCannibal(false);
    }
  };

  // Brand vs non-brand split (heuristic — assumes GSC queries containing project name = brand)
  const queries: any[] = (gsc?.rows || []).filter((r: any) => r.query);
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
              Brand-termer identifieras med heuristik (hög CTR + topp-position).
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

      {/* SEO Cannibalization */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                SEO-kannibalisering på Ads
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Sökord du redan rankar topp 3 på organiskt — men ändå betalar Google Ads för (senaste 30 dagar).
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={fetchCannibal} disabled={loadingCannibal} className="gap-2">
              <RefreshCw className={`h-3 w-3 ${loadingCannibal ? "animate-spin" : ""}`} />
              {loadingCannibal ? "Analyserar…" : "Analysera nu"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!cannibal ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Klicka "Analysera nu" för att jämföra organiska top-3-sökord mot Ads search terms.
            </p>
          ) : cannibal.message ? (
            <p className="text-sm text-muted-foreground text-center py-6">{cannibal.message}</p>
          ) : cannibal.overlap.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm font-medium">Inga kannibaliserade sökord hittades 🎉</p>
              <p className="text-xs text-muted-foreground">
                Jämfört {cannibal.organic_top3_count} organiska top-3-sökord mot {cannibal.ads_search_terms_count} Ads-sökord.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Kannibaliserade sökord" value={cannibal.overlap.length} accent />
                <Stat label="Potentiell besparing" value={cannibal.total_potential_savings_sek} sub="kr / 30 dagar" />
                <Stat label="Organiska top-3 totalt" value={cannibal.organic_top3_count} />
              </div>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Sökord</th>
                      <th className="text-right px-3 py-2">Org. pos</th>
                      <th className="text-right px-3 py-2">Org. klick</th>
                      <th className="text-right px-3 py-2">Ads-klick</th>
                      <th className="text-right px-3 py-2">Ads-kostnad</th>
                      <th className="text-right px-3 py-2">Ads-konv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cannibal.overlap.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{r.keyword}</td>
                        <td className="px-3 py-2 text-right">{r.organic_position.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">{r.organic_clicks}</td>
                        <td className="px-3 py-2 text-right">{r.ads_clicks}</td>
                        <td className="px-3 py-2 text-right font-medium text-primary">{r.ads_cost_sek.toFixed(0)} kr</td>
                        <td className="px-3 py-2 text-right">{r.ads_conversions.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cannibal.overlap.length > 50 && (
                <p className="text-xs text-muted-foreground text-center">
                  Visar 50 av {cannibal.overlap.length} — sorterat på Ads-kostnad.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                💡 Pausa eller lägg till som negativa sökord i Ads för termer där organisk redan dominerar.
              </p>
            </div>
          )}
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