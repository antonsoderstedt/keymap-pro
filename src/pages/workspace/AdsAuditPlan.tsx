// Ads Audit/Plan — sammanfattar alla Ads-opportunity-typer från sökordsuniversumet
// och låter användaren lägga till action_items med ett klick per sökord eller per kluster.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert,
  Layers,
  Ban,
  TrendingUp,
  Plus,
  Check,
  ListPlus,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AdsType = "account_gap" | "adgroup_candidate" | "negative_candidate" | "scalable_winner";

interface Opportunity {
  type: AdsType | string;
  title: string;
  description: string;
  keywords?: string[];
  estimated_revenue_p50?: number;
  priority?: "high" | "medium" | "low";
  scope?: { campaign_id?: string; campaign_name?: string };
  action_label?: string;
}

const TYPE_META: Record<AdsType, { label: string; icon: any; tone: string; category: string; priority: string }> = {
  account_gap: { label: "Account gap", icon: ShieldAlert, tone: "text-amber-500", category: "ads_account", priority: "high" },
  adgroup_candidate: { label: "Annonsgrupp-kandidater", icon: Layers, tone: "text-primary", category: "ads_structure", priority: "medium" },
  negative_candidate: { label: "Negativa kandidater", icon: Ban, tone: "text-rose-500", category: "ads_negatives", priority: "high" },
  scalable_winner: { label: "Skalbara vinnare", icon: TrendingUp, tone: "text-emerald-500", category: "ads_scale", priority: "high" },
};

