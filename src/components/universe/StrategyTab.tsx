import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, TrendingUp, Target, Calendar, FileText, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { StrategyDraft } from "@/lib/types";

interface Props {
  projectId: string;
  analysisId: string;
}

export function StrategyTab({ projectId, analysisId }: Props) {
  const { toast } = useToast();
  const [strategy, setStrategy] = useState<StrategyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("strategy_drafts").select("payload").eq("analysis_id", analysisId).maybeSingle();
    if (data?.payload) setStrategy(data.payload as any);
    setLoading(false);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-strategy", {
        body: { project_id: projectId, analysis_id: analysisId },
      });
      if (error) throw error;
      setStrategy(data.strategy);
      toast({ title: "Strategi genererad" });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  if (loading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>;

  if (!strategy) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-4">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <div>
            <p className="font-serif text-lg">Generera AI-strategi</p>
            <p className="text-sm text-muted-foreground mt-1">Budget, bidstrategi, launch-ordning, landningssidekrav baserat på ditt Universe.</p>
          </div>
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generating ? "Genererar (~30 sek)..." : "Generera strategi"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={generate} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generera om
        </Button>
      </div>

      {/* Budget */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Budgetfördelning</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {strategy.budgetSplit.map((b, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
              <div>
                <div className="font-mono text-sm">{b.campaign}</div>
                <p className="text-xs text-muted-foreground mt-1">{b.rationale}</p>
              </div>
              <Badge variant="secondary" className="font-mono whitespace-nowrap">{b.monthlyBudgetSek.toLocaleString()} kr/mån</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bidding */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Bidstrategi</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {strategy.biddingStrategy.map((b, i) => (
            <div key={i} className="py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm">{b.campaign}</span>
                <Badge>{b.type}</Badge>
                <Badge variant="outline">{b.target}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{b.rationale}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Launch order */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />Launch-ordning</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {strategy.launchOrder.map((p, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
              <Badge variant="outline" className="font-mono shrink-0">v.{p.week}</Badge>
              <div className="flex-1">
                <div className="font-medium text-sm">{p.phase}</div>
                <div className="text-xs text-muted-foreground">{p.campaigns.join(", ")}</div>
                <p className="text-xs mt-1">{p.focus}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Landing pages */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Landningssidekrav</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {strategy.landingPageRequirements.map((l, i) => (
            <div key={i} className="border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-1"><Badge variant="secondary">{l.adGroup}</Badge></div>
              <div className="text-sm font-serif">H1: {l.h1}</div>
              <ul className="text-xs text-muted-foreground mt-2 space-y-0.5 list-disc list-inside">
                {l.mustHaves.map((m, j) => <li key={j}>{m}</li>)}
              </ul>
              <div className="text-xs mt-2"><span className="text-muted-foreground">CTA:</span> <span className="font-mono">{l.cta}</span></div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick wins */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Quick wins</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {strategy.quickWins.map((q, i) => (
            <div key={i} className="py-2 border-b border-border last:border-0">
              <div className="font-mono text-sm">{q.keyword}</div>
              <div className="text-xs"><span className="text-primary">{q.action}</span> — <span className="text-muted-foreground">{q.why}</span></div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SEO vs Ads */}
      <Card>
        <CardHeader><CardTitle className="text-base">SEO vs Ads — råd</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{strategy.seoVsAdsAdvice}</p></CardContent>
      </Card>

      {/* KPIs */}
      <Card>
        <CardHeader><CardTitle className="text-base">KPI:er</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {strategy.kpis.map((k, i) => (
              <div key={i} className="border border-border rounded p-2">
                <div className="text-xs text-muted-foreground">{k.metric} · {k.timeframe}</div>
                <div className="font-mono text-sm">{k.target}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risks */}
      {strategy.risks.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Risker</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {strategy.risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
