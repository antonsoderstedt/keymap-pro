// TODO: DEAD FILE — absorberat i ExecutiveDashboard
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Search, MousePointerClick, Eye, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar,
} from "recharts";

interface GscRow {
  date?: string;
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export default function SeoDashboard() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("gsc_snapshots")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSnapshot(data);
      setLoading(false);
    })();
  }, [id]);

  const rows: GscRow[] = (snapshot?.rows as GscRow[]) || [];
  const totals = snapshot?.totals || {};

  // Aggregations
  const queries = rows.filter((r) => r.query).slice(0, 50);
  const topQueries = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const opportunities = queries.filter((q) => q.position > 4 && q.position < 15 && q.impressions > 50)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 8);

  // Build trend if dates exist
  const byDate: Record<string, { date: string; clicks: number; impressions: number }> = {};
  rows.forEach((r) => {
    if (!r.date) return;
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, clicks: 0, impressions: 0 };
    byDate[r.date].clicks += r.clicks || 0;
    byDate[r.date].impressions += r.impressions || 0;
  });
  const trend = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">SEO Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search Console-data: klick, visningar, CTR, position. Identifierar quick-wins automatiskt.
        </p>
      </div>

      {!snapshot && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Ingen GSC-data ännu. Koppla Google Search Console under Inställningar och hämta data.
            </p>
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Klick" value={totals.clicks ?? rows.reduce((s, r) => s + (r.clicks || 0), 0)} icon={MousePointerClick} />
            <Kpi label="Visningar" value={totals.impressions ?? rows.reduce((s, r) => s + (r.impressions || 0), 0)} icon={Eye} />
            <Kpi label="Snitt-CTR" value={`${((totals.ctr ?? avg(rows.map((r) => r.ctr))) * 100).toFixed(2)}%`} icon={TrendingUp} />
            <Kpi label="Snitt-position" value={(totals.position ?? avg(rows.map((r) => r.position))).toFixed(1)} icon={ArrowUpRight} />
          </div>

          {/* Trend */}
          {trend.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" fill="url(#grad)" name="Klick" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top queries */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">Topp-sökord (klick)</CardTitle>
              </CardHeader>
              <CardContent>
                {topQueries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen query-data.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={topQueries} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis type="category" dataKey="query" stroke="hsl(var(--muted-foreground))" fontSize={10} width={80} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="clicks" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  Quick-win-möjligheter
                  <Badge variant="secondary" className="text-[10px]">Position 5-15</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga uppenbara möjligheter just nu.</p>
                ) : (
                  <div className="space-y-2">
                    {opportunities.map((q, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{q.query}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Position {q.position.toFixed(1)} · {q.impressions} visningar · CTR {(q.ctr * 100).toFixed(1)}%
                          </div>
                        </div>
                        <Badge variant="outline" className="gap-1 shrink-0">
                          <ArrowUpRight className="h-3 w-3" />
                          {Math.round(q.impressions * 0.1)} klick/mån
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="font-serif text-3xl">{typeof value === "number" ? value.toLocaleString("sv-SE") : value}</div>
      </CardContent>
    </Card>
  );
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + (n || 0), 0) / nums.length;
}