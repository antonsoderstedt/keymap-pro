// R5 — Account Health Card. Strukturmetrics + budgetfördelning + outcome rollup.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Layers, Hash, Ban, TrendingUp, Activity, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  pickTopCampaignsByBudget,
  summarizeOutcomes,
  type OutcomeRowLike,
} from "@/lib/accountIntelligence";
import type { CampaignTreeShape } from "./accountIntelligenceTypes";

interface Props {
  projectId: string;
  tree: CampaignTreeShape | null;
  treeLoading: boolean;
}

const fmtSek = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;
const fmtNum = (n: number) => n.toLocaleString("sv-SE");

function healthTone(score: number | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 80) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/40";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-500 border-yellow-500/40";
  return "bg-red-500/15 text-red-500 border-red-500/40";
}

export function AccountHealthCard({ projectId, tree, treeLoading }: Props) {
  const [outcomes, setOutcomes] = useState<OutcomeRowLike[] | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [outRes, auditRes] = await Promise.all([
        supabase
          .from("ads_recommendation_outcomes")
          .select("applied_at, measured_7d, measured_14d, measured_30d, auto_reverted_at")
          .eq("project_id", projectId)
          .gte("applied_at", new Date(Date.now() - 90 * 86400000).toISOString()),
        supabase
          .from("ads_audits")
          .select("health_score, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setOutcomes((outRes.data as OutcomeRowLike[] | null) ?? []);
      const score = (auditRes.data as any)?.health_score;
      setHealthScore(typeof score === "number" ? score : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (treeLoading || !loaded) {
    return <Skeleton className="h-72 w-full rounded-lg" />;
  }

  const campaigns = tree?.campaigns ?? [];
  const enabled = campaigns.filter((c) => c.status === "ENABLED").length;
  const adGroupCount = campaigns.reduce((s, c) => s + (c.ad_groups?.length ?? 0), 0);
  const keywordCount = campaigns.reduce(
    (s, c) =>
      s + (c.ad_groups ?? []).reduce((k, g) => k + (g.keywords?.length ?? 0), 0),
    0,
  );
  const negCount = campaigns.reduce((s, c) => s + (c.negatives?.length ?? 0), 0);

  const totalBudget = campaigns.reduce((s, c) => s + (c.daily_budget_sek ?? 0), 0);
  const { top, otherTotal } = pickTopCampaignsByBudget(campaigns, 5);

  const sum30 = summarizeOutcomes(outcomes ?? [], 30);

  return (
    <Card>
      <CardContent className="p-5 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg">Kontohälsa</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Struktur, budgetfördelning och utfall senaste 30 dagar.
            </p>
          </div>
          {healthScore != null ? (
            <Badge variant="outline" className={healthTone(healthScore)}>
              Health score: {healthScore}
            </Badge>
          ) : (
            <Link
              to={`/clients/${projectId}/actions`}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Inget audit körts än →
            </Link>
          )}
        </div>

        {/* Strukturmetrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StructMetric icon={Megaphone} label="Kampanjer" value={fmtNum(campaigns.length)} sub={`${enabled} aktiva`} />
          <StructMetric icon={Layers} label="Annonsgrupper" value={fmtNum(adGroupCount)} />
          <StructMetric icon={Hash} label="Sökord" value={fmtNum(keywordCount)} />
          <StructMetric icon={Ban} label="Negatives" value={fmtNum(negCount)} />
        </div>

        {/* Budget */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Daglig budget — fördelning
          </div>
          {totalBudget === 0 ? (
            <p className="text-xs text-muted-foreground">Ingen budget registrerad.</p>
          ) : (
            <>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {top.map((c, i) => {
                  const pct = ((c.daily_budget_sek ?? 0) / totalBudget) * 100;
                  return (
                    <div
                      key={c.id}
                      style={{ width: `${pct}%`, opacity: 1 - i * 0.12 }}
                      className="bg-primary"
                      title={`${c.name}: ${fmtSek(c.daily_budget_sek ?? 0)}`}
                    />
                  );
                })}
                {otherTotal > 0 && (
                  <div
                    style={{ width: `${(otherTotal / totalBudget) * 100}%` }}
                    className="bg-muted-foreground/40"
                    title={`Övriga: ${fmtSek(otherTotal)}`}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {top.map((c) => (
                  <span key={c.id} className="truncate">
                    <span className="text-foreground">{c.name}</span> · {fmtSek(c.daily_budget_sek ?? 0)}
                  </span>
                ))}
                {otherTotal > 0 && <span>Övriga · {fmtSek(otherTotal)}</span>}
              </div>
            </>
          )}
        </div>

        {/* Outcome rollup 30d */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/40">
          <StructMetric icon={Activity} label="Pushar 30d" value={fmtNum(sum30.applied)} />
          <StructMetric icon={Activity} label="Mätta" value={fmtNum(sum30.measured)} sub={`av ${sum30.applied}`} />
          <StructMetric
            icon={TrendingUp}
            label="Net positiva"
            value={fmtNum(sum30.positive)}
            sub={sum30.measured > 0 ? `${sum30.positive} av ${sum30.measured}` : "—"}
          />
          <StructMetric icon={Undo2} label="Auto-reverts" value={fmtNum(sum30.autoReverted)} />
        </div>
      </CardContent>
    </Card>
  );
}

function StructMetric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-xl tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
