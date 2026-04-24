import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { SectionHeader } from "../SectionHeader";
import { ChartCard } from "../ChartCard";
import { KeywordTable, DIMENSION_LABELS } from "../KeywordTable";
import type { KeywordUniverse, UniverseKeyword } from "@/lib/types";

interface Props {
  universe: KeywordUniverse;
  onExportCsv: (filtered: UniverseKeyword[]) => void;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function KeywordsSection({ universe, onExportCsv }: Props) {
  const [search, setSearch] = useState("");
  const [intent, setIntent] = useState("all");
  const [funnel, setFunnel] = useState("all");
  const [dimension, setDimension] = useState("all");
  const [channel, setChannel] = useState("all");
  const [priority, setPriority] = useState("all");
  const [hideZero, setHideZero] = useState(true);
  const [onlyReal, setOnlyReal] = useState(false);
  const [onlyGap, setOnlyGap] = useState(false);
  const [maxKd, setMaxKd] = useState("100");

  const filtered = useMemo<UniverseKeyword[]>(() => {
    const kdLimit = Number(maxKd) || 100;
    return universe.keywords.filter((k) => {
      if (search && !k.keyword.toLowerCase().includes(search.toLowerCase())) return false;
      if (intent !== "all" && k.intent !== intent) return false;
      if (funnel !== "all" && k.funnelStage !== funnel) return false;
      if (dimension !== "all" && k.dimension !== dimension) return false;
      if (channel !== "all" && k.channel !== channel) return false;
      if (priority !== "all" && k.priority !== priority) return false;
      if (onlyReal && k.dataSource !== "real") return false;
      if (hideZero && k.dataSource === "real" && (k.searchVolume ?? 0) === 0) return false;
      if (onlyGap && !k.competitorGap) return false;
      if (k.kd != null && k.kd > kdLimit) return false;
      return true;
    }).sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
  }, [universe, search, intent, funnel, dimension, channel, priority, hideZero, onlyReal, onlyGap, maxKd]);

  const dimensions = useMemo(() => Array.from(new Set(universe.keywords.map((k) => k.dimension))), [universe]);
  const channels = useMemo(() => Array.from(new Set(universe.keywords.map((k) => k.channel))), [universe]);

  const scatterData = useMemo(() =>
    filtered
      .filter((k) => k.kd != null && (k.searchVolume ?? 0) > 0)
      .slice(0, 200)
      .map((k) => ({ x: k.kd, y: k.searchVolume, z: (k.cpc ?? 1) * 5, keyword: k.keyword })),
  [filtered]);

  return (
    <section id="keywords" className="scroll-mt-6 space-y-6">
      <SectionHeader
        number={3}
        title="Sökord"
        description="Hela sökord-universumet med filter. Använd diagrammet 'Easy wins' för att hitta sökord med hög volym och låg svårighet."
        action={
          <Button onClick={() => onExportCsv(filtered)} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> CSV ({filtered.length})
          </Button>
        }
      />

      {/* Easy wins scatter */}
      {scatterData.length > 0 && (
        <ChartCard
          title="Easy wins — volym vs svårighet"
          description="Punkter längst upp till vänster är guld: hög volym, låg svårighet. Storleken visar CPC."
        >
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" dataKey="x" name="KD%" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} label={{ value: "Svårighet (KD%)", position: "insideBottom", offset: -2, fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="number" dataKey="y" name="Volym" stroke="hsl(var(--muted-foreground))" fontSize={11} label={{ value: "Volym/mån", angle: -90, position: "insideLeft", fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <ZAxis type="number" dataKey="z" range={[40, 200]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => n === "x" ? [`${Math.round(v)}`, "KD%"] : n === "y" ? [v?.toLocaleString("sv-SE"), "Volym"] : null}
                labelFormatter={(_l, p) => p?.[0]?.payload?.keyword ?? ""}
              />
              <Scatter data={scatterData} fill="hsl(var(--chart-1))" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Filters */}
      <Card className="border-border bg-card shadow-card">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">Sök</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrera sökord…" className="h-9 pl-8" />
            </div>
          </div>
          <FilterSelect label="Intent" value={intent} onChange={setIntent} options={[["all","Alla"],["informational","Info"],["commercial","Kommersiell"],["transactional","Transaktionell"],["navigational","Navigations"]]} />
          <FilterSelect label="Funnel" value={funnel} onChange={setFunnel} options={[["all","Alla"],["awareness","Awareness"],["consideration","Consideration"],["conversion","Conversion"]]} />
          <FilterSelect label="Dimension" value={dimension} onChange={setDimension} options={[["all","Alla"], ...dimensions.map<[string,string]>((d) => [d, DIMENSION_LABELS[d] || d])]} />
          <FilterSelect label="Kanal" value={channel} onChange={setChannel} options={[["all","Alla"], ...channels.map<[string,string]>((c) => [c, c])]} />
          <FilterSelect label="Prioritet" value={priority} onChange={setPriority} options={[["all","Alla"],["high","Hög"],["medium","Medium"],["low","Låg"]]} />
          <div className="space-y-1.5">
            <Label className="text-xs">KD max</Label>
            <Input type="number" min={0} max={100} value={maxKd} onChange={(e) => setMaxKd(e.target.value)} className="h-9" />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch id="zero" checked={hideZero} onCheckedChange={setHideZero} />
            <Label htmlFor="zero" className="cursor-pointer text-xs">Dölj 0-volym</Label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch id="real" checked={onlyReal} onCheckedChange={setOnlyReal} />
            <Label htmlFor="real" className="cursor-pointer text-xs">Endast verklig data</Label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch id="gap" checked={onlyGap} onCheckedChange={setOnlyGap} />
            <Label htmlFor="gap" className="cursor-pointer text-xs">Konkurrent-gap</Label>
          </div>
        </CardContent>
      </Card>

      <KeywordTable items={filtered} />
    </section>
  );
}
