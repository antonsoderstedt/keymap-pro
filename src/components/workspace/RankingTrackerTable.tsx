import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/revenue";
import type { RankingRow } from "@/lib/performance";

interface Props {
  rows: RankingRow[];
  currency: Currency;
}

type SortKey = "impressions" | "position" | "delta" | "yearlyValue" | "upliftToTop3" | "clicks";

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return <span className="text-muted-foreground/50 text-xs">—</span>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${20 - ((v - min) / range) * 18}`)
    .join(" ");
  const trending = data[data.length - 1] - data[0];
  return (
    <svg width="60" height="20" className="inline-block">
      <polyline
        fill="none"
        stroke={trending >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

export function RankingTrackerTable({ rows, currency }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [filter, setFilter] = useState<"all" | "top10" | "11-20" | "movers">("all");

  const filtered = useMemo(() => {
    let r = rows;
    if (search) r = r.filter((x) => x.query.toLowerCase().includes(search.toLowerCase()));
    if (filter === "top10") r = r.filter((x) => x.position > 0 && x.position <= 10);
    else if (filter === "11-20") r = r.filter((x) => x.position > 10 && x.position <= 20);
    else if (filter === "movers") r = r.filter((x) => x.delta != null && Math.abs(x.delta) >= 1);
    return [...r].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (sortKey === "position") return av - bv;
      return bv - av;
    });
  }, [rows, search, sortKey, filter]);

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Alla", count: rows.length },
    { id: "top10", label: "Topp 10", count: rows.filter((r) => r.position > 0 && r.position <= 10).length },
    { id: "11-20", label: "Pos 11-20", count: rows.filter((r) => r.position > 10 && r.position <= 20).length },
    { id: "movers", label: "Rört sig", count: rows.filter((r) => r.delta != null && Math.abs(r.delta) >= 1).length },
  ];

  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ranking-tracker</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Vad rankar vi på idag och vart är vi på väg.
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök sökord…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "text-[11px] px-2 py-1 rounded border transition",
                filter === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="opacity-60">({f.count})</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 font-normal">Sökord</th>
                <SortableTh label="Pos" k="position" sortKey={sortKey} setSort={setSortKey} />
                <th className="text-right py-2 font-normal">Δ</th>
                <SortableTh label="Klick" k="clicks" sortKey={sortKey} setSort={setSortKey} />
                <SortableTh label="Imp" k="impressions" sortKey={sortKey} setSort={setSortKey} />
                <th className="text-left py-2 font-normal hidden lg:table-cell">URL</th>
                <SortableTh label={`Värde/år`} k="yearlyValue" sortKey={sortKey} setSort={setSortKey} />
                <SortableTh label="Uplift→#3" k="upliftToTop3" sortKey={sortKey} setSort={setSortKey} />
                <th className="text-center py-2 font-normal">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r) => (
                <tr key={r.query} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-2 font-medium max-w-[240px] truncate">{r.query}</td>
                  <td className="py-2 text-right font-mono">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[11px]",
                        r.position > 0 && r.position <= 3 && "border-primary/60 text-primary",
                        r.position > 3 && r.position <= 10 && "border-primary/30",
                        r.position > 20 && "text-muted-foreground",
                      )}
                    >
                      {r.position > 0 ? r.position.toFixed(1) : "—"}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    {r.delta == null ? (
                      <span className="text-muted-foreground/50">—</span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-mono",
                          r.delta > 0 ? "text-primary" : r.delta < 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {r.delta > 0 ? <ArrowUp className="h-3 w-3" /> : r.delta < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                        {Math.abs(r.delta).toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">{r.clicks}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{r.impressions.toLocaleString("sv-SE")}</td>
                  <td className="py-2 hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[200px]">
                    {r.url ? new URL(r.url).pathname : "—"}
                  </td>
                  <td className="py-2 text-right font-mono">{formatMoney(r.yearlyValue, currency, { compact: true })}</td>
                  <td className="py-2 text-right font-mono text-primary/80">
                    +{formatMoney(r.upliftToTop3, currency, { compact: true })}
                  </td>
                  <td className="py-2 text-center">
                    <Sparkline data={r.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Inga sökord matchar.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SortableTh({
  label, k, sortKey, setSort,
}: { label: string; k: SortKey; sortKey: SortKey; setSort: (k: SortKey) => void }) {
  return (
    <th className="text-right py-2 font-normal">
      <button
        onClick={() => setSort(k)}
        className={cn(
          "hover:text-foreground transition",
          sortKey === k && "text-foreground",
        )}
      >
        {label} {sortKey === k && "↓"}
      </button>
    </th>
  );
}
