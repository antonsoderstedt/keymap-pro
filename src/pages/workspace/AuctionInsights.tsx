import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Competitor {
  domain: string; impressionShare?: number; overlapRate?: number;
  positionAbove?: number; topOfPage?: number; campaign?: string;
}
interface Campaign {
  id: string; name: string; impressionShare?: number; topIS?: number;
  lostRank?: number; lostBudget?: number; cost?: number; conversions?: number; clicks?: number;
}

export default function AuctionInsights() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [adsCustomerId, setAdsCustomerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ competitors: Competitor[]; campaigns: Campaign[]; created_at?: string } | null>(null);

  const load = async () => {
    if (!id) return;
    const { data: gset } = await supabase
      .from("project_google_settings").select("ads_customer_id").eq("project_id", id).maybeSingle();
    setAdsCustomerId(gset?.ads_customer_id ?? null);

    const { data: snap } = await supabase
      .from("auction_insights_snapshots").select("*").eq("project_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (snap) {
      const r = snap.rows as any;
      setSnapshot({ competitors: r?.competitors || [], campaigns: r?.campaigns || [], created_at: snap.created_at });
    }
  };
  useEffect(() => { load(); }, [id]);

  const refresh = async () => {
    if (!id || !adsCustomerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-fetch-auction-insights", {
        body: { project_id: id, customer_id: adsCustomerId, days: 30 },
      });
      if (error) throw error;
      toast.success(`Hämtade ${data?.competitors || 0} konkurrenter & ${data?.campaigns || 0} kampanjer`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Misslyckades hämta Ads-data");
    } finally { setLoading(false); }
  };

  const isLive = !!adsCustomerId;
  const competitors = snapshot?.competitors || [];
  const campaigns = snapshot?.campaigns || [];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-serif text-3xl">Auction Insights</h1>
            <Badge variant={isLive ? "default" : "outline"}>{isLive ? "Live" : "Inte konfigurerad"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Konkurrent-data från Google Ads: Impression Share, Overlap, Position Above.
          </p>
        </div>
        {isLive && (
          <Button onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Hämtar…" : "Uppdatera nu"}
          </Button>
        )}
      </div>

      {!isLive && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Inget Google Ads-konto valt för den här kunden</p>
              <p className="text-muted-foreground mt-1">
                Gå till <strong>Inställningar → Kopplingar → Google Ads</strong> och välj kontot som tillhör kunden, så aktiveras live-data här.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLive && !snapshot && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Ingen data hämtad än. Klicka <strong>Uppdatera nu</strong> för att dra senaste 30 dagarna.
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {snapshot.created_at && (
            <p className="text-xs text-muted-foreground">
              Senast uppdaterad: {new Date(snapshot.created_at).toLocaleString("sv-SE")}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Konkurrenter (senaste 30 dagar)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {competitors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga konkurrent-rader returnerade. Kontot kanske inte har tillräcklig auktions-data ännu.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4">Domän</th>
                      <th className="py-2 pr-4">Impr. Share</th>
                      <th className="py-2 pr-4">Overlap</th>
                      <th className="py-2 pr-4">Pos. above</th>
                      <th className="py-2 pr-4">Top of page</th>
                      <th className="py-2 pr-4">Kampanj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c, i) => (
                      <tr key={`${c.domain}-${i}`} className="border-b border-border/50">
                        <td className="py-3 pr-4 font-medium">{c.domain}</td>
                        <td className="py-3 pr-4">{c.impressionShare != null ? `${(c.impressionShare * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.overlapRate != null ? `${(c.overlapRate * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.positionAbove != null ? `${(c.positionAbove * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.topOfPage != null ? `${(c.topOfPage * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{c.campaign || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Kampanj-prestanda & lost IS</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga kampanjer hittades.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4">Kampanj</th>
                      <th className="py-2 pr-4">IS</th>
                      <th className="py-2 pr-4">Lost (budget)</th>
                      <th className="py-2 pr-4">Lost (rank)</th>
                      <th className="py-2 pr-4">Klick</th>
                      <th className="py-2 pr-4">Konv.</th>
                      <th className="py-2 pr-4">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const flagBudget = (c.lostBudget ?? 0) > 0.15;
                      const flagRank = (c.lostRank ?? 0) > 0.20;
                      return (
                        <tr key={c.id} className="border-b border-border/50">
                          <td className="py-3 pr-4 font-medium">{c.name}</td>
                          <td className="py-3 pr-4">{c.impressionShare != null ? `${(c.impressionShare * 100).toFixed(0)}%` : "—"}</td>
                          <td className={`py-3 pr-4 ${flagBudget ? "text-destructive font-medium" : ""}`}>
                            {c.lostBudget != null ? `${(c.lostBudget * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className={`py-3 pr-4 ${flagRank ? "text-destructive font-medium" : ""}`}>
                            {c.lostRank != null ? `${(c.lostRank * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="py-3 pr-4">{c.clicks ?? 0}</td>
                          <td className="py-3 pr-4">{c.conversions?.toFixed(1) ?? 0}</td>
                          <td className="py-3 pr-4">{c.cost ? `${c.cost.toFixed(0)} kr` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
