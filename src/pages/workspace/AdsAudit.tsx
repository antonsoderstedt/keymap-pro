import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Activity, AlertTriangle, CheckCircle2, TrendingDown, Sparkles } from "lucide-react";

type Audit = { id: string; health_score: number | null; summary: any; created_at: string };
type Wasted = { keyword: string; campaign: string; cost_sek: number; clicks: number; ctr: number; quality_score: number | null; suggested_action: string };
type Cluster = { theme: string; reasoning?: string; terms: string[]; suggested_negatives: string[]; match_type: string; wasted_sek: number; scope?: string };

export default function AdsAudit() {
  const { workspaceId } = useWorkspace();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [wasted, setWasted] = useState<Wasted[]>([]);
  const [wastedTotal, setWastedTotal] = useState(0);
  const [wastedLoading, setWastedLoading] = useState(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [miningLoading, setMiningLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    supabase.from("ads_audits").select("*").eq("project_id", workspaceId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setAudit(data as Audit));
  }, [workspaceId]);

  const runAudit = async () => {
    if (!workspaceId) return;
    setAuditLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-audit", { body: { project_id: workspaceId } });
    setAuditLoading(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Audit misslyckades"); return; }
    setAudit(data.audit);
    toast.success(`Hälsopoäng: ${data.audit.health_score}/10`);
  };

  const runWasted = async () => {
    if (!workspaceId) return;
    setWastedLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-wasted-spend", { body: { project_id: workspaceId } });
    setWastedLoading(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Misslyckades"); return; }
    setWasted(data.wasted || []);
    setWastedTotal(data.total_wasted_sek || 0);
    toast.success(`Hittade ${data.wasted?.length || 0} slösare. ${data.action_items_created} action items skapade.`);
  };

  const runMining = async () => {
    if (!workspaceId) return;
    setMiningLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-negative-mining", { body: { project_id: workspaceId } });
    setMiningLoading(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Misslyckades"); return; }
    setClusters(data.clusters || []);
    toast.success(`Analyserade ${data.terms_analysed} termer, ${data.clusters?.length || 0} kluster`);
  };

  const exportNegativesCsv = () => {
    const rows = [["Keyword", "Match Type", "Level"]];
    for (const c of clusters) for (const n of c.suggested_negatives) rows.push([n, c.match_type, c.scope || "account"]);
    const csv = rows.map(r => r.map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "negative-keywords.csv"; a.click();
  };

  const score = audit?.health_score ?? 0;
  const scoreColor = score >= 8 ? "text-primary" : score >= 5 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Ads Audit</h1>
          <p className="text-sm text-muted-foreground">AI-driven hälsokontroll, wasted spend och negativa sökord</p>
        </div>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-2" />Hälsokontroll</TabsTrigger>
          <TabsTrigger value="wasted"><TrendingDown className="h-4 w-4 mr-2" />Wasted Spend</TabsTrigger>
          <TabsTrigger value="negatives"><Sparkles className="h-4 w-4 mr-2" />Negative Mining</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <Button onClick={runAudit} disabled={auditLoading}>
              {auditLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {audit ? "Kör nytt audit" : "Kör hälsokontroll"}
            </Button>
            {audit && <span className="text-xs text-muted-foreground">Senast: {new Date(audit.created_at).toLocaleString("sv-SE")}</span>}
          </div>
          {audit && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-6 flex flex-col items-center justify-center">
                <div className={`font-mono text-7xl font-bold ${scoreColor}`}>{score}</div>
                <div className="text-xs text-muted-foreground mt-1">Hälsopoäng / 10</div>
                <p className="text-sm text-center mt-4">{audit.summary?.headline}</p>
              </Card>
              <Card className="p-6 lg:col-span-2 space-y-3">
                <h3 className="font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />Styrkor</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {(audit.summary?.strengths || []).map((s: string, i: number) => <li key={i}>• {s}</li>)}
                </ul>
                <h3 className="font-medium flex items-center gap-2 mt-4"><Sparkles className="h-4 w-4 text-primary" />Quick wins</h3>
                <ul className="text-sm space-y-1">
                  {(audit.summary?.quick_wins || []).map((s: string, i: number) => <li key={i}>→ {s}</li>)}
                </ul>
              </Card>
              <Card className="p-6 lg:col-span-3 space-y-3">
                <h3 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500" />Issues</h3>
                <div className="space-y-3">
                  {(audit.summary?.issues || []).map((iss: any, i: number) => (
                    <div key={i} className="border-l-2 border-border pl-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={iss.severity === "critical" ? "destructive" : "secondary"}>{iss.severity}</Badge>
                        <span className="font-medium text-sm">{iss.title}</span>
                        {iss.impact_sek > 0 && <span className="text-xs text-muted-foreground ml-auto">~{Math.round(iss.impact_sek)} SEK/mån</span>}
                      </div>
                      {iss.detail && <p className="text-xs text-muted-foreground mt-1">{iss.detail}</p>}
                      <p className="text-xs mt-1"><span className="text-muted-foreground">Åtgärd: </span>{iss.fix}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="wasted" className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <Button onClick={runWasted} disabled={wastedLoading}>
              {wastedLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hitta wasted spend (30d)
            </Button>
            {wastedTotal > 0 && <span className="text-sm">Total: <span className="font-mono text-primary">{wastedTotal} SEK</span></span>}
          </div>
          {wasted.length > 0 && (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left">
                    <th className="p-3">Sökord</th>
                    <th className="p-3">Kampanj</th>
                    <th className="p-3 text-right">Kostnad</th>
                    <th className="p-3 text-right">Klick</th>
                    <th className="p-3 text-right">CTR</th>
                    <th className="p-3 text-right">QS</th>
                    <th className="p-3">Åtgärd</th>
                  </tr>
                </thead>
                <tbody>
                  {wasted.map((w, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-3 font-mono">{w.keyword}</td>
                      <td className="p-3 text-muted-foreground">{w.campaign}</td>
                      <td className="p-3 text-right font-mono">{w.cost_sek}</td>
                      <td className="p-3 text-right font-mono">{w.clicks}</td>
                      <td className="p-3 text-right font-mono">{w.ctr}%</td>
                      <td className="p-3 text-right font-mono">{w.quality_score ?? "—"}</td>
                      <td className="p-3"><Badge variant="outline">{w.suggested_action}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="negatives" className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <Button onClick={runMining} disabled={miningLoading}>
              {miningLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Analysera search terms (90d)
            </Button>
            {clusters.length > 0 && (
              <Button variant="outline" onClick={exportNegativesCsv}>Exportera CSV (Google Ads Editor)</Button>
            )}
          </div>
          <div className="space-y-3">
            {clusters.map((c, i) => (
              <Card key={i} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{c.theme}</h3>
                  <Badge variant="secondary">{c.match_type}</Badge>
                  <Badge variant="outline">{c.scope || "account"}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">~{Math.round(c.wasted_sek)} SEK slösat</span>
                </div>
                {c.reasoning && <p className="text-xs text-muted-foreground">{c.reasoning}</p>}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Söktermer:</div>
                  <div className="flex flex-wrap gap-1">
                    {c.terms.map((t, j) => <Badge key={j} variant="outline" className="font-mono text-[11px]">{t}</Badge>)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1 mt-2">Föreslagna negativa sökord:</div>
                  <div className="flex flex-wrap gap-1">
                    {c.suggested_negatives.map((t, j) => <Badge key={j} className="font-mono text-[11px]">{t}</Badge>)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
