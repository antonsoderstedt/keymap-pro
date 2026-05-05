// ClusterGrid — visar sökordsuniversumet aggregerat per kluster.
// Används som primär vy i Sökord-tabben (KeywordsHub).

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTENT_LABELS } from "@/components/keywords/KeywordTable";
import type { UniverseKeyword } from "@/lib/types";

export interface ClusterData {
  name: string;
  keywords: UniverseKeyword[];
  totalVolume: number;
  avgKd: number | null;
  avgCpc: number | null;
  competitorGapCount: number;
  dominantIntent: string;
  dominantChannel: string;
  strategyBreakdown: {
    acquire_nonbrand: number;
    acquire_brand: number;
    retain_nonbrand: number;
    retain_brand: number;
  };
  estimatedValueSek: number;
  enrichedCount: number;
  totalCount: number;
}

const STRATEGY_COLORS: Record<string, string> = {
  acquire_nonbrand: "bg-teal-500/70",
  acquire_brand: "bg-amber-500/70",
  retain_nonbrand: "bg-purple-500/70",
  retain_brand: "bg-pink-500/70",
};

const STRATEGY_LABELS: Record<string, string> = {
  acquire_nonbrand: "Nykund",
  acquire_brand: "Brand",
  retain_nonbrand: "Retention",
  retain_brand: "Brand ret.",
};

function StrategyLegend({
  breakdown,
  total,
}: {
  breakdown: ClusterData["strategyBreakdown"];
  total: number;
}) {
  const entries = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", STRATEGY_COLORS[key])} />
          <span className="text-[10px] text-muted-foreground">
            {STRATEGY_LABELS[key]} {Math.round((count / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

interface CardProps {
  cluster: ClusterData;
  onClick: () => void;
}

export function ClusterCard({ cluster, onClick }: CardProps) {
  const enrichedPct = cluster.totalCount
    ? Math.round((cluster.enrichedCount / cluster.totalCount) * 100)
    : 0;

  return (
    <Card
      className="cursor-pointer group transition-all duration-200 hover:border-primary/60 hover:shadow-sm"
      onClick={onClick}
    >
      <CardContent className="p-5 space-y-4">
        {/* Rubrik + värde */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-base font-medium truncate group-hover:text-primary transition-colors">
              {cluster.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cluster.totalCount} sökord · {cluster.totalVolume.toLocaleString("sv-SE")} vol/mån
            </p>
          </div>
          {cluster.estimatedValueSek > 0 && (
            <div className="text-right shrink-0">
              <div className="font-mono text-lg font-medium">
                {cluster.estimatedValueSek >= 100000
                  ? `${(cluster.estimatedValueSek / 1000).toFixed(0)}k`
                  : cluster.estimatedValueSek.toLocaleString("sv-SE")}
              </div>
              <div className="text-[10px] text-muted-foreground">kr/mån</div>
            </div>
          )}
        </div>

        {/* Stats-rad */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/50 py-1.5 px-2">
            <div className="text-xs font-medium">
              {cluster.avgKd != null ? Math.round(cluster.avgKd) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">KD%</div>
          </div>
          <div className="rounded-md bg-muted/50 py-1.5 px-2">
            <div className="text-xs font-medium">
              {cluster.avgCpc != null ? cluster.avgCpc.toFixed(2) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">CPC kr</div>
          </div>
          <div
            className={cn(
              "rounded-md py-1.5 px-2",
              cluster.competitorGapCount > 0 ? "bg-amber-500/10" : "bg-muted/50",
            )}
          >
            <div
              className={cn(
                "text-xs font-medium",
                cluster.competitorGapCount > 0 && "text-amber-600 dark:text-amber-400",
              )}
            >
              {cluster.competitorGapCount}
            </div>
            <div className="text-[10px] text-muted-foreground">Gap</div>
          </div>
        </div>

        {/* Data-täckning */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all"
              style={{ width: `${enrichedPct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {cluster.enrichedCount}/{cluster.totalCount} med data
          </span>
        </div>

        {/* Strategi-split bar */}
        <div>
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {(Object.keys(STRATEGY_COLORS) as Array<keyof typeof STRATEGY_COLORS>).map((key) => {
              const count = cluster.strategyBreakdown[key as keyof ClusterData["strategyBreakdown"]];
              if (!count) return null;
              return (
                <div
                  key={key}
                  className={cn("transition-all", STRATEGY_COLORS[key])}
                  style={{ width: `${(count / cluster.totalCount) * 100}%` }}
                  title={`${STRATEGY_LABELS[key]}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-1">
            <StrategyLegend breakdown={cluster.strategyBreakdown} total={cluster.totalCount} />
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {INTENT_LABELS[cluster.dominantIntent] ?? cluster.dominantIntent}
            </Badge>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">{cluster.dominantChannel}</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            Öppna <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface GridProps {
  clusters: ClusterData[];
  onClusterClick: (cluster: ClusterData) => void;
}

export function ClusterGrid({ clusters, onClusterClick }: GridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {clusters.map((c) => (
        <ClusterCard key={c.name} cluster={c} onClick={() => onClusterClick(c)} />
      ))}
    </div>
  );
}
