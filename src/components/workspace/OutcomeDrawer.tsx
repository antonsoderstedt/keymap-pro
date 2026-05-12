// OutcomeDrawer — drilldown-graf med spend/konv/ROAS före och efter en pushad ändring.
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Point {
  date: string;
  spend: number;
  conversions: number;
  roas: number;
  cpa: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  outcome: {
    id: string;
    rule_id: string;
    campaign_id: string | null;
    applied_at: string | null;
  } | null;
  ruleLabel: string;
}

const fmtSek = (v: number) => `${Math.round(v).toLocaleString("sv-SE")} kr`;

export function OutcomeDrawer({ open, onOpenChange, projectId, outcome, ruleLabel }: Props) {
  const { toast } = useToast();
  const [series, setSeries] = useState<Point[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<"spend" | "conversions" | "roas" | "cpa">("spend");

  useEffect(() => {
    if (!open || !outcome?.campaign_id || !outcome.applied_at) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSeries(null);
      const { data, error } = await supabase.functions.invoke("ads-outcome-timeseries", {
        body: { project_id: projectId, campaign_id: outcome.campaign_id, applied_at: outcome.applied_at, window_days: 28 },
      });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast({ title: "Kunde inte hämta dagliga metrics", description: error.message, variant: "destructive" });
        return;
      }
      setSeries((data?.series || []) as Point[]);
    })();
    return () => { cancelled = true; };
  }, [open, outcome?.id, outcome?.campaign_id, outcome?.applied_at, projectId, toast]);

  const summary = useMemo(() => {
    if (!series || !outcome?.applied_at) return null;
    const applied = outcome.applied_at.slice(0, 10);
    const before = series.filter((p) => p.date < applied);
    const after = series.filter((p) => p.date >= applied);
    const sum = (arr: Point[], key: keyof Point) =>
      arr.reduce((a, p) => a + (p[key] as number || 0), 0);
    const avg = (arr: Point[], key: keyof Point) => arr.length ? sum(arr, key) / arr.length : 0;
    return {
      days_before: before.length,
      days_after: after.length,
      spend: { before: sum(before, "spend"), after: sum(after, "spend") },
      conv: { before: sum(before, "conversions"), after: sum(after, "conversions") },
      roas: { before: avg(before, "roas"), after: avg(after, "roas") },
      cpa: { before: avg(before, "cpa"), after: avg(after, "cpa") },
    };
  }, [series, outcome?.applied_at]);

  const config = {
    spend: { label: "Spend (SEK)", color: "hsl(var(--primary))" },
    conversions: { label: "Konverteringar", color: "hsl(var(--primary))" },
    roas: { label: "ROAS", color: "hsl(var(--primary))" },
    cpa: { label: "CPA (SEK)", color: "hsl(var(--primary))" },
  };

  const appliedISO = outcome?.applied_at?.slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">{ruleLabel}</SheetTitle>
          <SheetDescription>
            {outcome?.applied_at && (
              <>Pushad {new Date(outcome.applied_at).toLocaleDateString("sv-SE")} · kampanj {outcome.campaign_id}</>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!outcome?.campaign_id ? (
            <p className="text-sm text-muted-foreground">Saknar kampanj-ID — drilldown ej möjlig.</p>
          ) : loading ? (
            <Skeleton className="h-72 w-full rounded-md" />
          ) : !series || series.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Inga dagliga metrics hittades i fönstret ±28 dagar.</p>
          ) : (
            <>
              {/* Före vs Efter sammanfattning */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Spend före" value={fmtSek(summary.spend.before)} sub={`${summary.days_before}d`} />
                  <Stat label="Spend efter" value={fmtSek(summary.spend.after)} sub={`${summary.days_after}d`}
                    delta={pctDelta(summary.spend.after, summary.spend.before)} invertColor />
                  <Stat label="Konv. före" value={summary.conv.before.toFixed(1)} />
                  <Stat label="Konv. efter" value={summary.conv.after.toFixed(1)}
                    delta={pctDelta(summary.conv.after, summary.conv.before)} />
                  <Stat label="ROAS före" value={summary.roas.before.toFixed(2)} />
                  <Stat label="ROAS efter" value={summary.roas.after.toFixed(2)}
                    delta={pctDelta(summary.roas.after, summary.roas.before)} />
                  <Stat label="CPA före" value={fmtSek(summary.cpa.before)} />
                  <Stat label="CPA efter" value={fmtSek(summary.cpa.after)}
                    delta={pctDelta(summary.cpa.after, summary.cpa.before)} invertColor />
                </div>
              )}

              <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="spend">Spend</TabsTrigger>
                  <TabsTrigger value="conversions">Konv.</TabsTrigger>
                  <TabsTrigger value="roas">ROAS</TabsTrigger>
                  <TabsTrigger value="cpa">CPA</TabsTrigger>
                </TabsList>
                {(["spend", "conversions", "roas", "cpa"] as const).map((m) => (
                  <TabsContent key={m} value={m} className="mt-3">
                    <ChartContainer config={{ [m]: config[m] }} className="h-72 w-full">
                      <ResponsiveContainer>
                        <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={10} />
                          <YAxis fontSize={10} width={48} />
                          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                          {appliedISO && (
                            <ReferenceLine x={appliedISO} stroke="hsl(var(--primary))" strokeDasharray="4 2"
                              label={{ value: "Push", position: "top", fill: "hsl(var(--primary))", fontSize: 10 }} />
                          )}
                          <Line type="monotone" dataKey={m} stroke={`var(--color-${m})`} strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </TabsContent>
                ))}
              </Tabs>

              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                <Badge variant="outline">±28 dagar</Badge>
                <span>Daglig kampanjnivå-data direkt från Google Ads.</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function pctDelta(after: number, before: number): number | null {
  if (!before) return null;
  return ((after - before) / before) * 100;
}

function Stat({ label, value, sub, delta, invertColor }: { label: string; value: string; sub?: string; delta?: number | null; invertColor?: boolean }) {
  const positive = delta != null && delta > 0;
  const tone = delta == null ? "text-muted-foreground"
    : (invertColor ? !positive : positive) ? "text-emerald-500" : "text-destructive";
  return (
    <div className="border rounded-md p-2 bg-muted/10">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
      <div className={`text-[10px] font-mono ${tone}`}>
        {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%` : sub || "\u00a0"}
      </div>
    </div>
  );
}
