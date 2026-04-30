import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodKpis } from "@/lib/performance";
import { deltaPct } from "@/lib/performance";

interface Props {
  current: PeriodKpis;
  previous: PeriodKpis;
}

interface Kpi {
  label: string;
  value: string;
  rawCurrent: number;
  rawPrevious: number;
  betterDirection: "up" | "down";
}

function formatNum(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return Math.round(n).toString();
}

export function PerformanceKpis({ current, previous }: Props) {
  const kpis: Kpi[] = [
    {
      label: "Klick",
      value: formatNum(current.clicks),
      rawCurrent: current.clicks,
      rawPrevious: previous.clicks,
      betterDirection: "up",
    },
    {
      label: "Impressions",
      value: formatNum(current.impressions),
      rawCurrent: current.impressions,
      rawPrevious: previous.impressions,
      betterDirection: "up",
    },
    {
      label: "Snittposition",
      value: current.position ? current.position.toFixed(1) : "—",
      rawCurrent: current.position,
      rawPrevious: previous.position,
      betterDirection: "down",
    },
    {
      label: "CTR",
      value: (current.ctr * 100).toFixed(2) + "%",
      rawCurrent: current.ctr,
      rawPrevious: previous.ctr,
      betterDirection: "up",
    },
    {
      label: "Topp 10-andel",
      value: (current.topTenShare * 100).toFixed(0) + "%",
      rawCurrent: current.topTenShare,
      rawPrevious: previous.topTenShare,
      betterDirection: "up",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const delta = deltaPct(kpi.rawCurrent, kpi.rawPrevious);
        const isUp = (delta ?? 0) > 0;
        const isGood =
          delta == null
            ? null
            : kpi.betterDirection === "up"
              ? isUp
              : !isUp;
        return (
          <Card key={kpi.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {kpi.label}
              </div>
              <div className="text-2xl font-mono font-semibold">{kpi.value}</div>
              <div
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs",
                  delta == null
                    ? "text-muted-foreground"
                    : isGood
                      ? "text-primary"
                      : "text-destructive",
                )}
              >
                {delta == null ? (
                  <>
                    <Minus className="h-3 w-3" /> ingen jämförelse
                  </>
                ) : (
                  <>
                    {isUp ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(delta).toFixed(1)}% vs förra perioden
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
