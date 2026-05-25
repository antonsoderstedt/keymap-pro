import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useActionItems } from "@/hooks/useActionItems";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, ShieldCheck, GitPullRequest } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mergeIntoPipeline,
  countByStage,
  categoryLabel,
  STAGE_LABEL,
  groupItemsBy,
  sumImpact,
  groupKeyLabel,
  type AdsProposalRow,
  type PipelineItem,
  type PipelineStage,
  type GroupKey,
} from "@/lib/actionsPipeline";
import AdsAudit from "./AdsAudit";
import AdsAuditPlan from "./AdsAuditPlan";
import { ProposalsTab } from "@/components/workspace/ProposalsTab";
import { ContextSheet } from "@/components/context";

type Origin = "all" | "action" | "ads_proposal";
const ORIGIN_LABEL: Record<Origin, string> = {
  all: "Alla",
  action: "Manuella",
  ads_proposal: "Förslag",
};

const STAGES: PipelineStage[] = ["proposed", "approved", "implemented", "measured"];


function formatImpact(n: number | null): string | null {
  if (!n) return null;
  return `+${n.toLocaleString("sv-SE")} kr/mån`;
}

export default function ActionsPipeline() {
  const { id: projectId = "" } = useParams<{ id: string }>();
  
  const [params, setParams] = useSearchParams();
  const focusId = params.get("focus");

  const { items, loading: itemsLoading, error: itemsError, update, markImplemented, reload } =
    useActionItems(projectId);

  const [proposals, setProposals] = useState<AdsProposalRow[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>("proposed");
  const [origin, setOrigin] = useState<Origin>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [viewProposal, setViewProposal] = useState<PipelineItem | null>(null);
  const [viewContext, setViewContext] = useState<PipelineItem | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const caps = useProjectCapabilities(projectId || null);

  // Group-by (URL-bound) + selection state for bulk actions
  const groupByParam = params.get("groupBy");
  const groupBy: "none" | GroupKey =
    groupByParam === "rule_id" || groupByParam === "action_type" ? groupByParam : "none";
  const setGroupBy = (g: "none" | GroupKey) => {
    const next = new URLSearchParams(params);
    if (g === "none") next.delete("groupBy");
    else next.set("groupBy", g);
    setParams(next, { replace: true });
    setSelected(new Set());
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [confirmLargeBatch, setConfirmLargeBatch] = useState<null | "approve" | "push" | "reject">(null);

  const cameFromToday = params.get("from") === "today" || !!focusId;

  const loadProposals = async () => {
    if (!projectId) return;
    setProposalsLoading(true);
    setProposalsError(null);
    const { data, error } = await supabase
      .from("ads_change_proposals")
      .select(
        "id,source,action_type,scope_label,payload,estimated_impact_sek,rationale,status,error_message,created_at,rule_id",
      )
      .eq("project_id", projectId)
      .order("estimated_impact_sek", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setProposalsError(error.message);
    setProposals((data as AdsProposalRow[]) ?? []);
    setProposalsLoading(false);
  };

  useEffect(() => {
    loadProposals();
    if (!projectId) return;
    const channel = supabase
      .channel(`pipeline_proposals:${projectId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ads_change_proposals", filter: `project_id=eq.${projectId}` },
        () => loadProposals(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const pipeline = useMemo(() => mergeIntoPipeline(items, proposals), [items, proposals]);
  const counts = useMemo(() => countByStage(pipeline), [pipeline]);
  const visible = pipeline.filter(
    (p) => p.stage === stage && (origin === "all" || p.origin === origin),
  );

  // Focus handling: scroll + transient ring
  useEffect(() => {
    if (!focusId || pipeline.length === 0) return;
    const item = pipeline.find((p) => p.id === focusId || p.rawId === focusId);
    if (!item) return;
    if (item.stage !== stage) setStage(item.stage);
    const t = setTimeout(() => {
      const el = rowRefs.current[item.id];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-1", "ring-primary/40");
        setTimeout(() => el.classList.remove("ring-1", "ring-primary/40"), 1500);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [focusId, pipeline, stage]);

  // Summary numbers — single line, no widgets
  const openCount = counts.proposed + counts.approved;
  const openValue = pipeline
    .filter((p) => p.stage === "proposed" || p.stage === "approved")
    .reduce((s, p) => s + (p.impactSek ?? 0), 0);
  const implementedValue = pipeline
    .filter((p) => p.stage === "implemented" || p.stage === "measured")
    .reduce((s, p) => s + (p.impactSek ?? 0), 0);

  const approveAction = async (p: PipelineItem) => {
    if (p.origin !== "action") return;
    setPendingId(p.id);
    const { error } = await update(p.rawId, { status: "in_progress" });
    setPendingId(null);
    if (error) toast.error("Kunde inte godkänna åtgärden.");
    else toast.success("Godkänd.");
  };

  const markDone = async (p: PipelineItem) => {
    if (p.origin !== "action") return;
    setPendingId(p.id);
    const { error } = await markImplemented(p.rawId);
    setPendingId(null);
    if (error) toast.error("Kunde inte markera som klar.");
    else toast.success("Markerad som klar.");
  };

  const archive = async (p: PipelineItem) => {
    if (p.origin !== "action") return;
    setPendingId(p.id);
    const { error } = await update(p.rawId, { status: "archived" });
    setPendingId(null);
    if (error) toast.error("Kunde inte avvisa.");
    else toast.success("Avvisad.");
  };

  const pushAds = async (p: PipelineItem) => {
    if (p.origin !== "action" || !p.flags.pushable) return;
    const raw = p.raw as any;
    if (!raw.source_payload) return toast.error("Saknar payload för Ads-push.");
    setPendingId(p.id);
    try {
      const { error } = await supabase.functions.invoke("ads-mutate", {
        body: {
          project_id: projectId,
          source_action_item_id: raw.id,
          ...(raw.source_payload as any),
        },
      });
      if (error) throw error;
      await markImplemented(raw.id);
      toast.success("Pushad till Google Ads.");
      reload();
    } catch (e: any) {
      toast.error(`Push misslyckades: ${e?.message ?? "okänt fel"}`);
    } finally {
      setPendingId(null);
    }
  };

  const openProposal = (p: PipelineItem) => {
    setViewProposal(p);
  };

  const openContext = (p: PipelineItem) => {
    setViewContext(p);
  };

  // ────────────────────────────────────────────────────────────
  // Bulk actions
  // ────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleGroup = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectedItems = useMemo(
    () => pipeline.filter((p) => selected.has(p.id)),
    [pipeline, selected],
  );
  const selectedImpact = sumImpact(selectedItems);

  const runBulk = async (kind: "approve" | "push" | "reject") => {
    if (selectedItems.length === 0) return;
    setBulkRunning(true);
    const toastId = toast.loading(
      `${kind === "approve" ? "Godkänner" : kind === "push" ? "Pushar" : "Avvisar"} 0/${selectedItems.length}…`,
    );
    let done = 0;
    try {
      for (const p of selectedItems) {
        try {
          if (kind === "approve") {
            if (p.origin === "action") {
              await update(p.rawId, { status: "in_progress" });
            } else {
              await supabase
                .from("ads_change_proposals")
                .update({ status: "approved" })
                .eq("id", p.rawId);
            }
          } else if (kind === "reject") {
            if (p.origin === "action") {
              await update(p.rawId, { status: "archived" });
            } else {
              await supabase
                .from("ads_change_proposals")
                .update({ status: "rejected", rejected_at: new Date().toISOString() })
                .eq("id", p.rawId);
            }
          } else if (kind === "push") {
            if (p.origin === "action" && p.flags.pushable) {
              const raw = p.raw as any;
              if (!raw.source_payload) throw new Error("Saknar payload");
              const { error } = await supabase.functions.invoke("ads-mutate", {
                body: { project_id: projectId, source_action_item_id: raw.id, ...(raw.source_payload as any) },
              });
              if (error) throw error;
              await markImplemented(raw.id);
            } else if (p.origin === "ads_proposal") {
              const { error } = await supabase.functions.invoke("ads-mutate", {
                body: { project_id: projectId, proposal_id: p.rawId },
              });
              if (error) throw error;
            }
          }
          done++;
          toast.loading(
            `${kind === "approve" ? "Godkänner" : kind === "push" ? "Pushar" : "Avvisar"} ${done}/${selectedItems.length}…`,
            { id: toastId },
          );
        } catch (e: any) {
          toast.error(`Stoppade på "${p.title}": ${e?.message ?? "okänt fel"}`, { id: toastId });
          setBulkRunning(false);
          await loadProposals();
          reload();
          return;
        }
      }
      toast.success(`Klart — ${done} av ${selectedItems.length}.`, { id: toastId });
      clearSelection();
      await loadProposals();
      reload();
    } finally {
      setBulkRunning(false);
    }
  };

  const requestBulk = (kind: "approve" | "push" | "reject") => {
    if (selectedImpact > 50000) {
      setConfirmLargeBatch(kind);
      return;
    }
    runBulk(kind);
  };

  const loading = itemsLoading || proposalsLoading;
  const error = itemsError || proposalsError;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:py-14">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          {cameFromToday && (
            <Link
              to={`/clients/${projectId}`}
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Tillbaka till Idag
            </Link>
          )}
          <h1 className="text-2xl font-medium tracking-tight">Åtgärder</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {openCount} öppna
            {openValue > 0 && ` · ${openValue.toLocaleString("sv-SE")} kr/mån att hämta`}
            {implementedValue > 0 && ` · ${implementedValue.toLocaleString("sv-SE")} kr/mån implementerat`}
          </p>
        </div>
        {caps.hasAds && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAuditOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Kör Ads-audit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProposalsOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
              Alla förslag
            </Button>
          </div>
        )}
      </header>

      {/* Stage pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STAGES.map((s) => {
          const active = stage === s;
          const muted = s === "measured";
          return (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
                !active && muted && "opacity-60",
              )}
            >
              {STAGE_LABEL[s]}
              <span className={cn("ml-1.5 tabular-nums", active ? "opacity-70" : "opacity-50")}>
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Source filter */}
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Källa:</span>
        {(Object.keys(ORIGIN_LABEL) as Origin[]).map((o) => (
          <button
            key={o}
            onClick={() => setOrigin(o)}
            className={cn(
              "transition-colors hover:text-foreground",
              origin === o ? "text-foreground underline underline-offset-4" : "",
            )}
          >
            {ORIGIN_LABEL[o]}
          </button>
        ))}
      </div>



      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-b border-border/40 py-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Åtgärder kunde inte laddas. Försök igen.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {stage === "proposed" && "Inga åtgärder just nu."}
          {stage === "approved" && "Inga godkända åtgärder väntar."}
          {stage === "implemented" && "Inga implementerade åtgärder ännu."}
          {stage === "measured" && "Inga mätta åtgärder ännu."}
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {visible.map((p) => (
            <Row
              key={p.id}
              item={p}
              pending={pendingId === p.id}
              onApprove={() => approveAction(p)}
              onMarkDone={() => markDone(p)}
              onArchive={() => archive(p)}
              onPushAds={() => pushAds(p)}
              onOpenProposal={() => openProposal(p)}
              onOpenContext={() => openContext(p)}
              registerRef={(el) => (rowRefs.current[p.id] = el)}
            />
          ))}
        </div>
      )}

      <ProposalSheet
        proposal={viewProposal}
        onClose={() => setViewProposal(null)}
      />

      {viewContext && (
        <ContextSheet
          open={!!viewContext}
          onOpenChange={(v) => !v && setViewContext(null)}
          projectId={projectId}
          actionItemId={viewContext.origin === "action" ? viewContext.rawId : undefined}
          adsProposalId={viewContext.origin === "ads_proposal" ? viewContext.rawId : undefined}
          title={viewContext.title}
          subtitle={
            categoryLabel(viewContext.category) +
            (viewContext.impactSek ? ` · ${formatImpact(viewContext.impactSek)}` : "")
          }
        />
      )}

      {/* Ads-audit — situational deep tool, opens inline */}
      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0">
          <SheetHeader className="border-b border-border/40 p-4">
            <SheetTitle className="text-base font-medium">Ads-audit</SheetTitle>
            <SheetDescription className="text-xs">
              Resultatet skapar förslag som hamnar här i Åtgärder.
            </SheetDescription>
          </SheetHeader>
          <Tabs defaultValue="audit" className="p-4">
            <TabsList className="mb-4">
              <TabsTrigger value="audit" className="text-xs">Audit</TabsTrigger>
              <TabsTrigger value="plan" className="text-xs">Plan</TabsTrigger>
            </TabsList>
            <TabsContent value="audit"><AdsAudit /></TabsContent>
            <TabsContent value="plan"><AdsAuditPlan /></TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Alla förslag — avancerad kö (bulk, push, CSV) */}
      <Sheet open={proposalsOpen} onOpenChange={setProposalsOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0">
          <SheetHeader className="border-b border-border/40 p-4">
            <SheetTitle className="text-base font-medium">Alla Ads-förslag</SheetTitle>
            <SheetDescription className="text-xs">
              Avancerad vy för bulk-godkännande och push.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <ProposalsTab projectId={projectId} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProposalSheet({
  proposal,
  onClose,
}: {
  proposal: PipelineItem | null;
  onClose: () => void;
}) {
  if (!proposal) return null;
  const raw = proposal.raw as AdsProposalRow;
  const impact = proposal.impactSek
    ? `+${proposal.impactSek.toLocaleString("sv-SE")} kr/mån`
    : null;

  return (
    <Sheet open={!!proposal} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base font-medium">{proposal.title}</SheetTitle>
          <SheetDescription className="text-xs">
            {categoryLabel(proposal.category)}
            {impact && <span> · {impact}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm">
          {proposal.description && (
            <section>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Motivering
              </p>
              <p className="leading-relaxed text-foreground/90">{proposal.description}</p>
            </section>
          )}

          <section>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Källa
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {raw.source} · {raw.action_type}
            </p>
          </section>

          {raw.scope_label && (
            <section>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Omfattning
              </p>
              <p className="text-xs text-muted-foreground">{raw.scope_label}</p>
            </section>
          )}

          {raw.payload && (
            <section>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Payload
              </p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(raw.payload, null, 2)}
              </pre>
            </section>
          )}

          {raw.error_message && (
            <section>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-destructive">
                Fel
              </p>
              <p className="text-xs text-destructive">{raw.error_message}</p>
            </section>
          )}

          <p className="pt-4 text-[11px] text-muted-foreground">
            Push/godkänn av Ads-förslag sker via befintliga regler i ads-pipelinen.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  item,
  pending,
  onApprove,
  onMarkDone,
  onArchive,
  onPushAds,
  onOpenProposal,
  onOpenContext,
  registerRef,
}: {
  item: PipelineItem;
  pending: boolean;
  onApprove: () => void;
  onMarkDone: () => void;
  onArchive: () => void;
  onPushAds: () => void;
  onOpenProposal: () => void;
  onOpenContext: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const impact = formatImpact(item.impactSek);
  const muted = item.stage === "implemented" || item.stage === "measured";

  return (
    <div
      ref={registerRef}
      className={cn(
        "group flex items-start justify-between gap-6 py-4 transition-colors rounded-md -mx-2 px-2",
        muted && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", muted ? "text-muted-foreground" : "text-foreground")}>
          {item.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {categoryLabel(item.category)}
          {impact && <span> · {impact}</span>}
          {item.flags.queued && <span> · i kö</span>}
          {item.flags.failed && <span className="text-destructive"> · misslyckades</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        {item.origin === "action" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenContext}
            className="text-muted-foreground hover:text-foreground"
          >
            Kontext
          </Button>
        )}
        {item.origin === "action" && item.stage === "proposed" && (
          <>
            {item.flags.pushable ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onPushAds}>
                Pusha
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onApprove}>
                Godkänn
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onArchive}
              className="text-muted-foreground"
            >
              Avvisa
            </Button>
          </>
        )}

        {item.origin === "action" && item.stage === "approved" && (
          <>
            {item.flags.pushable && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onPushAds}>
                Pusha
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={onMarkDone}>
              Markera klar
            </Button>
          </>
        )}

        {item.origin === "ads_proposal" && (
          <Button size="sm" variant="ghost" onClick={onOpenProposal}>
            Visa detaljer
          </Button>
        )}
      </div>
    </div>
  );
}
