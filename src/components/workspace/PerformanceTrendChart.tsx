import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import type { DailyTrendPoint, ActionAnnotation } from "@/lib/performance";
import { lastNDays } from "@/lib/performance";

interface Props {
  trend: DailyTrendPoint[];
  annotations: ActionAnnotation[];
}

export function PerformanceTrendChart({ trend, annotations }: Props) {
  const [range, setRange] = useState<"28" | "90" | "180">("90");
  const data = lastNDays(trend, parseInt(range));
  const visibleAnn = annotations.filter(
    (a) => data.length > 0 && a.date >= data[0].date && a.date <= data[data.length - 1].date,
  );

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Organisk trafik & rank-trend</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Markörer ◆ visar när åtgärder genomfördes — håll över för effekt.
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="28" className="text-xs h-6">28 d</TabsTrigger>
            <TabsTrigger value="90" className="text-xs h-6">90 d</TabsTrigger>
            <TabsTrigger value="180" className="text-xs h-6">180 d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            Ingen GSC-historik tillgänglig. Hämta historik nedan.
          </div>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    reversed
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={[1, "dataMax"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="clicks"
                    stroke="hsl(var(--primary))"
                    fill="url(#clicksFill)"
                    name="Klick"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="impressions"
                    stroke="hsl(var(--accent))"
                    strokeWidth={1.5}
                    dot={false}
                    name="Impressions"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="position"
                    stroke="#F59E0B"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    name="Snittposition"
                  />
                  {visibleAnn.map((a) => {
                    const point = data.find((d) => d.date >= a.date);
                    if (!point) return null;
                    return (
                      <ReferenceDot
                        key={a.id}
                        x={point.date}
                        y={point.clicks}
                        yAxisId="left"
                        r={6}
                        fill="hsl(var(--primary))"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {visibleAnn.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Åtgärder i perioden
                </div>
                <div className="space-y-1.5">
                  {visibleAnn.slice(0, 6).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-primary">◆</span>
                        <span className="text-muted-foreground tabular-nums">{a.date}</span>
                        <span className="truncate">{a.title}</span>
                      </div>
                      {a.deltaClicks != null && (
                        <Badge
                          variant="outline"
                          className={
                            a.deltaClicks > 0
                              ? "border-primary/40 text-primary"
                              : "border-destructive/40 text-destructive"
                          }
                        >
                          {a.deltaClicks > 0 ? "+" : ""}
                          {a.deltaClicks} klick
                          {a.deltaPct != null && ` (${a.deltaPct > 0 ? "+" : ""}${a.deltaPct.toFixed(0)}%)`}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
