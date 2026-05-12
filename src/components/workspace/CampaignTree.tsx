// Live-trädvy av Google Ads-kontot — Campaigns › Ad groups › Keywords + Ads + Negatives.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, ChevronRight, ChevronDown, Megaphone, Layers, Search, Hash, Ban, FileText, Loader2,
} from "lucide-react";

interface Metrics {
  clicks: number; impressions: number; cost_sek: number; conversions: number;
  conv_value_sek: number; ctr: number; cpa_sek: number | null; roas: number | null;
}
interface Keyword {
  ad_group_id: string; criterion_id: string; text: string; match_type: string;
  status: string; quality_score: number | null; cpc_bid_sek: number | null; metrics_30d: Metrics;
}
interface Ad {
  ad_group_id: string; ad_id: string; type: string; status: string; ad_strength: string;
  rsa: { headlines: string[]; descriptions: string[]; path1: string; path2: string } | null;
  final_urls: string[]; metrics_30d: Metrics;
}
interface AdGroup {
  id: string; campaign_id: string; name: string; status: string; type: string;
  cpc_bid_sek: number | null; metrics_30d: Metrics; keywords: Keyword[]; ads: Ad[];
}
interface Negative { criterion_id: string; text: string; match_type: string }
interface Campaign {
  id: string; name: string; status: string; channel: string; bidding_strategy_type: string;
  optimization_score: number | null; target_cpa_sek: number | null; target_roas: number | null;
  daily_budget_sek: number; metrics_30d: Metrics; ad_groups: AdGroup[]; negatives: Negative[];
}

const STATUS_TONE: Record<string, string> = {
  ENABLED: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  PAUSED: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40",
  REMOVED: "bg-muted text-muted-foreground",
};

