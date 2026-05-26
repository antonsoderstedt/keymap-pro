import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UniverseKeyword } from "@/lib/types";

export const DIMENSION_LABELS: Record<string, string> = {
  produkt: "Produkt", tjanst: "Tjänst", bransch: "Bransch", material: "Material",
  problem: "Problem", losning: "Lösning", location: "Geografi", kundsegment: "Kundsegment",
  use_case: "Use case", kommersiell: "Kommersiell", fraga: "Fråga", konkurrent: "Konkurrent",
};

export const INTENT_LABELS: Record<string, string> = {
  informational: "Info", commercial: "Kommersiell", transactional: "Transaktionell", navigational: "Navigations",
};

const PRIORITY_VARIANT: Record<string, any> = {
  high: "default", medium: "secondary", low: "outline", skip: "outline",
};

const fmtSek = (n?: number) =>
  n != null && n > 0 ? `${Math.round(n / 1000)}k` : "—";

export function KeywordTable({ items, limit = 500 }: { items: UniverseKeyword[]; limit?: number }) {
  const PAGE_SIZE = 75;
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleRows(PAGE_SIZE);
  }, [items]);

  if (items.length === 0) {
    return (
      <Card className="border-dashed border-border bg-card/50">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Inga sökord matchar.</CardContent>
      </Card>
    );
  }

  const maxRows = Math.min(items.length, limit);
  const shownRows = Math.min(visibleRows, maxRows);
  const hasMore = shownRows < maxRows;
  const step = Math.min(PAGE_SIZE, maxRows - shownRows);

  const hasScores = items.some((k) => k.score);
  return (
    <Card className="border-border bg-card shadow-card">
      <CardContent className="overflow-x-auto p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>Visar {shownRows.toLocaleString("sv-SE")} av {maxRows.toLocaleString("sv-SE")} sökord</span>
          {hasMore && <span>Använd Visa fler för nästa block</span>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sökord</TableHead>
              <TableHead className="text-right">Volym</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">KD%</TableHead>
              {hasScores && <TableHead className="text-right" title="Multi-signal score 0–1">Score</TableHead>}
              {hasScores && <TableHead className="text-right" title="Estimerad intäkt p50, 12 mån (SEK)">Intäkt p50</TableHead>}
              <TableHead>Dimension</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead>Prioritet</TableHead>
              <TableHead>Kanal</TableHead>
              <TableHead>Kluster</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, shownRows).map((k, i) => (
              <TableRow key={i} className={k.isNegative || k.priority === "skip" ? "opacity-60" : ""}>
                <TableCell className="font-mono text-sm">
                  {k.keyword}
                  {(k as any).is_already_ranking && (k as any).ranking_position && (
                    <span
                      className={`ml-1 font-mono text-[9px] px-1 rounded ${
                        (k as any).ranking_position <= 3
                          ? "bg-emerald-500/20 text-emerald-400"
                          : (k as any).ranking_position <= 10
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-muted text-muted-foreground"
                      }`}
                      title={`Rankar #${(k as any).ranking_position} i Google (GSC)`}
                    >
                      #{(k as any).ranking_position}
                    </span>
                  )}
                  {k.dataSource !== "real" && <Badge variant="outline" className="ml-2 text-[10px]">Uppskattad</Badge>}
                  {k.isNegative && <Badge variant="destructive" className="ml-2 text-[10px]">Negativ</Badge>}
                  {k.competitorGap && <Badge variant="outline" className="ml-2 border-warning/50 text-[10px] text-warning">Gap</Badge>}
                </TableCell>
                <TableCell className="text-right font-mono">{k.searchVolume?.toLocaleString("sv-SE") ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">{k.cpc != null ? k.cpc.toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right font-mono">
                  {k.kd != null ? (
                    <span className={k.kd < 30 ? "text-accent" : k.kd < 60 ? "text-warning" : "text-destructive"}>
                      {Math.round(k.kd)}
                    </span>
                  ) : "—"}
                </TableCell>
                {hasScores && (
                  <TableCell
                    className="text-right font-mono"
                    title={k.score
                      ? `Demand ${k.score.components.demand} · Intent ${k.score.components.intent} · BusRel ${k.score.components.busRel} · ICP ${k.score.components.icp} · Diff ${k.score.components.difficulty}`
                      : undefined}
                  >
                    {k.score ? k.score.final.toFixed(2) : "—"}
                  </TableCell>
                )}
                {hasScores && (
                  <TableCell
                    className="text-right font-mono"
                    title={k.score?.revenue.payback_weeks != null ? `Payback ~${k.score.revenue.payback_weeks} v` : undefined}
                  >
                    {fmtSek(k.score?.revenue.p50)}
                  </TableCell>
                )}
                <TableCell><Badge variant="outline">{DIMENSION_LABELS[k.dimension] || k.dimension}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{INTENT_LABELS[k.intent] || k.intent}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{k.funnelStage}</TableCell>
                <TableCell><Badge variant={PRIORITY_VARIANT[k.priority] || "outline"}>{k.priority}</Badge></TableCell>
                <TableCell className="text-xs">{k.channel}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={k.cluster}>{k.cluster}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Exportera CSV för komplett lista.</p>
          {hasMore && (
            <Button size="sm" variant="outline" onClick={() => setVisibleRows((cur) => Math.min(cur + PAGE_SIZE, maxRows))}>
              Visa fler (+{step})
            </Button>
          )}
        </div>
        {items.length > limit && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            Tekniskt tak i tabellen: {limit.toLocaleString("sv-SE")}. Använd export för alla {items.length.toLocaleString("sv-SE")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
