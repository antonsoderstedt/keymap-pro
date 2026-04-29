import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Outcome {
  metric_name: string;
  days_after_implementation: number;
  baseline_value: number | null;
  current_value: number | null;
  delta: number | null;
  delta_pct: number | null;
  confidence: string | null;
  measured_at: string;
}

const METRIC_LABELS: Record<string, string> = {
  clicks: "Klick",
  impressions: "Visningar",
  ctr: "CTR",
  position: "Position",
};

export function ActionImpact({ actionId }: { actionId: string }) {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("action_outcomes")
        .select("metric_name, days_after_implementation, baseline_value, current_value, delta, delta_pct, confidence, measured_at")
        .eq("action_id", actionId)
        .order("days_after_implementation", { ascending: false });
      if (!cancelled) {
        setOutcomes((data as Outcome[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actionId]);

  if (loading) return null;
  if (outcomes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-2 italic">
        Effekt mäts automatiskt 7 / 30 / 60 / 90 dagar efter implementation.
      </p>
    );
  }

  // Group by metric, take latest (highest day) per metric
  const latestByMetric = new Map<string, Outcome>();
  for (const o of outcomes) {
    const existing = latestByMetric.get(o.metric_name);
    if (!existing || o.days_after_implementation > existing.days_after_implementation) {
      latestByMetric.set(o.metric_name, o);
    }
  }

  return (
    <div className="mt-3 p-2.5 rounded-md bg-muted/40 border border-border/60">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Uppmätt effekt</div>
      <div className="flex flex-wrap gap-3">
        {Array.from(latestByMetric.values()).map((o) => {
          const pct = o.delta_pct;
          const positive = pct !== null && pct > 0;
          const negative = pct !== null && pct < 0;
          // For "position" lower is better — invert
          const isGood = o.metric_name === "position"
            ? negative
            : o.metric_name === "ctr" || o.metric_name === "clicks" || o.metric_name === "impressions"
              ? positive
              : positive;
          const Icon = pct === null || pct === 0 ? Minus : isGood ? TrendingUp : TrendingDown;
          const colorClass = pct === null || pct === 0
            ? "text-muted-foreground"
            : isGood ? "text-primary" : "text-destructive";
          return (
            <div key={o.metric_name} className="flex items-center gap-1.5 text-xs">
              <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
              <span className="text-muted-foreground">{METRIC_LABELS[o.metric_name] ?? o.metric_name}:</span>
              <span className={`font-mono font-medium ${colorClass}`}>
                {pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({o.days_after_implementation}d)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
