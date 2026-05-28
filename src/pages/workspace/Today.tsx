/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActionItems } from "@/hooks/useActionItems";
import { useDataSourcesStatus } from "@/hooks/useDataSourcesStatus";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import RoiOverview from "@/components/workspace/RoiOverview";
import { ContextSheet } from "@/components/context";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useDailyPulse } from "@/hooks/useDailyPulse";

// Action source types that map to a real Google Ads mutation. Mirrors
// ADS_PUSHABLE_SOURCES in src/lib/actionsPipeline.ts — kept in sync so Today's
// primary CTA can actually push to Ads when there is a payload to push.
const ADS_PUSHABLE_SOURCES = new Set([
  "ads_wasted",
  "ads_negatives",
  "ads_pacing",
  "ads_rsa",
]);

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "God natt";
  if (h < 10) return "God morgon";
  if (h < 17) return "God dag";
  return "God kväll";
}

function firstName(email: string | null | undefined) {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const part = local.split(/[._-]/)[0] ?? "";
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : "";
}

function categoryLabel(c: string) {
  switch (c) {
    case "seo": return "SEO";
    case "ads": return "Google Ads";
    case "content": return "Innehåll";
    case "technical": return "Teknisk";
    default: return "Övrigt";
  }
}

export default function Today() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, loading, error, update, markImplemented } = useActionItems(workspace?.id);
  const { data: sources } = useDataSourcesStatus(workspace?.id);
  const [contextOpen, setContextOpen] = useState(false);
  const [riskAckActionId, setRiskAckActionId] = useState<string | null>(null);

  const open = useMemo(
    () => items.filter((i) => i.status === "todo" || i.status === "in_progress"),
    [items],
  );
  const primary = open[0] ?? null;
  const secondary = open.slice(1, 3);
  const remaining = Math.max(0, open.length - 1);
  const { signals, dataAge } = useDailyPulse(workspace?.id);

  // "Godkänn" på ett action_item utför ingen mekanisk åtgärd om det inte
  // finns en source_payload kopplad till en pushable källa. Då blir det bara
  // en notering: status → done. Vi gör skillnaden synlig i UI:t så användaren
  // inte tror att en konv-droppe åtgärdas av ett knapptryck.
  const isPushable = !!(
    primary &&
    primary.source_payload &&
    ADS_PUSHABLE_SOURCES.has(primary.source_type ?? "")
  );
  const [pushing, setPushing] = useState(false);

  const sourceIssues = (sources?.sources ?? []).filter((s) => s.status !== "ok");

  const onMarkHandled = async () => {
    if (!primary) return;
    const { error: err } = await markImplemented(primary.id);
    if (err) toast.error("Kunde inte uppdatera åtgärden.");
    else toast.success("Markerad som hanterad.");
  };

  const onPushToAds = async () => {
    if (!primary || !workspace || !isPushable) return;

    const { data: ctx, error: ctxErr } = await (supabase as any)
      .from("decision_context")
      .select("confidence")
      .eq("project_id", workspace.id)
      .eq("action_item_id", primary.id)
      .maybeSingle();

    if (ctxErr && ctxErr.code !== "PGRST116") {
      toast.error(`Kunde inte validera beslutskontext: ${ctxErr.message}`);
      return;
    }

    if (ctx?.confidence) {
      const confidence = ctx.confidence as { value?: number; gate_triggers?: string[] };
      const value = typeof confidence.value === "number" ? confidence.value : 0;
      const gates = confidence.gate_triggers ?? [];
      if (value < 0.4) {
        toast.error("Kan inte skicka: tillförlitlighet är under 40%. Bygg om kontext eller verifiera data först.");
        return;
      }

      const riskFlags: string[] = [];
      if (gates.includes("RC_DC_STALE_SIGNALS")) riskFlags.push("inaktuella signaler");
      if (gates.includes("RC_DC_PRIMARILY_GENERIC_CONTEXT")) riskFlags.push("primärt generell kontext");
      if (riskFlags.length > 0 && riskAckActionId !== primary.id) {
        toast.warning(`Varning: ${riskFlags.join(" + ")}. Klicka Skicka igen för att bekräfta ändå.`);
        setRiskAckActionId(primary.id);
        return;
      }
    }

    setPushing(true);
    try {
      const { error: invokeErr } = await supabase.functions.invoke("ads-mutate", {
        body: {
          project_id: workspace.id,
          source_action_item_id: primary.id,
          ...(primary.source_payload as Record<string, unknown>),
        },
      });
      if (invokeErr) throw invokeErr;
      await markImplemented(primary.id);
      setRiskAckActionId(null);
      toast.success("Skickad till Google Ads (pausat läge). Granska och aktivera i Ads när du är redo.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "okänt fel";
      toast.error(`Skickning misslyckades: ${msg}`);
    } finally {
      setPushing(false);
    }
  };

  const onDefer = async () => {
    if (!primary) return;
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const { error: err } = await update(primary.id, { due_date: due.toISOString() });
    if (err) toast.error("Kunde inte skjuta upp åtgärden.");
    else {
      const human = due.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
      toast.success(`Skjuten till ${human}.`);
    }
  };

  const onOpen = () => {
    if (!primary || !workspace) return;
    navigate(`/clients/${workspace.id}/actions?focus=a:${primary.id}&from=today`);
  };

  const name = firstName(user?.email);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
      <header className="mb-10">
        <p className="text-sm text-muted-foreground">
          {greeting()}{name ? `, ${name}` : ""}.
        </p>
        {workspace && (
          <p className="text-sm text-muted-foreground/70">{workspace.name}</p>
        )}
      </header>

      <section aria-labelledby="next-action">
        <div className="mb-5 flex flex-wrap gap-2">
          {signals.slice(0, 4).map((signal) => (
            <span
              key={signal.label}
              className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-[11px]"
            >
              <span className="text-muted-foreground">{signal.label}</span>
              <span
                className={cn(
                  "ml-1.5 font-medium",
                  signal.direction === "up" && "text-emerald-600",
                  signal.direction === "down" && "text-rose-600",
                  signal.direction === "flat" && "text-muted-foreground",
                )}
              >
                {signal.direction !== "down" && signal.direction !== "flat" && signal.label !== "Ads hälsa" ? "+" : ""}
                {signal.value}
              </span>
            </span>
          ))}
        </div>

        <p
          id="next-action"
          className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Din prioriterade åtgärd
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-3">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Åtgärder kunde inte laddas. Försök igen.
          </p>
        ) : !primary ? (
          <div className="space-y-2">
            <h2 className="text-xl font-medium tracking-tight">
              Inga åtgärder just nu.
            </h2>
            <p className="text-sm text-muted-foreground">
              Kör en analys för att hitta nya möjligheter.{" "}
              {workspace && (
                <button
                  onClick={() => navigate(`/clients/${workspace.id}/actions`)}
                  className="underline-offset-4 hover:underline text-foreground"
                >
                  Öppna åtgärder
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight leading-snug">
              {primary.title}
            </h2>
            {primary.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {primary.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {primary.expected_impact_sek
                ? `+${primary.expected_impact_sek.toLocaleString("sv-SE")} kr/mån · `
                : ""}
              {categoryLabel(primary.category)}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              {isPushable ? (
                <Button size="sm" onClick={onPushToAds} disabled={pushing}>
                  {pushing ? "Skickar…" : "Skicka till Google Ads"}
                </Button>
              ) : (
                <Button size="sm" onClick={onMarkHandled}>
                  Markera som gjord
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onDefer}>
                Skjut upp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setContextOpen(true)}>
                Varför denna åtgärd?
              </Button>
              <Button size="sm" variant="ghost" onClick={onOpen}>
                Visa i åtgärder
              </Button>
            </div>
            {!isPushable && (
              <p className="text-[11px] text-muted-foreground/80 pt-1">
                Den här åtgärden kräver manuellt arbete. Knappen markerar bara att du har gjort åtgärden —
                ingen automatisk ändring skickas.
              </p>
            )}
            {isPushable && (
              <p className="text-[11px] text-muted-foreground/80 pt-1">
                Skickas i pausat läge för säkerhet. Du granskar och aktiverar i Google Ads när du är redo.
              </p>
            )}

            {secondary.length > 0 && (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                {secondary.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => workspace && navigate(`/clients/${workspace.id}/actions?focus=a:${action.id}&from=today`)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-muted/40"
                  >
                    <span className="line-clamp-1 text-sm">{action.title}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                      {action.expected_impact_sek
                        ? `+${action.expected_impact_sek.toLocaleString("sv-SE")} kr/mån`
                        : categoryLabel(action.category)}
                    </span>
                  </button>
                ))}
                {workspace && (
                  <button
                    onClick={() => navigate(`/clients/${workspace.id}/actions`)}
                    className="inline-flex items-center gap-1 pl-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Visa alla {open.length} åtgärder <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {primary && workspace && (
        <ContextSheet
          open={contextOpen}
          onOpenChange={setContextOpen}
          projectId={workspace.id}
          actionItemId={primary.id}
          title={primary.title}
          subtitle={
            (primary.expected_impact_sek
              ? `+${primary.expected_impact_sek.toLocaleString("sv-SE")} kr/mån · `
              : "") + categoryLabel(primary.category)
          }
          actions={[
            isPushable
              ? {
                  id: "push",
                  label: pushing ? "Skickar…" : "Skicka till Google Ads",
                  onClick: async () => { setContextOpen(false); await onPushToAds(); },
                  variant: "primary" as const,
                  disabled: pushing,
                }
              : {
                  id: "mark-handled",
                  label: "Markera som gjord",
                  onClick: async () => { setContextOpen(false); await onMarkHandled(); },
                  variant: "primary" as const,
                },
            { id: "defer", label: "Skjut upp", onClick: async () => { setContextOpen(false); await onDefer(); } },
            { id: "open", label: "Visa i åtgärder", onClick: () => { setContextOpen(false); onOpen(); }, variant: "ghost" },
          ]}
        />
      )}

      {workspace && !loading && (
        <div className="mt-16">
          <RoiOverview projectId={workspace.id} />
        </div>
      )}

      {(remaining > 0 || sourceIssues.length > 0 || dataAge.gsc_days != null || dataAge.ads_days != null) && (
        <footer className="mt-12 space-y-2 border-t border-border/40 pt-6 text-xs text-muted-foreground">
          <p>
            {open.length} åtgärder
            {dataAge.gsc_days != null ? ` · GSC ${dataAge.gsc_days}d` : ""}
            {dataAge.ga4_days != null ? ` · GA4 ${dataAge.ga4_days}d` : ""}
            {dataAge.ads_days != null ? ` · Ads ${dataAge.ads_days}d` : ""}
            {sourceIssues.length > 0 ? ` · ${sourceIssues.length} datakällor kräver åtgärd` : ""}
            {workspace && sourceIssues.length > 0 ? (
              <button
                onClick={() => navigate(`/clients/${workspace.id}/settings`)}
                className="ml-1 underline-offset-4 hover:underline"
              >
                Uppdatera →
              </button>
            ) : null}
          </p>
          {sourceIssues.length > 0 && (
            <p>
              Datakällor:{" "}
              {sourceIssues
                .map((s) => `${s.source.toUpperCase()} ${s.status === "not_connected" ? "ej ansluten" : "varning"}`)
                .join(" · ")}
            </p>
          )}
        </footer>
      )}
    </div>
  );
}
