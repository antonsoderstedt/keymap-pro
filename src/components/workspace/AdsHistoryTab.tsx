// AdsHistoryTab — historik över alla proposal-pushar + auditlogg över mutationer.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  History, RefreshCw, CheckCircle2, XCircle, Clock, Undo2, Search, FileCode2, GitPullRequest, Filter,
} from "lucide-react";

interface Proposal {
  id: string;
  created_at: string;
  pushed_at: string | null;
  rejected_at: string | null;
  status: string;
  source: string;
  action_type: string;
  scope_label: string | null;
  rationale: string | null;
  rule_id: string | null;
  estimated_impact_sek: number | null;
  error_message: string | null;
  mutation_id: string | null;
  payload: any;
  diff: any;
}

interface Mutation {
  id: string;
  created_at: string;
  updated_at: string;
  reverted_at: string | null;
  status: string;
  action_type: string;
  customer_id: string | null;
  payload: any;
  response: any;
  revert_payload: any;
  error_message: string | null;
  source_action_item_id: string | null;
  created_by: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  pause_keyword: "Pausa sökord",
  add_negative_keyword: "Lägg till negativt sökord",
  pause_ad: "Pausa annons",
  create_rsa: "Skapa RSA-annons",
  create_ad_group: "Skapa annonsgrupp",
  add_keyword: "Lägg till sökord",
};

