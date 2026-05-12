// Förslagskö — granska → godkänn → pusha (pausat) med köad åtgärdsstatus.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, Send, Sparkles, RefreshCw, Inbox, AlertCircle, Loader2, Download,
  Eye, ChevronRight, Clock, PauseCircle,
} from "lucide-react";
import { toCsv, downloadCsv, ymd } from "@/lib/csv";

type Status = "draft" | "approved" | "queued" | "pushed" | "rejected" | "failed";

interface Proposal {
  id: string;
  source: string;
  action_type: string;
  scope_label: string | null;
  payload: any;
  diff: any;
  estimated_impact_sek: number | null;
  rationale: string | null;
  rule_id: string | null;
  status: string; // tolerera ad-hoc värden
  push_as_paused: boolean;
  mutation_id: string | null;
  error_message: string | null;
  created_at: string;
  pushed_at: string | null;
}

const STATUS_TONE: Record<Status, string> = {
  draft: "bg-muted text-foreground border-border",
  approved: "bg-primary/15 text-primary border-primary/40",
  queued: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40",
  pushed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  rejected: "bg-muted text-muted-foreground line-through border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/40",
};
const STATUS_LABEL: Record<Status, string> = {
  draft: "Att granska", approved: "Godkänt", queued: "I kö",
  pushed: "Pushat (pausat)", rejected: "Avvisat", failed: "Fel",
};
const STATUS_ICON: Record<Status, any> = {
  draft: Eye, approved: CheckCircle2, queued: Clock,
  pushed: PauseCircle, rejected: XCircle, failed: AlertCircle,
};

function actionLabel(t: string): string {
  const map: Record<string, string> = {
    pause_keyword: "Pausa sökord",
    resume_keyword: "Återuppta sökord",
    pause_ad: "Pausa annons",
    resume_ad: "Återuppta annons",
    add_negative_keyword: "Lägg till negativt sökord",
    replace_rsa_asset: "Ersätt RSA-text",
    rsa_batch: "RSA-batchändring",
    create_rsa: "Skapa RSA-annons",
    create_rsa_pending_adgroup: "Ny RSA (välj annonsgrupp)",
    create_ad_group: "Skapa annonsgrupp",
    add_keyword: "Lägg till sökord",
  };
  return map[t] || t;
}
const isStatus = (v: string): Status =>
  (["draft", "approved", "queued", "pushed", "rejected", "failed"].includes(v) ? v : "draft") as Status;

type Bucket = "review" | "approved" | "queued" | "pushed" | "failed" | "rejected" | "all";
const BUCKET_FOR: Record<Status, Bucket> = {
  draft: "review", approved: "approved", queued: "queued",
  pushed: "pushed", failed: "failed", rejected: "rejected",
};

