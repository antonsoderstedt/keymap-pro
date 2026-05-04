// OnboardingChecklist — visar nästa steg en kund behöver ta för att låsa upp
// hela plattformen. Försvinner när allt är klart, kan kollapsas annars.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ArrowRight, Lock, ChevronDown, ChevronRight } from "lucide-react";
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
  const storageKey = `onboarding-collapsed:${projectId}`;
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  if (caps.loading) return null;

  const steps = [
    { done: caps.hasGoals, label: "Sätt mål & konverteringsvärde", desc: "Vad räknas som vinst för den här kunden?", to: `${base}/settings`, key: "goals" },
    { done: caps.hasBrandKit, label: "Brand Kit", desc: "Färger, typsnitt, logo — för exporter och rapporter.", to: `${base}/brand-kit`, key: "brand" },
    { done: caps.hasGA4 || caps.hasGSC, label: "Koppla GA4 + Search Console", desc: "Krävs för dashboards, briefings och alerts.", to: `${base}/settings`, key: "ga4" },
    { done: caps.hasAds, label: "Koppla Google Ads", desc: "Aktiverar Ads Audit, PPC-chat och pacing.", to: `${base}/settings`, key: "ads" },
    { done: caps.hasAnalysis || caps.hasPrelaunch, label: "Kör första analysen", desc: "Sökordsuniversum, kluster och sajt-skanning.", to: `/project/${projectId}`, key: "analysis" },
    { done: caps.hasKpiTargets, label: "Sätt minst ett KPI-mål", desc: "Välj t.ex. 'Organiska klick / period' — vi föreslår ett rimligt värde baserat på er trafik.", to: `${base}/performance`, key: "kpi" },
    { done: caps.hasBaseline, label: "Skapa baseline-snapshot", desc: "Frys nuläget — klicka 'Skapa baseline' på Performance-sidan.", to: `${base}/performance`, key: "baseline" },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = doneCount === total;
  const pct = Math.round((doneCount / total) * 100);

  // Auto-collapse när nästan klar (>= total - 1), om användaren inte explicit valt
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      setCollapsed(doneCount >= total - 1 && !allDone);
    } else {
      setCollapsed(stored === "1");
    }
  }, [storageKey, doneCount, total, allDone]);

  if (allDone) return null;
  if (collapsed === null) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  };

  if (collapsed) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-card">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-primary/5 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-serif text-base">Kom igång — {doneCount}/{total} klara</div>
              <Progress value={pct} className="mt-1.5 h-1.5" />
            </div>
          </div>
          <div className="font-serif text-xl text-primary shrink-0">{pct}%</div>
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <button onClick={toggle} className="flex items-start gap-2 text-left flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <ChevronDown className="h-4 w-4 text-muted-foreground mt-1.5 shrink-0" />
            <div>
              <CardTitle className="font-serif text-lg">Kom igång — {doneCount}/{total} klara</CardTitle>
              <CardDescription>Slutför stegen för att låsa upp hela plattformen.</CardDescription>
            </div>
          </button>
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