const fmtSek = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;
const fmtNum = (n: number) => n.toLocaleString("sv-SE");
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function CampaignTree({ projectId }: { projectId: string | null }) {
  const { toast } = useToast();
  const [tree, setTree] = useState<{ campaigns: Campaign[]; fetched_at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const load = async (force = false) => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-fetch-account-tree", { body: { project_id: projectId, force } });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: "Kunde inte hämta kontostruktur", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    setTree(data?.tree || null);
  };

  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const filtered = (() => {
    if (!tree) return [];
    if (!filter) return tree.campaigns;
    const q = filter.toLowerCase();
    return tree.campaigns.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.ad_groups.some((g) => g.name.toLowerCase().includes(q) || g.keywords.some((k) => k.text.toLowerCase().includes(q)))
    );
  })();

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  if (!projectId) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-lg flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> Live-kampanjer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Riktig data från Google Ads (cache 15 min). Senaste 30 dagars metrics. Klicka för att expandera.
            </p>
            {tree?.fetched_at && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                Hämtat: {new Date(tree.fetched_at).toLocaleString("sv-SE")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrera…" className="pl-8 h-9 w-44" />
            </div>
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Uppdatera
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !tree ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">Inga kampanjer hittades.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const isOpen = openCampaigns.has(c.id);
            return (
              <Card key={c.id}>
                <CardContent className="p-0">
                  <button onClick={() => toggle(openCampaigns, c.id, setOpenCampaigns)} className="w-full p-3 text-left hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Megaphone className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium truncate">{c.name}</span>
                      <Badge variant="outline" className={STATUS_TONE[c.status] || ""}>{c.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{c.channel}</Badge>
                      {c.bidding_strategy_type && <Badge variant="outline" className="text-[10px] font-mono">{c.bidding_strategy_type}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-[11px] font-mono">
                      <Metric label="Spend 30d" value={fmtSek(c.metrics_30d.cost_sek)} />
                      <Metric label="Konv" value={fmtNum(Math.round(c.metrics_30d.conversions))} />
                      <Metric label="CPA" value={c.metrics_30d.cpa_sek ? fmtSek(c.metrics_30d.cpa_sek) : "—"} />
                      <Metric label="ROAS" value={c.metrics_30d.roas ? c.metrics_30d.roas.toFixed(2) : "—"} />
                      <Metric label="Budget/dag" value={fmtSek(c.daily_budget_sek)} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/10 p-3 space-y-3">
                      {c.ad_groups.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Inga aktiva annonsgrupper.</p>
                      ) : c.ad_groups.map((g) => {
                        const gOpen = openGroups.has(g.id);
                        return (
                          <div key={g.id} className="border rounded-md bg-background">
                            <button onClick={() => toggle(openGroups, g.id, setOpenGroups)} className="w-full p-2.5 text-left hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-2 flex-wrap">
                                {gOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <Layers className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm font-medium truncate">{g.name}</span>
                                <Badge variant="outline" className={`${STATUS_TONE[g.status] || ""} text-[10px]`}>{g.status}</Badge>
                                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                  {fmtSek(g.metrics_30d.cost_sek)} · {Math.round(g.metrics_30d.conversions)} konv
                                </span>
                              </div>
                            </button>
                            {gOpen && (
                              <div className="px-3 pb-3 pt-1 space-y-2">
                                {/* Keywords */}
                                {g.keywords.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Hash className="h-3 w-3" /> Sökord ({g.keywords.length})</div>
                                    <div className="space-y-1">
                                      {g.keywords.slice(0, 25).map((k) => (
                                        <div key={k.criterion_id} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/20">
                                          <Badge variant="outline" className={`${STATUS_TONE[k.status] || ""} text-[9px]`}>{k.match_type}</Badge>
                                          <span className="truncate flex-1">{k.text}</span>
                                          {k.quality_score != null && <span className="text-[10px] font-mono text-muted-foreground">QS:{k.quality_score}</span>}
                                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{fmtSek(k.metrics_30d.cost_sek)}</span>
                                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-12 text-right">{fmtPct(k.metrics_30d.ctr)}</span>
                                        </div>
                                      ))}
                                      {g.keywords.length > 25 && <p className="text-[10px] text-muted-foreground italic px-2">…och {g.keywords.length - 25} till</p>}
                                    </div>
                                  </div>
                                )}
                                {/* Ads */}
                                {g.ads.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><FileText className="h-3 w-3" /> Annonser ({g.ads.length})</div>
                                    <div className="space-y-1.5">
                                      {g.ads.map((a) => (
                                        <div key={a.ad_id} className="text-xs px-2 py-1.5 rounded bg-muted/20 space-y-1">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`${STATUS_TONE[a.status] || ""} text-[9px]`}>{a.status}</Badge>
                                            <Badge variant="outline" className="text-[9px]">{a.type}</Badge>
                                            {a.ad_strength && <Badge variant="outline" className="text-[9px]">Style: {a.ad_strength}</Badge>}
                                            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{fmtSek(a.metrics_30d.cost_sek)} · {Math.round(a.metrics_30d.conversions)} konv</span>
                                          </div>
                                          {a.rsa && (
                                            <div className="grid md:grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
                                              <div><span className="font-medium text-foreground">H:</span> {a.rsa.headlines.slice(0, 4).join(" · ")}{a.rsa.headlines.length > 4 ? ` (+${a.rsa.headlines.length - 4})` : ""}</div>
                                              <div><span className="font-medium text-foreground">D:</span> {a.rsa.descriptions.slice(0, 2).join(" · ")}{a.rsa.descriptions.length > 2 ? ` (+${a.rsa.descriptions.length - 2})` : ""}</div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Negatives */}
                      {c.negatives.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Ban className="h-3 w-3" /> Negativa sökord ({c.negatives.length})</div>
                          <div className="flex flex-wrap gap-1">
                            {c.negatives.slice(0, 30).map((n) => (
                              <Badge key={n.criterion_id} variant="outline" className="text-[10px] font-mono">−{n.text} <span className="opacity-60 ml-1">{n.match_type}</span></Badge>
                            ))}
                            {c.negatives.length > 30 && <span className="text-[10px] text-muted-foreground italic">+{c.negatives.length - 30}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