export function ProposalsTab({ projectId }: { projectId: string | null }) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bucket, setBucket] = useState<Bucket>("review");
  const [pushAsPaused, setPushAsPaused] = useState(true);
  const [review, setReview] = useState<Proposal | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ads_change_proposals")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast({ title: "Kunde inte hämta förslag", description: error.message, variant: "destructive" });
    else setProposals((data || []) as Proposal[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`proposals:${projectId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ads_change_proposals", filter: `project_id=eq.${projectId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [projectId]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { review: 0, approved: 0, queued: 0, pushed: 0, failed: 0, rejected: 0, all: proposals.length };
    for (const p of proposals) c[BUCKET_FOR[isStatus(p.status)]]++;
    return c;
  }, [proposals]);

  const visible = useMemo(() => {
    if (bucket === "all") return proposals;
    return proposals.filter((p) => BUCKET_FOR[isStatus(p.status)] === bucket);
  }, [proposals, bucket]);

  const visibleIds = visible.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = () => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const setStatus = async (id: string, status: Status, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("ads_change_proposals").update({ status, ...extra }).eq("id", id);
    if (error) toast({ title: "Kunde inte uppdatera", description: error.message, variant: "destructive" });
  };

  const buildProposals = async () => {
    if (!projectId) return;
    setBuilding(true);
    const { data, error } = await supabase.functions.invoke("ads-build-proposals", { body: { project_id: projectId } });
    setBuilding(false);
    if (error) {
      toast({ title: "Kunde inte bygga förslag", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Förslag uppdaterade",
      description: `${data?.created?.total ?? 0} nya (diagnos: ${data?.created?.from_diagnosis ?? 0}, RSA: ${data?.created?.from_rsa_drafts ?? 0})`,
    });
    await load();
  };

  const pushOne = async (p: Proposal) => {
    if (!projectId) return;
    if (p.action_type === "create_rsa_pending_adgroup") {
      toast({ title: "Välj annonsgrupp först", description: "Den här typen kräver mål-annonsgrupp innan push.", variant: "destructive" });
      return;
    }
    setPushing((cur) => new Set(cur).add(p.id));
    // Köad — synligt direkt
    await setStatus(p.id, "queued", { error_message: null });
    try {
      const { data, error } = await supabase.functions.invoke("ads-mutate", {
        body: {
          project_id: projectId,
          action_type: p.action_type,
          payload: { ...(p.payload || {}), status: pushAsPaused ? "PAUSED" : "ENABLED" },
          proposal_id: p.id,
          push_as_paused: pushAsPaused,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Okänt fel");
      await setStatus(p.id, "pushed", {
        pushed_at: new Date().toISOString(),
        mutation_id: (data as any)?.mutation_id ?? null,
        push_as_paused: pushAsPaused,
      });
    } catch (e: any) {
      await setStatus(p.id, "failed", { error_message: String(e?.message || e).slice(0, 500) });
      toast({ title: "Push misslyckades", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setPushing((cur) => { const n = new Set(cur); n.delete(p.id); return n; });
    }
  };

  const bulkApprove = async () => {
    const targets = proposals.filter((p) => selected.has(p.id) && p.status === "draft");
    if (!targets.length) return;
    await Promise.all(targets.map((p) => setStatus(p.id, "approved")));
    toast({ title: `Godkänt ${targets.length} förslag` });
    setSelected(new Set());
    load();
  };
  const bulkReject = async () => {
    const targets = proposals.filter((p) => selected.has(p.id) && (p.status === "draft" || p.status === "approved"));
    if (!targets.length) return;
    await Promise.all(targets.map((p) => setStatus(p.id, "rejected", { rejected_at: new Date().toISOString() })));
    toast({ title: `Avvisade ${targets.length} förslag` });
    setSelected(new Set());
    load();
  };
  const bulkPush = async () => {
    const targets = proposals.filter((p) => selected.has(p.id) && (p.status === "approved" || p.status === "failed"));
    if (!targets.length) {
      toast({ title: "Inga köbara förslag valda", description: "Endast godkända (eller misslyckade) kan pushas.", variant: "destructive" });
      return;
    }
    toast({ title: `Köar ${targets.length} push-jobb` });
    // Sekventiellt så vi inte slår taklimit på Google Ads
    for (const p of targets) {
      // eslint-disable-next-line no-await-in-loop
      await pushOne(p);
    }
    setSelected(new Set());
  };

  if (!projectId) return <Skeleton className="h-64 w-full rounded-lg" />;

  const exportCsv = () => {
    const rows = (selected.size ? proposals.filter((p) => selected.has(p.id)) : proposals).map((p) => ({
      created_at: p.created_at, pushed_at: p.pushed_at ?? "", status: p.status, source: p.source,
      action_type: p.action_type, scope: p.scope_label ?? "", rule_id: p.rule_id ?? "",
      estimated_impact_sek: p.estimated_impact_sek ?? "", rationale: p.rationale ?? "",
      keyword: (p.payload as any)?.keyword ?? (p.payload as any)?.text ?? "",
      match_type: (p.payload as any)?.match_type ?? "",
      campaign_id: (p.payload as any)?.campaign_id ?? "",
      ad_group_id: (p.payload as any)?.ad_group_id ?? "",
      criterion_id: (p.payload as any)?.criterion_id ?? "",
      ad_id: (p.payload as any)?.ad_id ?? "",
      push_as_paused: p.push_as_paused, mutation_id: p.mutation_id ?? "",
      error_message: p.error_message ?? "", payload_json: p.payload,
    }));
    downloadCsv(`forslag-${ymd()}.csv`, toCsv(rows));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Förslag på ändringar
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Granska AI-genererade ändringar, godkänn dem och pusha till Google Ads.
              Pushas som <span className="text-foreground font-medium">PAUSED</span> by default — du aktiverar manuellt i kontot för säkerhet.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Switch id="pap" checked={pushAsPaused} onCheckedChange={setPushAsPaused} />
              <Label htmlFor="pap" className="text-xs cursor-pointer flex items-center gap-1.5">
                <PauseCircle className="h-3.5 w-3.5 text-yellow-500" />
                Pusha som PAUSED (rekommenderas)
              </Label>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Uppdatera
            </Button>
            <Button variant="outline" size="sm" disabled={!proposals.length} onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Exportera CSV
            </Button>
            <Button size="sm" onClick={buildProposals} disabled={building}>
              {building ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Bygg nya förslag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status pipeline */}
      <Tabs value={bucket} onValueChange={(v) => { setBucket(v as Bucket); setSelected(new Set()); }}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <BTab v="review" cur={bucket} label="Att granska" count={counts.review} />
          <BTab v="approved" cur={bucket} label="Godkända" count={counts.approved} />
          <BTab v="queued" cur={bucket} label="I kö" count={counts.queued} accent="yellow" />
          <BTab v="pushed" cur={bucket} label="Pushade" count={counts.pushed} accent="emerald" />
          <BTab v="failed" cur={bucket} label="Misslyckade" count={counts.failed} accent="destructive" />
          <BTab v="rejected" cur={bucket} label="Avvisade" count={counts.rejected} />
          <BTab v="all" cur={bucket} label="Alla" count={counts.all} />
        </TabsList>
      </Tabs>

      {/* Bulk actions */}
      {visible.length > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="all-sel" />
              <Label htmlFor="all-sel" className="text-xs cursor-pointer">
                Markera alla i vy ({visible.length})
              </Label>
              {selected.size > 0 && <span className="text-xs text-muted-foreground">· {selected.size} valda</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={!selected.size} onClick={bulkReject}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Avvisa
              </Button>
              <Button variant="outline" size="sm" disabled={!selected.size} onClick={bulkApprove}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Godkänn
              </Button>
              <Button size="sm" disabled={!selected.size || pushing.size > 0} onClick={bulkPush}>
                <Send className="h-3.5 w-3.5 mr-1" /> Pusha {pushAsPaused ? "pausat" : "aktivt"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {bucket === "review"
                ? <>Inget att granska just nu. Klicka <span className="text-foreground font-medium">"Bygg nya förslag"</span> för att generera från senaste diagnos.</>
                : <>Inga förslag i denna status.</>}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => {
            const st = isStatus(p.status);
            const StatusIcon = STATUS_ICON[st];
            const inFlight = pushing.has(p.id) || st === "queued";
            return (
              <Card key={p.id} className={selected.has(p.id) ? "ring-1 ring-primary/40" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                      className="mt-1"
                      disabled={st === "pushed" || st === "rejected"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={STATUS_TONE[st]}>
                          <StatusIcon className={`h-3 w-3 mr-1 ${st === "queued" ? "animate-pulse" : ""}`} />
                          {STATUS_LABEL[st]}
                        </Badge>
                        <span className="text-sm font-medium">{actionLabel(p.action_type)}</span>
                        {p.scope_label && <span className="text-xs text-muted-foreground truncate">› {p.scope_label}</span>}
                        {p.rule_id && <Badge variant="outline" className="text-[10px] font-mono">{p.rule_id}</Badge>}
                      </div>
                      {p.rationale && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{p.rationale}</p>}
                      {p.estimated_impact_sek != null && p.estimated_impact_sek > 0 && (
                        <p className="text-xs mt-1.5">
                          Förväntat värde: <span className="font-mono text-primary">{p.estimated_impact_sek.toLocaleString("sv-SE")} kr</span>
                        </p>
                      )}
                      {p.error_message && (
                        <div className="mt-2 text-xs text-destructive flex items-start gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="break-words">{p.error_message}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setReview(p)} title="Granska detaljer">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {st === "draft" && (
                        <>
                          <Button variant="outline" size="sm"
                            onClick={() => setStatus(p.id, "rejected", { rejected_at: new Date().toISOString() })}>
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Avvisa
                          </Button>
                          <Button size="sm" onClick={() => setStatus(p.id, "approved")}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Godkänn
                          </Button>
                        </>
                      )}
                      {st === "approved" && (
                        <Button size="sm" onClick={() => pushOne(p)} disabled={inFlight}>
                          {inFlight
                            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            : <Send className="h-3.5 w-3.5 mr-1" />}
                          Pusha {pushAsPaused ? "pausat" : "aktivt"}
                        </Button>
                      )}
                      {st === "queued" && (
                        <span className="text-xs text-yellow-500 flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Skickar…
                        </span>
                      )}
                      {st === "failed" && (
                        <Button variant="outline" size="sm"
                          onClick={() => setStatus(p.id, "approved", { error_message: null })}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Försök igen
                        </Button>
                      )}
                      {st === "pushed" && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReviewDrawer
        proposal={review}
        onClose={() => setReview(null)}
        onApprove={async () => { if (review) { await setStatus(review.id, "approved"); setReview(null); } }}
        onReject={async () => { if (review) { await setStatus(review.id, "rejected", { rejected_at: new Date().toISOString() }); setReview(null); } }}
        onPush={async () => { if (review) { await pushOne(review); setReview(null); } }}
        pushAsPaused={pushAsPaused}
      />
    </div>
  );
}

function BTab({ v, cur, label, count, accent }: {
  v: Bucket; cur: Bucket; label: string; count: number; accent?: "yellow" | "emerald" | "destructive";
}) {
  const isActive = v === cur;
  const tone = accent === "yellow" ? "text-yellow-500"
    : accent === "emerald" ? "text-emerald-500"
    : accent === "destructive" ? "text-destructive" : "";
  return (
    <TabsTrigger value={v} className="gap-1.5 text-xs">
      {label}
      <span className={`font-mono text-[10px] ${isActive ? "" : tone}`}>{count}</span>
    </TabsTrigger>
  );
}

function ReviewDrawer({
  proposal, onClose, onApprove, onReject, onPush, pushAsPaused,
}: {
  proposal: Proposal | null; onClose: () => void;
  onApprove: () => void; onReject: () => void; onPush: () => void; pushAsPaused: boolean;
}) {
  const open = !!proposal;
  const p = proposal;
  if (!p) return <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}><SheetContent /></Sheet>;
  const st = isStatus(p.status);
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> {actionLabel(p.action_type)}
          </SheetTitle>
          <SheetDescription>
            {p.scope_label || "—"} · skapad {new Date(p.created_at).toLocaleString("sv-SE")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
            {p.rule_id && <Badge variant="outline" className="text-[10px] font-mono">{p.rule_id}</Badge>}
            <Badge variant="outline" className="text-[10px]">Källa: {p.source}</Badge>
          </div>

          {p.rationale && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Motivering</div>
              <p className="text-xs leading-relaxed">{p.rationale}</p>
            </div>
          )}

          {p.estimated_impact_sek != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Förväntat värde</div>
              <div className="font-mono text-lg text-primary">{p.estimated_impact_sek.toLocaleString("sv-SE")} kr</div>
            </div>
          )}

          {p.error_message && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-xs text-destructive">
              <div className="font-medium mb-1 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Senaste fel</div>
              <div className="break-words">{p.error_message}</div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payload som skickas</div>
            <pre className="bg-muted/30 border rounded-md p-2 max-h-64 overflow-auto text-[10px] font-mono whitespace-pre-wrap break-words">
              {JSON.stringify({ ...(p.payload || {}), status: pushAsPaused ? "PAUSED" : "ENABLED" }, null, 2)}
            </pre>
          </div>

          {p.diff && Object.keys(p.diff || {}).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Diff</div>
              <pre className="bg-muted/30 border rounded-md p-2 max-h-48 overflow-auto text-[10px] font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(p.diff, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            {(st === "draft" || st === "approved") && (
              <Button variant="outline" size="sm" onClick={onReject}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Avvisa
              </Button>
            )}
            {st === "draft" && (
              <Button size="sm" onClick={onApprove}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Godkänn
              </Button>
            )}
            {(st === "approved" || st === "failed") && (
              <Button size="sm" onClick={onPush}>
                <Send className="h-3.5 w-3.5 mr-1" /> Pusha {pushAsPaused ? "pausat" : "aktivt"}
              </Button>
            )}
            {st === "pushed" && (
              <span className="text-xs text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pushat — aktivera manuellt i Google Ads.
              </span>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
