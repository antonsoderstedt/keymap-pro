import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Activity, AlertTriangle, CheckCircle2, TrendingDown, Sparkles, Wand2, Send, History, Undo2, Gauge, ListChecks, Download, ExternalLink } from "lucide-react";

type Audit = { id: string; health_score: number | null; summary: any; created_at: string };
type Wasted = { keyword: string; campaign: string; campaign_id?: string; ad_group_id?: string; criterion_id?: string; cost_sek: number; clicks: number; ctr: number; quality_score: number | null; suggested_action: string; match_type?: string; landing_page?: string | null };
type LandingPage = { url: string; keyword_count: number; keywords: string[]; total_cost_sek: number; total_clicks: number; campaigns: string[]; needs_check: boolean };
type Cluster = { theme: string; reasoning?: string; terms: string[]; suggested_negatives: string[]; match_type: string; wasted_sek: number; scope?: string };
type RsaSuggestion = {
  ad_id: string; ad_group: string; ad_group_id: string; campaign: string;
  best_count: number; good_count: number; low_count: number;
  replacements: { loser_asset_id: string; field: string; original: string; candidates: string[]; rationale?: string }[];
};
type RsaResult = { summary: any; ad_groups: any[]; suggestions: RsaSuggestion[] };
type Mutation = { id: string; action_type: string; status: string; payload: any; error_message: string | null; created_at: string; reverted_at: string | null };
type PacingAlert = { type: string; title: string; message: string; severity: string };

