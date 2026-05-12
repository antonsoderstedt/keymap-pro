// Förslagskö — listar ads_change_proposals med approve/reject/push-pausat-actions.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, Send, Sparkles, RefreshCw, Inbox, AlertCircle, Loader2,
} from "lucide-react";

interface Proposal {
  id: string;
  source: string;
  action_type: string;
  scope_label: string | null;
  payload: any;
  estimated_impact_sek: number | null;
  rationale: string | null;
  rule_id: string | null;
  status: "draft" | "approved" | "pushed" | "rejected" | "failed";
  push_as_paused: boolean;
  mutation_id: string | null;
  error_message: string | null;
  created_at: string;
  pushed_at: string | null;
}

const STATUS_TONE: Record<Proposal["status"], string> = {
  draft: "bg-muted text-foreground",
  approved: "bg-primary/15 text-primary border-primary/40",
  pushed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  rejected: "bg-muted text-muted-foreground line-through",
  failed: "bg-destructive/15 text-destructive border-destructive/40",
};

const STATUS_LABEL: Record<Proposal["status"], string> = {
  draft: "Utkast", approved: "Godkänt", pushed: "Pushat (pausat)",
  rejected: "Avvisat", failed: "Fel",
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
    create_rsa_pending_adgroup: "Ny RSA (välj annonsgrupp)",
  };
  return map[t] || t;
}

export function ProposalsTab({ projectId }: { projectId: string | null }) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ads_change_proposals")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Kunde inte hämta förslag", description: error.message, variant: "destructive" });
    } else {
      setProposals((data || []) as Proposal[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  // Realtime
  useEffect(() => {
    if (!projectId) return;
    const channelName = `proposals:${projectId}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_change_proposals", filter: `project_id=eq.${projectId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

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

  const setStatus = async (id: string, status: Proposal["status"], extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("ads_change_proposals").update({ status, ...extra }).eq("id", id);
    if (error) toast({ title: "Kunde inte uppdatera", description: error.message, variant: "destructive" });
  };

  const push = async (p: Proposal) => {
    if (!projectId) return;
    if (p.action_type === "create_rsa_pending_adgroup") {
      toast({ title: "Välj annonsgrupp först", description: "Den här typen kräver att du väljer mål-annonsgrupp innan push (kommer i nästa steg).", variant: "destructive" });
      return;
    }
    setPushing(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("ads-mutate", {
        body: { project_id: projectId, action_type: p.action_type, payload: p.payload, proposal_id: p.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Okänt fel");
      await setStatus(p.id, "pushed", { pushed_at: new Date().toISOString(), mutation_id: data?.mutation_id ?? null });
      toast({ title: "Pushat till Google Ads", description: p.scope_label || actionLabel(p.action_type) });
    } catch (e: any) {
      await setStatus(p.id, "failed", { error_message: e.message?.slice(0, 500) });
      toast({ title: "Push misslyckades", description: e.message, variant: "destructive" });
    }
    setPushing(null);
  };

  const drafts = proposals.filter((p) => p.status === "draft");
  const approved = proposals.filter((p) => p.status === "approved");
  const pushed = proposals.filter((p) => p.status === "pushed");

  if (!projectId) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Förslag på ändringar
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-genererade ändringar från diagnosmotorn och RSA-utkast. Godkänn → pusha pausat till Google Ads. Aktivera manuellt i kontot för säkerhet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Uppdatera
            </Button>
            <Button size="sm" onClick={buildProposals} disabled={building}>
              {building ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Bygg nya förslag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-3">
        <CountCard label="Utkast" count={drafts.length} />
        <CountCard label="Godkända" count={approved.length} accent />
        <CountCard label="Pushade" count={pushed.length} success />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : proposals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Inga förslag ännu. Klicka <span className="text-foreground font-medium">"Bygg nya förslag"</span> för att generera från senaste diagnos och RSA-utkast.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      <span className="text-sm font-medium">{actionLabel(p.action_type)}</span>
                      {p.scope_label && <span className="text-xs text-muted-foreground truncate">› {p.scope_label}</span>}
                      {p.rule_id && <Badge variant="outline" className="text-[10px] font-mono">{p.rule_id}</Badge>}
                    </div>
                    {p.rationale && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.rationale}</p>}
                    {p.estimated_impact_sek != null && p.estimated_impact_sek > 0 && (
                      <p className="text-xs mt-1.5">
                        Förväntat värde: <span className="font-mono text-primary">{p.estimated_impact_sek.toLocaleString("sv-SE")} kr</span>
                      </p>
                    )}
                    {p.error_message && (
                      <div className="mt-2 text-xs text-destructive flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{p.error_message}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.status === "draft" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setStatus(p.id, "rejected", { rejected_at: new Date().toISOString() })}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Avvisa
                        </Button>
                        <Button variant="default" size="sm" onClick={() => setStatus(p.id, "approved")}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Godkänn
                        </Button>
                      </>
                    )}
                    {p.status === "approved" && (
                      <Button size="sm" onClick={() => push(p)} disabled={pushing === p.id}>
                        {pushing === p.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                        Pusha pausat
                      </Button>
                    )}
                    {p.status === "failed" && (
                      <Button variant="outline" size="sm" onClick={() => setStatus(p.id, "approved", { error_message: null })}>
                        Försök igen
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CountCard({ label, count, accent, success }: { label: string; count: number; accent?: boolean; success?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-mono text-2xl mt-0.5 ${accent ? "text-primary" : success ? "text-emerald-500" : ""}`}>{count}</div>
      </CardContent>
    </Card>
  );
}
