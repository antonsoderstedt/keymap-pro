import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target, CheckCircle2, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GoalProgress, PeriodKpis, RankingRow } from "@/lib/performance";

interface Props {
  projectId: string;
  goals: GoalProgress[];
  current?: PeriodKpis;
  rankings?: RankingRow[];
  onChanged: () => void;
}

const METRIC_TEMPLATES = [
  {
    value: "clicks",
    label: "Organiska klick / period",
    direction: "increase" as const,
    suffix: "klick",
    placeholder: "5000",
    help: "Hur många klick från Google ni vill ha. Vanlig start: 1,5–2× nuläget.",
  },
  {
    value: "top10_share",
    label: "% av sökord i topp 10",
    direction: "increase" as const,
    suffix: "%",
    placeholder: "75",
    help: "Andel av era sökord som ligger på Googles första sida.",
  },
  {
    value: "top20_count",
    label: "Antal sökord i topp 20",
    direction: "increase" as const,
    suffix: "ord",
    placeholder: "50",
    help: "Sökord som rankar på sida 1 eller 2.",
  },
  {
    value: "position",
    label: "Snittposition",
    direction: "decrease" as const,
    suffix: "",
    placeholder: "8",
    help: "Genomsnittlig ranking. Lägre = bättre. 1–10 = första sidan.",
  },
];

function getCurrentValue(metric: string, current?: PeriodKpis, rankings?: RankingRow[]): number | null {
  if (!current) return null;
  if (metric === "clicks") return current.clicks;
  if (metric === "position") return current.position;
  if (metric === "top10_share") return Math.round(current.topTenShare * 100);
  if (metric === "top20_count") return rankings ? rankings.filter((r) => r.position > 0 && r.position <= 20).length : null;
  return null;
}

function suggestTarget(metric: string, currentVal: number | null): number | null {
  if (currentVal === null) return null;
  if (metric === "clicks") return Math.max(100, Math.round(currentVal * 1.5));
  if (metric === "position") return Math.max(1, Math.floor(currentVal - 3));
  if (metric === "top10_share") return Math.min(100, Math.round(currentVal + 15));
  if (metric === "top20_count") return currentVal + 20;
  return null;
}

function formatVal(metric: string, v: number): string {
  if (metric === "top10_share") return `${v}%`;
  if (metric === "position") return v.toFixed(1);
  return Math.round(v).toLocaleString("sv-SE");
}

export function GoalsProgress({ projectId, goals, current, rankings, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState("clicks");
  const [targetValue, setTargetValue] = useState("");
  const [label, setLabel] = useState("");
  const [timeframe, setTimeframe] = useState("quarter");
  const [saving, setSaving] = useState(false);

  const tpl = METRIC_TEMPLATES.find((t) => t.value === metric)!;
  const currentVal = useMemo(() => getCurrentValue(metric, current, rankings), [metric, current, rankings]);
  const suggested = useMemo(() => suggestTarget(metric, currentVal), [metric, currentVal]);

  const onSuggest = () => {
    if (suggested !== null) setTargetValue(String(suggested));
  };

  const onSave = async () => {
    if (!targetValue) return;
    setSaving(true);
    const { error } = await supabase.from("kpi_targets").insert({
      project_id: projectId,
      metric,
      label: label || tpl.label,
      target_value: parseFloat(targetValue),
      direction: tpl.direction,
      timeframe,
      is_active: true,
    });
    setSaving(false);
    if (error) toast.error("Kunde inte spara mål");
    else {
      toast.success("Mål skapat");
      setOpen(false);
      setTargetValue("");
      setLabel("");
      onChanged();
    }
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("kpi_targets").delete().eq("id", id);
    if (error) toast.error("Kunde inte ta bort");
    else {
      toast.success("Mål borttaget");
      onChanged();
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Mål & framsteg
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sätt mål så vi kan jobba mot dem och mäta progress.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till mål
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nytt mål</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Mått</Label>
                <Select value={metric} onValueChange={(v) => { setMetric(v); setTargetValue(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRIC_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1.5">{tpl.help}</p>
              </div>
              <div>
                <Label className="text-xs">
                  Målvärde {tpl.direction === "decrease" && <span className="text-muted-foreground">(lägre = bättre)</span>}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder={tpl.placeholder}
                  />
                  {suggested !== null && (
                    <Button type="button" variant="outline" size="sm" onClick={onSuggest} className="shrink-0">
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Föreslå
                    </Button>
                  )}
                </div>
                {currentVal !== null && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Ni ligger på <span className="font-mono text-foreground">{formatVal(metric, currentVal)}</span> idag
                    {suggested !== null && <> — föreslaget mål: <span className="font-mono text-primary">{formatVal(metric, suggested)}</span></>}
                  </p>
                )}
                {currentVal === null && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Inget nuläge ännu — koppla GSC och hämta historik för att få förslag.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Tidsram</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Månad</SelectItem>
                    <SelectItem value="quarter">Kvartal</SelectItem>
                    <SelectItem value="year">År</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Beskrivning (valfritt)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tpl.label} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onSave} disabled={saving || !targetValue}>Spara mål</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Inga mål satta än. Lägg till ett för att börja mäta.
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.target.id} className="space-y-1.5 group">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {g.status === "achieved" ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : g.status === "on_track" ? (
                      <Target className="h-4 w-4 text-primary/70" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-medium">{g.target.label}</span>
                    <span className="text-xs text-muted-foreground">({g.target.timeframe})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {formatGoalValue(g.currentValue, g.target.metric)}
                      <span className="text-muted-foreground"> / {formatGoalValue(g.target.target_value, g.target.metric)}</span>
                    </span>
                    <button
                      onClick={() => onDelete(g.target.id)}
                      className="text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Progress value={g.progressPct} className={cn("h-2", g.status === "achieved" && "[&>div]:bg-primary")} />
                <div className="text-[11px] text-muted-foreground">
                  {g.status === "achieved"
                    ? "Mål uppnått 🎉"
                    : g.status === "on_track"
                      ? `På rätt väg — ${g.progressPct.toFixed(0)}% av målet.`
                      : `Behöver mer fokus — ${g.progressPct.toFixed(0)}% av målet.`}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatGoalValue(v: number, metric: string): string {
  if (metric === "top10_share") return v.toFixed(0) + "%";
  if (metric === "position") return v.toFixed(1);
  return Math.round(v).toLocaleString("sv-SE");
}
