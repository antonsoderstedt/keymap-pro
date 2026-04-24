import { useMemo } from "react";
import { KpiCard } from "./KpiCard";
import { ChartCard } from "./ChartCard";
import { SectionHeader } from "./SectionHeader";
import { Sparkles, Search, DollarSign, Target } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import type { AnalysisResult } from "@/lib/types";
import type { KeywordUniverse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { INTENT_LABELS } from "./KeywordTable";

interface Props {
  result: AnalysisResult;
  universe: KeywordUniverse | null;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
];

export function OverviewSection({ result, universe }: Props) {
  const totalVolume = useMemo(() => {
    if (!universe) return 0;
    return universe.keywords.reduce((sum, k) => sum + (k.searchVolume ?? 0), 0);
  }, [universe]);

  const avgCpc = useMemo(() => {
    if (!universe) return 0;
    const withCpc = universe.keywords.filter((k) => k.cpc != null);
    if (withCpc.length === 0) return 0;
    return withCpc.reduce((s, k) => s + (k.cpc ?? 0), 0) / withCpc.length;
  }, [universe]);

  const priorityCount = useMemo(
    () => universe?.keywords.filter((k) => k.priority === "high" && !k.isNegative).length ?? 0,
    [universe]
  );

  const intentData = useMemo(() => {
    if (!universe) return [];
    const counts: Record<string, number> = {};
    universe.keywords.forEach((k) => {
      if (k.isNegative) return;
      counts[k.intent] = (counts[k.intent] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: INTENT_LABELS[name] ?? name, value }));
  }, [universe]);

  const segmentScoreData = useMemo(() => {
    return (result.segments ?? [])
      .map((s) => ({ name: s.name.length > 18 ? s.name.slice(0, 16) + "…" : s.name, score: s.opportunityScore, fullName: s.name }))
      .sort((a, b) => b.score - a.score);
  }, [result.segments]);

  const channelData = useMemo(() => {
    if (!universe) return [];
    const counts: Record<string, number> = {};
    universe.keywords.forEach((k) => {
      if (k.isNegative) return;
      counts[k.channel] = (counts[k.channel] ?? 0) + (k.searchVolume ?? 0);
    });
    return Object.entries(counts).map(([name, volume]) => ({ name, volume }));
  }, [universe]);

  return (
    <section id="overview" className="scroll-mt-6 space-y-6">
      <SectionHeader
        number={1}
        title="Översikt"
        description="Snabb överblick över analysens viktigaste siffror. Använd den här som utgångspunkt och bli detaljerad i sektionerna nedan."
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Totala sökord"
          value={(universe?.totalKeywords ?? result.totalKeywords ?? 0).toLocaleString("sv-SE")}
          hint={`${universe?.totalEnriched ?? 0} med verklig data`}
          icon={<Search className="h-5 w-5" />}
        />
        <KpiCard
          label="Total månadsvolym"
          value={totalVolume.toLocaleString("sv-SE")}
          hint="Summa sökningar/mån"
          icon={<Sparkles className="h-5 w-5" />}
          accent="accent"
        />
        <KpiCard
          label="Snitt-CPC"
          value={avgCpc > 0 ? `${avgCpc.toFixed(2)} kr` : "—"}
          hint="Genomsnitt över alla sökord"
          icon={<DollarSign className="h-5 w-5" />}
          accent="warning"
        />
        <KpiCard
          label="Prioriterade"
          value={priorityCount}
          hint="Hög prioritet (kör först)"
          icon={<Target className="h-5 w-5" />}
        />
      </div>

      {/* Summary text */}
      {result.summary && (
        <Card className="border-primary/20 bg-primary/5 shadow-card">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Sammanfattning</p>
            <p className="mt-2 text-sm leading-relaxed">{result.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {intentData.length > 0 && (
          <ChartCard title="Sökord per intent" description="Hur fördelar sig universumet över köp-/info-/navigationsintentioner?">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={intentData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {intentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {segmentScoreData.length > 0 && (
          <ChartCard title="Segment efter möjlighetspoäng" description="Var ligger de största möjligheterna? Börja från toppen.">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={segmentScoreData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="category" dataKey="name" width={120} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${v}/10`, "Score"]}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName ?? ""}
                />
                <Bar dataKey="score" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {channelData.length > 0 && (
          <ChartCard title="Volym per kanal" description="Hur fördelar sig sökvolymen mellan SEO, Ads, Content och Lokal SEO.">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="volume" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </section>
  );
}