const fmtDateTime = (s: string | null) => s ? new Date(s).toLocaleString("sv-SE") : "—";
const fmtSek = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v).toLocaleString("sv-SE")} kr`;

function statusBadge(status: string, error?: string | null) {
  switch (status) {
    case "pushed":
    case "applied":
    case "success":
      return { tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40", label: "Lyckades", icon: CheckCircle2 };
    case "failed":
    case "error":
      return { tone: "bg-destructive/15 text-destructive border-destructive/40", label: "Misslyckades", icon: XCircle };
    case "pushing":
    case "pending":
    case "queued":
      return { tone: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40", label: "Väntar", icon: Clock };
    case "reverted":
      return { tone: "bg-muted text-muted-foreground border-border", label: "Återställd", icon: Undo2 };
    case "rejected":
      return { tone: "bg-muted text-muted-foreground border-border", label: "Avvisad", icon: XCircle };
    case "draft":
      return { tone: "bg-muted/40 text-muted-foreground border-border", label: "Utkast", icon: GitPullRequest };
    default:
      return { tone: "bg-muted text-muted-foreground border-border", label: status, icon: Clock };
  }
}

export function AdsHistoryTab({ projectId }: { projectId: string | null }) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pushed" | "failed" | "pending" | "reverted">("all");
  const [sub, setSub] = useState<"proposals" | "mutations">("proposals");
  const [details, setDetails] = useState<{ kind: "proposal" | "mutation"; data: Proposal | Mutation } | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const [pRes, mRes] = await Promise.all([
      supabase
        .from("ads_change_proposals")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("ads_mutations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setLoading(false);
    if (pRes.error) toast({ title: "Kunde inte hämta förslag", description: pRes.error.message, variant: "destructive" });
    else setProposals((pRes.data || []) as Proposal[]);
    if (mRes.error) toast({ title: "Kunde inte hämta mutationer", description: mRes.error.message, variant: "destructive" });
    else setMutations((mRes.data || []) as Mutation[]);
  };

  useEffect(() => {
    load();
    if (!projectId) return;
    const ch = supabase
      .channel(`ads-history-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_change_proposals", filter: `project_id=eq.${projectId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_mutations", filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [projectId]);

  const filteredProposals = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== "all") {
        const map: Record<string, string[]> = {
          pushed: ["pushed", "applied", "success"],
          failed: ["failed", "error"],
          pending: ["pushing", "pending", "queued", "draft"],
          reverted: ["reverted", "rejected"],
        };
        if (!map[statusFilter].includes(p.status)) return false;
      }
      if (!q) return true;
      return [p.action_type, p.scope_label, p.rationale, p.rule_id, p.source]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [proposals, filter, statusFilter]);

  const filteredMutations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return mutations.filter((m) => {
      if (statusFilter !== "all") {
        const map: Record<string, string[]> = {
          pushed: ["success", "applied"],
          failed: ["failed", "error"],
          pending: ["pending", "pushing", "queued"],
          reverted: ["reverted"],
        };
        if (!map[statusFilter].includes(m.status)) return false;
      }
      if (!q) return true;
      return [m.action_type, m.customer_id, m.error_message, JSON.stringify(m.payload || {})]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [mutations, filter, statusFilter]);

  const counts = useMemo(() => {
    const arr = sub === "proposals" ? proposals.map((p) => p.status) : mutations.map((m) => m.status);
    const c = { pushed: 0, failed: 0, pending: 0, reverted: 0 };
    for (const s of arr) {
      if (["pushed", "applied", "success"].includes(s)) c.pushed++;
      else if (["failed", "error"].includes(s)) c.failed++;
      else if (["reverted", "rejected"].includes(s)) c.reverted++;
      else c.pending++;
    }
    return c;
  }, [sub, proposals, mutations]);

  const revert = async (mutationId: string) => {
    if (!confirm("Återställ denna mutation i Google Ads?")) return;
    setReverting(mutationId);
    const { error } = await supabase.functions.invoke("ads-revert-mutation", {
      body: { mutation_id: mutationId },
    });
    setReverting(null);
    if (error) {
      toast({ title: "Kunde inte återställa", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Återställd", description: "Mutationen rullades tillbaka." });
    load();
  };

  if (!projectId) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-lg flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Historik & auditlogg
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alla pushade förslag och deras motsvarande Google Ads-mutationer — för spårbarhet och återställning.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Uppdatera
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatusCard label="Lyckades" count={counts.pushed} icon={CheckCircle2} tone="text-emerald-500" />
        <StatusCard label="Väntar" count={counts.pending} icon={Clock} tone="text-yellow-500" />
        <StatusCard label="Misslyckades" count={counts.failed} icon={XCircle} tone="text-destructive" />
        <StatusCard label="Återställd/Avvisad" count={counts.reverted} icon={Undo2} tone="text-muted-foreground" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Tabs value={sub} onValueChange={(v) => setSub(v as any)}>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <TabsList>
                <TabsTrigger value="proposals" className="gap-1.5">
                  <GitPullRequest className="h-3.5 w-3.5" /> Pushade förslag ({proposals.length})
                </TabsTrigger>
                <TabsTrigger value="mutations" className="gap-1.5">
                  <FileCode2 className="h-3.5 w-3.5" /> Auditlogg ({mutations.length})
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2 flex-1 min-w-[260px] justify-end">
                <div className="relative max-w-xs flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Sök action, scope, fel…"
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {(["all", "pushed", "pending", "failed", "reverted"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider ${
                        statusFilter === s ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      {s === "all" ? "Alla" : s === "pushed" ? "Lyckades" : s === "pending" ? "Väntar" : s === "failed" ? "Fel" : "Reverterat"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <TabsContent value="proposals" className="mt-3">
              {loading ? (
                <Skeletons />
              ) : filteredProposals.length === 0 ? (
                <Empty text="Inga förslag matchar filtret." />
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1 border-b">
                    <div className="col-span-2">Datum</div>
                    <div className="col-span-3">Action</div>
                    <div className="col-span-3">Scope</div>
                    <div className="col-span-1 text-right">Estim.</div>
                    <div className="col-span-1">Källa</div>
                    <div className="col-span-2 text-right">Status</div>
                  </div>
                  {filteredProposals.map((p) => {
                    const s = statusBadge(p.status, p.error_message);
                    const Icon = s.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDetails({ kind: "proposal", data: p })}
                        className="w-full grid grid-cols-12 gap-2 items-center px-2 py-1.5 text-xs rounded text-left hover:bg-muted/30"
                      >
                        <div className="col-span-2 text-muted-foreground tabular-nums text-[11px]">
                          {fmtDateTime(p.pushed_at || p.created_at)}
                        </div>
                        <div className="col-span-3 truncate font-medium">{ACTION_LABEL[p.action_type] || p.action_type}</div>
                        <div className="col-span-3 truncate text-muted-foreground">{p.scope_label || "—"}</div>
                        <div className="col-span-1 text-right font-mono tabular-nums">{fmtSek(p.estimated_impact_sek)}</div>
                        <div className="col-span-1 truncate text-[10px] uppercase tracking-wider text-muted-foreground">{p.source}</div>
                        <div className="col-span-2 flex justify-end">
                          <Badge variant="outline" className={s.tone}>
                            <Icon className="h-3 w-3 mr-1" /> {s.label}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="mutations" className="mt-3">
              {loading ? (
                <Skeletons />
              ) : filteredMutations.length === 0 ? (
                <Empty text="Inga mutationer matchar filtret." />
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1 border-b">
                    <div className="col-span-2">Datum</div>
                    <div className="col-span-3">Action</div>
                    <div className="col-span-2">Customer</div>
                    <div className="col-span-3">Detaljer / fel</div>
                    <div className="col-span-2 text-right">Status</div>
                  </div>
                  {filteredMutations.map((m) => {
                    const s = statusBadge(m.reverted_at ? "reverted" : m.status, m.error_message);
                    const Icon = s.icon;
                    const detail = m.error_message
                      || (m.payload?.criterion_id && `criterion ${m.payload.criterion_id}`)
                      || (m.payload?.keyword && `"${m.payload.keyword}"`)
                      || (m.payload?.ad_id && `ad ${m.payload.ad_id}`)
                      || "";
                    const canRevert = (m.status === "success" || m.status === "applied") && !m.reverted_at && !!m.revert_payload;
                    return (
                      <div
                        key={m.id}
                        className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 text-xs rounded hover:bg-muted/30"
                      >
                        <div className="col-span-2 text-muted-foreground tabular-nums text-[11px]">{fmtDateTime(m.created_at)}</div>
                        <div className="col-span-3 truncate font-medium">{ACTION_LABEL[m.action_type] || m.action_type}</div>
                        <div className="col-span-2 truncate font-mono text-[11px] text-muted-foreground">{m.customer_id || "—"}</div>
                        <div className="col-span-3 truncate text-[11px] text-muted-foreground">{detail || "—"}</div>
                        <div className="col-span-2 flex justify-end items-center gap-1">
                          <Badge variant="outline" className={s.tone}>
                            <Icon className="h-3 w-3 mr-1" /> {s.label}
                          </Badge>
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2"
                            onClick={() => setDetails({ kind: "mutation", data: m })}
                            title="Visa payload"
                          >
                            <FileCode2 className="h-3 w-3" />
                          </Button>
                          {canRevert && (
                            <Button
                              size="sm" variant="ghost" className="h-6 px-2 text-destructive"
                              disabled={reverting === m.id}
                              onClick={() => revert(m.id)}
                              title="Återställ mutation"
                            >
                              <Undo2 className={`h-3 w-3 ${reverting === m.id ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <DetailsDrawer details={details} onClose={() => setDetails(null)} />
    </div>
  );
}

function Skeletons() {
  return <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{text}</p>;
}

function StatusCard({ label, count, icon: Icon, tone }: { label: string; count: number; icon: any; tone: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-mono text-2xl tabular-nums">{count}</div>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </CardContent>
    </Card>
  );
}

function DetailsDrawer({
  details, onClose,
}: { details: { kind: "proposal" | "mutation"; data: any } | null; onClose: () => void }) {
  const open = !!details;
  const isProp = details?.kind === "proposal";
  const d: any = details?.data;
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">
            {isProp ? "Förslag" : "Mutation"} · {d ? (ACTION_LABEL[d.action_type] || d.action_type) : ""}
          </SheetTitle>
          <SheetDescription>
            {d && (
              <>
                Skapad {fmtDateTime(d.created_at)}
                {isProp && d.pushed_at && <> · Pushad {fmtDateTime(d.pushed_at)}</>}
                {!isProp && d.reverted_at && <> · Reverterad {fmtDateTime(d.reverted_at)}</>}
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        {d && (
          <div className="mt-4 space-y-4 text-xs">
            <Field label="Status" value={d.status} />
            {isProp && <Field label="Källa / regel" value={`${d.source}${d.rule_id ? ` · ${d.rule_id}` : ""}`} />}
            {isProp && d.scope_label && <Field label="Scope" value={d.scope_label} />}
            {isProp && d.rationale && <Field label="Motivering" value={d.rationale} />}
            {!isProp && d.customer_id && <Field label="Customer ID" value={d.customer_id} />}
            {d.error_message && <Field label="Felmeddelande" value={d.error_message} tone="text-destructive" />}
            <Json title="Payload" data={d.payload} />
            {isProp && d.diff && Object.keys(d.diff || {}).length > 0 && <Json title="Diff" data={d.diff} />}
            {!isProp && d.response && <Json title="Google Ads response" data={d.response} />}
            {!isProp && d.revert_payload && <Json title="Revert payload" data={d.revert_payload} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono break-words ${tone || ""}`}>{value}</div>
    </div>
  );
}

function Json({ title, data }: { title: string; data: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <pre className="bg-muted/30 border rounded-md p-2 max-h-72 overflow-auto text-[10px] font-mono whitespace-pre-wrap break-words">
        {JSON.stringify(data ?? {}, null, 2)}
      </pre>
    </div>
  );
}
