import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, BookOpen, ShieldCheck, Zap } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { StrategyTab } from "@/components/universe/StrategyTab";
import { ContentBriefsTab } from "@/components/universe/ContentBriefsTab";
import { TechSeoTab } from "@/components/universe/TechSeoTab";
import type { AnalysisResult, KeywordUniverse } from "@/lib/types";

interface Props {
  result: AnalysisResult;
  universe: KeywordUniverse;
  projectId: string;
  analysisId: string | null;
}

export function ActionSection({ result, universe, projectId, analysisId }: Props) {
  return (
    <section id="action" className="scroll-mt-6 space-y-6">
      <SectionHeader
        number={5}
        title="Action"
        description="Konkreta nästa steg: strategi, content-briefs, teknisk SEO och quick wins som ger snabb effekt."
      />

      <Tabs defaultValue="quickwins">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="quickwins" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Quick wins</TabsTrigger>
          <TabsTrigger value="strategy" className="gap-1.5"><Target className="h-3.5 w-3.5" />Strategi</TabsTrigger>
          <TabsTrigger value="briefs" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Content-briefs</TabsTrigger>
          <TabsTrigger value="techseo" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Teknisk SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="quickwins" className="mt-4">
          {result.quickWins?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {result.quickWins.map((q, i) => (
                <Card key={i} className="border-accent/30 bg-card shadow-card">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-sm">{q.keyword}</p>
                      <Badge variant="outline" className="border-accent/40 text-accent">{q.channel}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{q.reason}</p>
                    <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
                      <span className="font-semibold text-accent">Åtgärd: </span>
                      {q.action}
                    </div>
                    <div className="flex gap-3 text-[11px] text-muted-foreground">
                      <span>Volym: {q.volumeEstimate}</span>
                      <span>Intent: {q.intent}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">Inga quick wins genererade.</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="strategy" className="mt-4">
          {analysisId && <StrategyTab projectId={projectId} analysisId={analysisId} />}
        </TabsContent>
        <TabsContent value="briefs" className="mt-4">
          {analysisId && <ContentBriefsTab analysisId={analysisId} universe={universe} />}
        </TabsContent>
        <TabsContent value="techseo" className="mt-4">
          {analysisId && <TechSeoTab analysisId={analysisId} />}
        </TabsContent>
      </Tabs>
    </section>
  );
}
