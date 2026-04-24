import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "../SectionHeader";
import type { AnalysisResult } from "@/lib/types";
import { Sparkles } from "lucide-react";

interface Props {
  segments: AnalysisResult["segments"];
}

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const color = score >= 7 ? "hsl(var(--accent))" : score >= 4 ? "hsl(var(--warning))" : "hsl(var(--muted-foreground))";
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute font-mono text-sm font-semibold">{score}</span>
    </div>
  );
}

export function SegmentsSection({ segments }: Props) {
  if (!segments?.length) return null;
  const sorted = [...segments].sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <section id="segments" className="scroll-mt-6 space-y-6">
      <SectionHeader
        number={2}
        title="Segment"
        description="Vilka kundsegment finns i din marknad och hur stora är de? Sortera efter möjlighetspoäng — börja med dem på toppen."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((seg, i) => (
          <Card key={i} className="border-border bg-card shadow-card transition-all hover:shadow-elevated">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{seg.name}</CardTitle>
                    {seg.isNew && (
                      <Badge variant="outline" className="border-accent/40 text-[10px] text-accent">
                        <Sparkles className="mr-1 h-2.5 w-2.5" /> Nytt
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>SNI {seg.sniCode}</span>
                    <span>•</span>
                    <span>{seg.size?.toLocaleString("sv-SE")} företag</span>
                  </div>
                </div>
                <ScoreRing score={seg.opportunityScore} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {seg.howTheySearch?.length > 0 && (
                <div>
                  <p className="mb-1.5 font-medium text-muted-foreground">Hur de söker</p>
                  <div className="flex flex-wrap gap-1">
                    {seg.howTheySearch.slice(0, 6).map((s, j) => (
                      <Badge key={j} variant="outline" className="font-mono">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {seg.primaryKeywords?.length > 0 && (
                <div>
                  <p className="mb-1.5 font-medium text-muted-foreground">Topp-sökord</p>
                  <div className="space-y-1">
                    {seg.primaryKeywords.slice(0, 4).map((kw, j) => (
                      <div key={j} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5">
                        <span className="font-mono">{kw.keyword}</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{kw.volumeEstimate}</span>
                          <Badge variant="secondary" className="text-[10px]">{kw.intent}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {seg.insight && (
                <p className="border-l-2 border-primary/40 bg-primary/5 px-3 py-2 italic text-foreground">
                  {seg.insight}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
