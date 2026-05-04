// OnboardingChecklist — visar nästa steg en kund behöver ta för att låsa upp
// hela plattformen. Försvinner när allt är klart.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ArrowRight, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

export function OnboardingChecklist({ projectId }: Props) {
  const caps = useProjectCapabilities(projectId);
  const navigate = useNavigate();
  const base = `/clients/${projectId}`;

  if (caps.loading) return null;

  const steps = [
    { done: caps.hasGoals, label: "Sätt mål & konverteringsvärde", desc: "Vad räknas som vinst för den här kunden?", to: `${base}/settings`, key: "goals" },
    { done: caps.hasBrandKit, label: "Brand Kit", desc: "Färger, typsnitt, logo — för exporter och rapporter.", to: `${base}/brand-kit`, key: "brand" },
    { done: caps.hasGA4 || caps.hasGSC, label: "Koppla GA4 + Search Console", desc: "Krävs för dashboards, briefings och alerts.", to: `${base}/settings`, key: "ga4" },
    { done: caps.hasAds, label: "Koppla Google Ads", desc: "Aktiverar Ads Audit, PPC-chat och pacing.", to: `${base}/settings`, key: "ads" },
    { done: caps.hasAnalysis || caps.hasPrelaunch, label: "Kör första analysen", desc: "Sökordsuniversum, kluster och sajt-skanning.", to: `/project/${projectId}`, key: "analysis" },
    { done: caps.hasKpiTargets, label: "Sätt KPI-mål", desc: "Vad ska vi nå? Trafik, konvertering, intäkt.", to: `${base}/settings`, key: "kpi" },
    { done: caps.hasBaseline, label: "Skapa baseline-snapshot", desc: "Nuläge att mäta åtgärder mot.", to: `${base}/performance`, key: "baseline" },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = doneCount === total;

  if (allDone) return null;

  const pct = Math.round((doneCount / total) * 100);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-serif text-lg">Kom igång — {doneCount}/{total} klara</CardTitle>
            <CardDescription>Slutför stegen för att låsa upp hela plattformen.</CardDescription>
          </div>
          <div className="text-right">
            <div className="font-serif text-3xl text-primary">{pct}%</div>
          </div>
        </div>
        <Progress value={pct} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map(step => (
          <button
            key={step.key}
            onClick={() => !step.done && navigate(step.to)}
            disabled={step.done}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors",
              step.done
                ? "border-emerald-500/20 bg-emerald-500/5 cursor-default"
                : "border-border hover:border-primary/40 hover:bg-card cursor-pointer",
            )}
          >
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
              step.done ? "bg-emerald-500/20" : "bg-muted",
            )}>
              {step.done ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                {step.label}
              </div>
              <div className="text-xs text-muted-foreground">{step.desc}</div>
            </div>
            {!step.done && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