export default function AdsAuditPlan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [aRes, itemsRes] = await Promise.all([
        supabase.from("analyses")
          .select("keyword_universe_json")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("action_items")
          .select("source_payload, title")
          .eq("project_id", id)
          .in("source_type", ["ads_opportunity", "ads_keyword"]),
      ]);
      if (cancelled) return;
      const u: any = (aRes.data as any)?.keyword_universe_json || {};
      const list: Opportunity[] = Array.isArray(u.opportunities) ? u.opportunities : [];
      setOpps(list.filter((o) => o.type in TYPE_META));

      const keys = new Set<string>();
      for (const row of (itemsRes.data ?? []) as any[]) {
        const sig = row?.source_payload?.signature;
        if (sig) keys.add(String(sig));
        else if (row?.title) keys.add(`title:${row.title}`);
      }
      setExisting(keys);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const grouped = useMemo(() => {
    const g: Record<AdsType, Opportunity[]> = {
      account_gap: [], adgroup_candidate: [], negative_candidate: [], scalable_winner: [],
    };
    for (const o of opps) if (o.type in g) g[o.type as AdsType].push(o);
    return g;
  }, [opps]);

  async function addAction(payload: {
    title: string;
    description: string;
    category: string;
    priority: string;
    signature: string;
    extra?: Record<string, any>;
  }) {
    if (!id) return;
    if (existing.has(payload.signature)) {
      toast({ title: "Redan tillagd", description: payload.title });
      return;
    }
    setBusy(payload.signature);
    try {
      const { error } = await supabase.from("action_items").insert({
        project_id: id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
        status: "todo",
        source_type: "ads_opportunity",
        source_payload: { signature: payload.signature, ...(payload.extra || {}) },
      });
      if (error) throw error;
      setExisting((p) => new Set(p).add(payload.signature));
      toast({ title: "Tillagd i Åtgärder ✓", description: payload.title });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function addCluster(op: Opportunity) {
    const meta = TYPE_META[op.type as AdsType];
    const sig = `ads:${op.type}:${op.title}`;
    addAction({
      title: op.title,
      description: op.description + (op.keywords?.length ? `\n\nSökord (${op.keywords.length}): ${op.keywords.join(", ")}` : ""),
      category: meta.category,
      priority: op.priority || meta.priority,
      signature: sig,
      extra: {
        ads_type: op.type,
        scope: op.scope || null,
        keywords: op.keywords || [],
        estimated_revenue_p50: op.estimated_revenue_p50 ?? null,
      },
    });
  }

  function addKeyword(op: Opportunity, kw: string) {
    const meta = TYPE_META[op.type as AdsType];
    const sig = `ads:${op.type}:${kw.toLowerCase()}`;
    const verb =
      op.type === "negative_candidate" ? "Lägg som negativ" :
      op.type === "scalable_winner" ? "Skala upp" :
      op.type === "account_gap" ? "Fyll gap" : "Bygg annonsgrupp för";
    addAction({
      title: `${verb}: "${kw}"`,
      description: `Från ${meta.label} — ${op.title}.\n${op.description}`,
      category: meta.category,
      priority: op.priority || meta.priority,
      signature: sig,
      extra: {
        ads_type: op.type,
        keyword: kw,
        scope: op.scope || null,
        parent_title: op.title,
      },
    });
  }

  function renderSection(type: AdsType) {
    const meta = TYPE_META[type];
    const Icon = meta.icon;
    const list = grouped[type];
    if (!list.length) return null;
    return (
      <Card key={type} className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Icon className={`h-5 w-5 ${meta.tone}`} />
            {meta.label}
            <Badge variant="outline" className="ml-1 text-[10px]">{list.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {list.map((op, i) => {
            const clusterSig = `ads:${op.type}:${op.title}`;
            const clusterAdded = existing.has(clusterSig);
            return (
              <div key={i} className="p-3 rounded-md border border-border bg-card/50">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{op.title}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{op.description}</p>
                    {op.scope?.campaign_name && (
                      <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                        Kampanj: {op.scope.campaign_name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {op.estimated_revenue_p50 != null && op.estimated_revenue_p50 > 0 && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        ~{Math.round(op.estimated_revenue_p50 / 1000)}k SEK/år
                      </Badge>
                    )}
                    <Badge
                      variant={op.priority === "high" ? "default" : op.priority === "medium" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {op.priority || meta.priority}
                    </Badge>
                  </div>
                </div>

                {op.keywords && op.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {op.keywords.map((kw, j) => {
                      const sig = `ads:${op.type}:${kw.toLowerCase()}`;
                      const added = existing.has(sig);
                      return (
                        <button
                          key={j}
                          disabled={added || busy === sig}
                          onClick={() => addKeyword(op, kw)}
                          className={`group inline-flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
                            added
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-default"
                              : "border-border bg-muted/40 text-muted-foreground hover:bg-primary/10 hover:text-foreground hover:border-primary/40"
                          }`}
                          title={added ? "Redan i Åtgärder" : "Lägg till som åtgärd"}
                        >
                          {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                          {kw}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant={clusterAdded ? "outline" : "default"}
                    disabled={clusterAdded || busy === clusterSig}
                    onClick={() => addCluster(op)}
                    className="h-7 gap-1.5 text-[11px]"
                  >
                    {clusterAdded ? <Check className="h-3 w-3" /> : <ListPlus className="h-3 w-3" />}
                    {clusterAdded ? "Tillagd" : "Lägg hela som åtgärd"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const total = opps.length;

  if (!total) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-3">
          <Sparkles className="h-8 w-8 text-primary mx-auto" />
          <div>
            <p className="font-medium">Ingen Ads-plan ännu</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Kör en full analys så bygger motorn ett sökordsuniversum med Ads-opportunities
              (account gaps, annonsgrupp-kandidater, negativa kandidater och skalbara vinnare).
            </p>
          </div>
          <Button onClick={() => navigate(`/project/${id}`)}>Kör analys</Button>
        </CardContent>
      </Card>
    );
  }

  const counts = (Object.keys(TYPE_META) as AdsType[]).map((t) => ({ t, n: grouped[t].length }));

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Ads-plan ({total} möjligheter)</div>
              <div className="text-xs text-muted-foreground">
                Klicka på ett sökord eller "Lägg hela" för att skapa en åtgärd.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {counts.map(({ t, n }) => {
              const m = TYPE_META[t];
              const Icon = m.icon;
              return (
                <Badge key={t} variant="outline" className="gap-1 font-mono text-[10px]">
                  <Icon className={`h-3 w-3 ${m.tone}`} />
                  {m.label}: {n}
                </Badge>
              );
            })}
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/clients/${id}/actions`)}>
            Öppna Åtgärder →
          </Button>
        </CardContent>
      </Card>

      {(Object.keys(TYPE_META) as AdsType[]).map(renderSection)}
    </div>
  );
}