export default function AdsAudit() {
  const { workspaceId } = useWorkspace();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [wasted, setWasted] = useState<Wasted[]>([]);
  const [wastedTotal, setWastedTotal] = useState(0);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [wastedLoading, setWastedLoading] = useState(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [miningLoading, setMiningLoading] = useState(false);
  const [rsa, setRsa] = useState<RsaResult | null>(null);
  const [rsaLoading, setRsaLoading] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [pacing, setPacing] = useState<PacingAlert[]>([]);
  const [pacingLoading, setPacingLoading] = useState(false);
  // Bulk-RSA: nyckel = `${ad_id}|${replIdx}|${candIdx}` → vald
  const [rsaSelection, setRsaSelection] = useState<Record<string, boolean>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const toggleSel = (k: string) => setRsaSelection((s) => ({ ...s, [k]: !s[k] }));
  const clearSel = () => setRsaSelection({});
  const selectAllFirstCandidate = () => {
    const next: Record<string, boolean> = {};
    rsa?.suggestions?.forEach((s) => {
      s.replacements.forEach((r, i) => {
        if (r.candidates.length > 0) next[`${s.ad_id}|${i}|0`] = true;
      });
    });
    setRsaSelection(next);
  };
  const selectedCount = Object.values(rsaSelection).filter(Boolean).length;

  const runBulkReplace = async () => {
    if (!rsa || selectedCount === 0) return;
    setBulkRunning(true);
    // Gruppera per ad_id för att skicka EN mutation per annons med flera replacements
    const byAd: Record<string, { ad_group_id: string; ad_group: string; items: { field: string; original_text: string; new_text: string }[] }> = {};
    for (const s of rsa.suggestions) {
      s.replacements.forEach((r, i) => {
        r.candidates.forEach((c, j) => {
          if (rsaSelection[`${s.ad_id}|${i}|${j}`]) {
            byAd[s.ad_id] = byAd[s.ad_id] || { ad_group_id: s.ad_group_id, ad_group: s.ad_group, items: [] };
            byAd[s.ad_id].items.push({ field: r.field, original_text: r.original, new_text: c });
          }
        });
      });
    }
    let ok = 0, fail = 0;
    for (const [ad_id, info] of Object.entries(byAd)) {
      const { data, error } = await supabase.functions.invoke("ads-mutate", {
        body: {
          project_id: workspaceId,
          action_type: "replace_rsa_asset",
          payload: { ad_group_id: info.ad_group_id, ad_id, replacements: info.items },
        },
      });
      if (error || data?.error) {
        fail++;
        console.error("[bulk-rsa]", ad_id, error || data?.error);
      } else {
        ok++;
      }
    }
    setBulkRunning(false);
    clearSel();
    if (ok) toast.success(`${ok} annons${ok === 1 ? "" : "er"} uppdaterad${ok === 1 ? "" : "e"} i Google Ads`);
    if (fail) toast.error(`${fail} misslyckades — se Logg-fliken`);
    loadMutations();
  };

  const runBulkPauseAds = async () => {
    if (!rsa) return;
    // Pausa annonser som har minst en vald replacement (snabbväg vid total omstart)
    const adIds = new Set<string>();
    Object.keys(rsaSelection).forEach((k) => {
      if (rsaSelection[k]) adIds.add(k.split("|")[0]);
    });
    if (adIds.size === 0) return;
    setBulkRunning(true);
    let ok = 0, fail = 0;
    for (const ad_id of adIds) {
      const s = rsa.suggestions.find((x) => x.ad_id === ad_id);
      if (!s) continue;
      const { data, error } = await supabase.functions.invoke("ads-mutate", {
        body: { project_id: workspaceId, action_type: "pause_ad", payload: { ad_group_id: s.ad_group_id, ad_id } },
      });
      if (error || data?.error) fail++; else ok++;
    }
    setBulkRunning(false);
    clearSel();
    if (ok) toast.success(`${ok} annons${ok === 1 ? "" : "er"} pausade`);
    if (fail) toast.error(`${fail} misslyckades — se Logg-fliken`);
    loadMutations();
  };

  useEffect(() => {
    if (!workspaceId) return;
    supabase.from("ads_audits").select("*").eq("project_id", workspaceId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setAudit(data as Audit));
    loadMutations();
  }, [workspaceId]);

  const loadMutations = async () => {
    if (!workspaceId) return;
    const { data } = await supabase.from("ads_mutations").select("*").eq("project_id", workspaceId)
      .order("created_at", { ascending: false }).limit(50);
    setMutations((data as Mutation[]) || []);
  };

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
    setLandingPages(data.landing_pages || []);
    toast.success(`Hittade ${data.wasted?.length || 0} slösare. ${data.action_items_created} action items skapade.`);
  };

  const exportLandingPagesCsv = () => {
    if (!landingPages.length) return;
    const header = ["URL", "Antal sökord", "Total kostnad SEK", "Total klick", "Kampanjer", "Behöver kontroll", "Sökord"];
    const rows = landingPages.map((lp) => [
      lp.url,
      String(lp.keyword_count),
      String(lp.total_cost_sek),
      String(lp.total_clicks),
      lp.campaigns.join(" | "),
      lp.needs_check ? "Ja" : "Nej",
      lp.keywords.join(" | "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `landningssidor-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const runRsa = async () => {
    if (!workspaceId) return;
    setRsaLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-rsa-performance", { body: { project_id: workspaceId, suggest_replacements: true } });
    setRsaLoading(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Misslyckades"); return; }
    setRsa(data);
    toast.success(`${data.summary?.ads_with_low_assets || 0} annonser har LOW-assets`);
  };

  const runPacing = async () => {
    if (!workspaceId) return;
    setPacingLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-pacing", { body: { project_id: workspaceId } });
    setPacingLoading(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Misslyckades"); return; }
    setPacing(data.alerts || []);
    toast.success(`${data.generated} pacing-alerts genererade`);
  };

  const pushMutation = async (key: string, action_type: string, payload: any) => {
    if (!workspaceId) return;
    setPushing(key);
    const { data, error } = await supabase.functions.invoke("ads-mutate", {
      body: { project_id: workspaceId, action_type, payload },
    });
    setPushing(null);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Push misslyckades"); return; }
    toast.success("Ändring genomförd i Google Ads");
    loadMutations();
  };

  const revertMutation = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("ads-revert-mutation", { body: { mutation_id: id } });
    if (error || data?.error) { toast.error(data?.error || error?.message || "Revert misslyckades"); return; }
    toast.success("Återställt");
    loadMutations();
  };

  const pushAllNegatives = async (cluster: Cluster) => {
    if (!workspaceId) return;
    if (!wasted.length) {
      toast.error("Behöver kampanj-id från Wasted Spend först. Kör Wasted Spend, eller använd CSV-export.");
      return;
    }
    // Use the most expensive wasted campaign as target (heuristic)
    const targetCampaign = wasted[0]?.campaign_id;
    if (!targetCampaign) { toast.error("Kan inte hitta kampanj-id."); return; }
    let success = 0;
    setPushing(`cluster-${cluster.theme}`);
    for (const kw of cluster.suggested_negatives) {
      const { data, error } = await supabase.functions.invoke("ads-mutate", {
        body: { project_id: workspaceId, action_type: "add_negative_keyword",
          payload: { keyword: kw, match_type: cluster.match_type, campaign_id: targetCampaign } },
      });
      if (!error && !data?.error) success++;
    }
    setPushing(null);
    toast.success(`Lade till ${success}/${cluster.suggested_negatives.length} negativa sökord`);
    loadMutations();
  };

  const score = audit?.health_score ?? 0;
  const scoreColor = score >= 8 ? "text-primary" : score >= 5 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Ads Audit & Optimizer</h1>
          <p className="text-sm text-muted-foreground">AI-driven hälsokontroll, RSA-optimering och write-back till Google Ads</p>
        </div>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-2" />Hälsokontroll</TabsTrigger>
          <TabsTrigger value="wasted"><TrendingDown className="h-4 w-4 mr-2" />Wasted Spend</TabsTrigger>
          <TabsTrigger value="negatives"><Sparkles className="h-4 w-4 mr-2" />Negative Mining</TabsTrigger>
          <TabsTrigger value="rsa"><Wand2 className="h-4 w-4 mr-2" />RSA Optimizer</TabsTrigger>
          <TabsTrigger value="pacing"><Gauge className="h-4 w-4 mr-2" />Pacing</TabsTrigger>
          <TabsTrigger value="log"><History className="h-4 w-4 mr-2" />Logg</TabsTrigger>
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
          {landingPages.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-primary" />
                    Landningssidor som behöver kontroll
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {landingPages.filter((l) => l.needs_check).length} av {landingPages.length} sidor flaggade — sorterade efter total kostnad.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={exportLandingPagesCsv}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportera CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2">Landningssida</th>
                      <th className="p-2 text-right">Sökord</th>
                      <th className="p-2 text-right">Kostnad 30d</th>
                      <th className="p-2 text-right">Klick</th>
                      <th className="p-2">Kampanjer</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landingPages.map((lp) => (
                      <tr key={lp.url} className="border-t border-border align-top">
                        <td className="p-2 max-w-[280px]">
                          <a
                            href={lp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-primary hover:underline break-all"
                          >
                            {lp.url}
                          </a>
                        </td>
                        <td className="p-2 text-right font-mono">{lp.keyword_count}</td>
                        <td className="p-2 text-right font-mono">{lp.total_cost_sek}</td>
                        <td className="p-2 text-right font-mono">{lp.total_clicks}</td>
                        <td className="p-2 text-xs text-muted-foreground">{lp.campaigns.slice(0, 2).join(", ")}{lp.campaigns.length > 2 && ` +${lp.campaigns.length - 2}`}</td>
                        <td className="p-2">
                          {lp.needs_check
                            ? <Badge variant="destructive" className="text-[10px]">Kontrollera</Badge>
                            : <Badge variant="outline" className="text-[10px]">OK</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
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
                    <th className="p-3">Föreslagen åtgärd</th>
                    <th className="p-3 text-right">Push</th>
                  </tr>
                </thead>
                <tbody>
                  {wasted.map((w, i) => {
                    const key = `wasted-${i}`;
                    const canPause = !!(w.ad_group_id && w.criterion_id);
                    const canNeg = !!(w.campaign_id && w.keyword);
                    const isPause = w.suggested_action.toLowerCase().includes("pausa");
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="p-3 font-mono">{w.keyword}</td>
                        <td className="p-3 text-muted-foreground">{w.campaign}</td>
                        <td className="p-3 text-right font-mono">{w.cost_sek}</td>
                        <td className="p-3 text-right font-mono">{w.clicks}</td>
                        <td className="p-3 text-right font-mono">{w.ctr}%</td>
                        <td className="p-3 text-right font-mono">{w.quality_score ?? "—"}</td>
                        <td className="p-3"><Badge variant="outline">{w.suggested_action}</Badge></td>
                        <td className="p-3 text-right">
                          <ConfirmPush
                            disabled={pushing === key || (!canPause && !canNeg)}
                            loading={pushing === key}
                            label={isPause ? "Pausa" : "Negativ"}
                            description={isPause
                              ? `Pausa sökordet "${w.keyword}" i kampanjen "${w.campaign}". Live i Google Ads.`
                              : `Lägg till "${w.keyword}" som negativt (${w.match_type || "PHRASE"}) i kampanjen "${w.campaign}". Live i Google Ads.`}
                            onConfirm={() => isPause && canPause
                              ? pushMutation(key, "pause_keyword", { ad_group_id: w.ad_group_id, criterion_id: w.criterion_id })
                              : pushMutation(key, "add_negative_keyword", { keyword: w.keyword, match_type: w.match_type || "PHRASE", campaign_id: w.campaign_id })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
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
          </div>
          <div className="space-y-3">
            {clusters.map((c, i) => (
              <Card key={i} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{c.theme}</h3>
                  <Badge variant="secondary">{c.match_type}</Badge>
                  <Badge variant="outline">{c.scope || "account"}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">~{Math.round(c.wasted_sek)} SEK slösat</span>
                  <ConfirmPush
                    disabled={pushing === `cluster-${c.theme}`}
                    loading={pushing === `cluster-${c.theme}`}
                    label={`Pusha ${c.suggested_negatives.length}`}
                    description={`Lägg till ${c.suggested_negatives.length} negativa sökord (${c.match_type}) på kampanjen med högst spend. Live i Google Ads.`}
                    onConfirm={() => pushAllNegatives(c)}
                  />
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

        <TabsContent value="rsa" className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <Button onClick={runRsa} disabled={rsaLoading}>
              {rsaLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Analysera RSA-assets + AI-förslag
            </Button>
            {rsa?.summary && (
              <span className="text-xs text-muted-foreground">
                {rsa.summary.ads_analysed} annonser · {rsa.summary.total_low_assets} LOW · {rsa.summary.total_best_assets} BEST
              </span>
            )}
          </div>

          {rsa?.suggestions?.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="text-sm">
                {selectedCount > 0 ? <><b>{selectedCount}</b> ändring{selectedCount === 1 ? "" : "ar"} markerade</> : "Bulk: markera kandidater nedan eller välj snabbval"}
              </span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAllFirstCandidate} disabled={bulkRunning}>
                  Markera bästa förslag (alla)
                </Button>
                <Button size="sm" variant="outline" onClick={clearSel} disabled={bulkRunning || selectedCount === 0}>
                  Rensa
                </Button>
                <ConfirmPush
                  disabled={bulkRunning || selectedCount === 0}
                  loading={bulkRunning}
                  label={`Ersätt ${selectedCount} valda`}
                  description={`Skickar ${selectedCount} headline-/description-byte till Google Ads. Allt loggas och kan ångras.`}
                  onConfirm={runBulkReplace}
                />
                <ConfirmPush
                  disabled={bulkRunning || selectedCount === 0}
                  loading={bulkRunning}
                  label="Pausa valda annonser"
                  description={`Pausar alla annonser där minst en kandidat är vald (${new Set(Object.keys(rsaSelection).filter(k => rsaSelection[k]).map(k => k.split("|")[0])).size} st).`}
                  onConfirm={runBulkPauseAds}
                />
              </div>
            </div>
          ) : null}

          {rsa?.suggestions?.length ? (
            <div className="space-y-3">
              {rsa.suggestions.map((s) => (
                <Card key={s.ad_id} className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{s.ad_group}</h3>
                    <span className="text-xs text-muted-foreground">{s.campaign}</span>
                    <Badge variant="destructive" className="ml-auto">{s.low_count} LOW</Badge>
                    <Badge>{s.best_count} BEST</Badge>
                    <ConfirmPush
                      disabled={pushing === `pause-ad-${s.ad_id}`}
                      loading={pushing === `pause-ad-${s.ad_id}`}
                      label="Pausa annonsen"
                      description={`Pausar hela annonsen i "${s.ad_group}". Detta är live.`}
                      onConfirm={() => pushMutation(`pause-ad-${s.ad_id}`, "pause_ad", { ad_group_id: s.ad_group_id, ad_id: s.ad_id })}
                    />
                  </div>
                  <div className="space-y-2">
                    {s.replacements.map((r, i) => (
                      <div key={i} className="border-l-2 border-border pl-3 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{r.field}</Badge>
                          <span className="text-xs text-muted-foreground line-through font-mono">{r.original}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {r.candidates.map((c, j) => {
                            const selKey = `${s.ad_id}|${i}|${j}`;
                            return (
                              <div key={j} className="flex items-center gap-1">
                                <Checkbox
                                  id={selKey}
                                  checked={!!rsaSelection[selKey]}
                                  onCheckedChange={() => toggleSel(selKey)}
                                  aria-label={`Välj ${c}`}
                                />
                                <label htmlFor={selKey}>
                                  <Badge variant="secondary" className="font-mono text-[11px] cursor-pointer">{c}</Badge>
                                </label>
                                <ConfirmPush
                                  disabled={pushing === `rsa-${s.ad_id}-${i}-${j}`}
                                  loading={pushing === `rsa-${s.ad_id}-${i}-${j}`}
                                  label="Ersätt"
                                  description={`Ersätter "${r.original}" med "${c}" i annonsen "${s.ad_group}". Live i Google Ads.`}
                                  onConfirm={() => pushMutation(`rsa-${s.ad_id}-${i}-${j}`, "replace_rsa_asset", {
                                    ad_group_id: s.ad_group_id, ad_id: s.ad_id,
                                    replacements: [{ field: r.field, original_text: r.original, new_text: c }],
                                  })}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {r.rationale && <p className="text-xs text-muted-foreground">{r.rationale}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Klicka "Ersätt" för att skicka ändringen till Google Ads. Allt loggas och kan återställas i Logg-fliken.
                  </p>

                </Card>
              ))}
            </div>
          ) : rsa ? (
            <p className="text-sm text-muted-foreground">Inga LOW-assets hittades. Bra jobbat 🎯</p>
          ) : null}
        </TabsContent>

        <TabsContent value="pacing" className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <Button onClick={runPacing} disabled={pacingLoading}>
              {pacingLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Kör pacing & anomaly check
            </Button>
            <span className="text-xs text-muted-foreground">Jämför 7d mot 30d baseline</span>
          </div>
          <div className="space-y-2">
            {pacing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga avvikelser. (Eller tryck på knappen.)</p>
            ) : pacing.map((a, i) => (
              <Card key={i} className="p-3 flex items-start gap-3">
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge>
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{a.title}</h4>
                  <p className="text-xs text-muted-foreground">{a.message}</p>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="log" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Audit-logg över alla ändringar pushade till Google Ads.</p>
            <Button variant="outline" size="sm" onClick={loadMutations}>Uppdatera</Button>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <th className="p-3">Tid</th>
                  <th className="p-3">Åtgärd</th>
                  <th className="p-3">Detaljer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Återställ</th>
                </tr>
              </thead>
              <tbody>
                {mutations.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">Inga ändringar ännu.</td></tr>
                )}
                {mutations.map((m) => {
                  const human = describeMutation(m);
                  return (
                    <tr key={m.id} className="border-t border-border align-top">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString("sv-SE")}</td>
                      <td className="p-3 text-sm">
                        <div className="font-medium">{human.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.action_type}</div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground max-w-md">
                        <div className="whitespace-pre-line">{human.details}</div>
                        {m.reverted_at && (
                          <div className="text-amber-500 mt-1">↺ Återställd {new Date(m.reverted_at).toLocaleString("sv-SE")}</div>
                        )}
                        {m.error_message && <div className="text-destructive mt-1">⚠ {m.error_message}</div>}
                      </td>
                      <td className="p-3">
                        <Badge variant={m.status === "success" ? "default" : m.status === "reverted" ? "secondary" : m.status === "error" ? "destructive" : "outline"}>
                          {statusLabel(m.status)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {m.status === "success" && !m.reverted_at && m.action_type !== "remove_resource" && (
                          <Button size="sm" variant="ghost" onClick={() => revertMutation(m.id)}>
                            <Undo2 className="h-3 w-3 mr-1" />Återställ
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Översätt action_type + payload till klartext en människa förstår.
function describeMutation(m: Mutation): { title: string; details: string } {
  const p = m.payload || {};
  const kw = p.keyword ? `"${p.keyword}"` : "";
  const camp = p.campaign_name || p.campaign_id ? `kampanj ${p.campaign_name || `#${p.campaign_id}`}` : "";
  const adGroup = p.ad_group_name || p.ad_group_id ? `annonsgrupp ${p.ad_group_name || `#${p.ad_group_id}`}` : "";

  switch (m.action_type) {
    case "pause_keyword":
      return {
        title: `Pausade sökord ${kw}`.trim(),
        details: [adGroup, `Kriterie-ID: ${p.criterion_id ?? "—"}`].filter(Boolean).join("\n"),
      };
    case "enable_keyword":
      return {
        title: `Aktiverade sökord ${kw}`.trim(),
        details: [adGroup, `Kriterie-ID: ${p.criterion_id ?? "—"}`].filter(Boolean).join("\n"),
      };
    case "add_negative_keyword":
      return {
        title: `Lade till negativt sökord ${kw}`.trim(),
        details: [camp, `Matchningstyp: ${p.match_type || "PHRASE"}`].filter(Boolean).join("\n"),
      };
    case "remove_resource":
      return {
        title: `Tog bort resurs`,
        details: `Resursnamn: ${p.resource_name ?? "—"}`,
      };
    case "pause_ad":
      return {
        title: `Pausade annons #${p.ad_id ?? "?"}`,
        details: adGroup || "—",
      };
    case "replace_rsa_asset":
      return {
        title: `Bytte RSA-asset (${p.field || "headline"})`,
        details: [
          adGroup,
          p.original ? `Från: "${p.original}"` : "",
          p.replacement ? `Till: "${p.replacement}"` : "",
        ].filter(Boolean).join("\n"),
      };
    case "set_bid":
      return {
        title: `Justerade bud till ${p.bid_micros ? (p.bid_micros / 1_000_000).toFixed(2) + " kr" : "—"}`,
        details: [adGroup, kw].filter(Boolean).join(" · "),
      };
    case "set_budget":
      return {
        title: `Ändrade dagsbudget till ${p.amount_micros ? (p.amount_micros / 1_000_000).toFixed(0) + " kr" : "—"}`,
        details: camp || "—",
      };
    default:
      return {
        title: m.action_type.replace(/_/g, " "),
        details: kw || p.criterion_id || p.ad_id || JSON.stringify(p).slice(0, 120) || "—",
      };
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "success": return "Lyckades";
    case "error": return "Misslyckades";
    case "reverted": return "Återställd";
    case "pending": return "Väntar";
    default: return s;
  }
}

function ConfirmPush({ label, description, onConfirm, disabled, loading }: {
  label: string; description: string; onConfirm: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bekräfta ändring i Google Ads</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Pusha till Google Ads</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
