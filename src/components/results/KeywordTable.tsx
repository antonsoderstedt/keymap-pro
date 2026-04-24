import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  high: "default", medium: "secondary", low: "outline",
};

export function KeywordTable({ items, limit = 500 }: { items: UniverseKeyword[]; limit?: number }) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed border-border bg-card/50">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Inga sökord matchar.</CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border bg-card shadow-card">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sökord</TableHead>
              <TableHead className="text-right">Volym</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">KD%</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead>Prioritet</TableHead>
              <TableHead>Kanal</TableHead>
              <TableHead>Kluster</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, limit).map((k, i) => (
              <TableRow key={i} className={k.isNegative ? "opacity-60" : ""}>
                <TableCell className="font-mono text-sm">
                  {k.keyword}
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
        {items.length > limit && (
          <p className="border-t border-border py-3 text-center text-xs text-muted-foreground">
            Visar {limit} av {items.length.toLocaleString("sv-SE")} — exportera CSV för komplett lista
          </p>
        )}
      </CardContent>
    </Card>
  );
}
