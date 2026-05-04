import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Target, CheckCircle2, AlertTriangle, Trash2, Sparkles, Lock, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import type { GoalProgress, PeriodKpis, RankingRow } from "@/lib/performance";

export type GoalSource = "gsc" | "ga4" | "ads" | "combined";

interface Props {
  projectId: string;
  goals: GoalProgress[];
  current?: PeriodKpis;
  rankings?: RankingRow[];
  extraMetrics?: Record<string, number | null | undefined>;
  availableSources: Record<GoalSource, boolean>;
  onChanged: () => void;
}

interface MetricTemplate {
  value: string;
  label: string;
  source: GoalSource;
  direction: "increase" | "decrease";
  suffix: string;
  placeholder: string;
  help: string;
  format?: (v: number) => string;
}

const METRIC_TEMPLATES: MetricTemplate[] = [
  // GSC / Organic
  { value: "clicks", source: "gsc", label: "Organiska klick / period", direction: "increase", suffix: "klick", placeholder: "5000", help: "Klick från Google Search. Vanlig start: 1,5–2× nuläget." },
  { value: "top10_share", source: "gsc", label: "% sökord i topp 10", direction: "increase", suffix: "%", placeholder: "75", help: "Andel av era sökord på Googles första sida." },
  { value: "top20_count", source: "gsc", label: "Antal sökord i topp 20", direction: "increase", suffix: "ord", placeholder: "50", help: "Sökord på sida 1 eller 2." },
  { value: "position", source: "gsc", label: "Snittposition (organiskt)", direction: "decrease", suffix: "", placeholder: "8", help: "Genomsnittlig ranking. Lägre = bättre." },

  // GA4
  { value: "ga4_conversions", source: "ga4", label: "Konverteringar / period", direction: "increase", suffix: "st", placeholder: "200", help: "Antal valda key events i GA4 (t.ex. purchase)." },
  { value: "ga4_conv_rate", source: "ga4", label: "Konverteringsgrad", direction: "increase", suffix: "%", placeholder: "3", help: "Andel sessioner som leder till konvertering." },
  { value: "ga4_revenue", source: "ga4", label: "Intäkt (GA4) / period", direction: "increase", suffix: "kr", placeholder: "100000", help: "Total e-handelsintäkt rapporterad av GA4." },
  { value: "ga4_sessions", source: "ga4", label: "Sessioner / period", direction: "increase", suffix: "st", placeholder: "10000", help: "Totalt antal sessioner — alla kanaler." },
  { value: "ga4_engagement_rate", source: "ga4", label: "Engagemangsgrad", direction: "increase", suffix: "%", placeholder: "60", help: "Andel engagerade sessioner (>10s, scroll, event)." },

  // Ads
  { value: "ads_roas", source: "ads", label: "Google Ads ROAS", direction: "increase", suffix: "x", placeholder: "5", help: "Intäkt ÷ annonsspend. 5 = 5 kr in per krona ut." },
  { value: "ads_cpa", source: "ads", label: "Google Ads CPA", direction: "decrease", suffix: "kr", placeholder: "200", help: "Cost per acquisition. Lägre = bättre." },
  { value: "ads_spend", source: "ads", label: "Annonsspend / period", direction: "increase", suffix: "kr", placeholder: "50000", help: "Total spend i Google Ads. Sätt som tak om budget är fixad." },

  // Combined
  { value: "total_revenue", source: "combined", label: "Total intäkt (organiskt + Ads)", direction: "increase", suffix: "kr", placeholder: "500000", help: "Topline från GA4 — fångar all kanalöverskridande effekt." },
  { value: "total_leads", source: "combined", label: "Totalt antal leads / köp", direction: "increase", suffix: "st", placeholder: "300", help: "Sammanlagd konvertering över alla kanaler." },
];

const SOURCE_LABELS: Record<GoalSource, string> = {
  gsc: "Search Console",
  ga4: "GA4",
  ads: "Google Ads",
  combined: "GA4 (alla kanaler)",
};

function getCurrentValue(metric: string, current?: PeriodKpis, rankings?: RankingRow[], extra?: Record<string, number | null | undefined>): number | null {
  if (metric === "clicks") return current?.clicks ?? null;
  if (metric === "position") return current?.position ?? null;
  if (metric === "top10_share") return current ? Math.round(current.topTenShare * 100) : null;
  if (metric === "top20_count") return rankings ? rankings.filter((r) => r.position > 0 && r.position <= 20).length : null;
  const v = extra?.[metric];
  return v == null ? null : Number(v);
}

function suggestTarget(metric: string, currentVal: number | null): number | null {
  if (currentVal === null || currentVal === 0) return null;
  if (metric === "position") return Math.max(1, Math.floor(currentVal - 3));
  if (metric === "top10_share") return Math.min(100, Math.round(currentVal + 15));
  if (metric === "ads_cpa") return Math.max(1, Math.round(currentVal * 0.8));
  if (metric === "ads_roas") return +(currentVal * 1.25).toFixed(1);
  if (metric === "ga4_conv_rate" || metric === "ga4_engagement_rate") return Math.min(100, +(currentVal * 1.2).toFixed(1));
  // default: +50%
  return Math.max(1, Math.round(currentVal * 1.5));
}

function formatVal(metric: string, v: number): string {
  const tpl = METRIC_TEMPLATES.find((t) => t.value === metric);
  if (!tpl) return String(v);
  if (tpl.suffix === "%") return `${v.toFixed(1)}%`;
  if (tpl.suffix === "x") return `${v.toFixed(2)}×`;
  if (tpl.suffix === "kr") return Math.round(v).toLocaleString("sv-SE") + " kr";
  if (metric === "position") return v.toFixed(1);
  return Math.round(v).toLocaleString("sv-SE");
}

export function GoalsProgress({ projectId, goals, current, rankings, extraMetrics, availableSources, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState("clicks");
  const [targetValue, setTargetValue] = useState("");
  const [label, setLabel] = useState("");
  const [timeframe, setTimeframe] = useState("quarter");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { clientId } = useParams();

  const tpl = METRIC_TEMPLATES.find((t) => t.value === metric)!;
  const currentVal = useMemo(() => getCurrentValue(metric, current, rankings, extraMetrics), [metric, current, rankings, extraMetrics]);
  const suggested = useMemo(() => suggestTarget(metric, currentVal), [metric, currentVal]);
  const sourceAvailable = availableSources[tpl.source];

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

  // Gruppera templates per källa
  const grouped = useMemo(() => {
    const g: Record<GoalSource, MetricTemplate[]> = { gsc: [], ga4: [], ads: [], combined: [] };
    for (const t of METRIC_TEMPLATES) g[t.source].push(t);
    return g;
  }, []);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Mål & framsteg
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sätt mål för organiskt, GA4-konverteringar, Ads — eller hela tratten.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till mål
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nytt mål</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Mått</Label>
                <Select value={metric} onValueChange={(v) => { setMetric(v); setTargetValue(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(grouped) as GoalSource[]).map((src) => (
                      <div key={src}>
                        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono flex items-center justify-between">
                          <span>{SOURCE_LABELS[src]}</span>
                          {!availableSources[src] && <span className="text-[9px] normal-case">(ej kopplat)</span>}
                        </div>
                        {grouped[src].map((t) => {
                          const disabled = !availableSources[t.source];
                          return (
                            <SelectItem key={t.value} value={t.value} disabled={disabled}>
                              <span className="flex items-center gap-2">
                                {disabled && <Lock className="h-3 w-3" />}
                                {t.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[tpl.source]}</Badge>
                  <p className="text-[11px] text-muted-foreground">{tpl.help}</p>
                </div>
                {!sourceAvailable && (
                  <div className="mt-2 p-2 rounded border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {tpl.source === "ga4" && "Koppla GA4 i Inställningar för att aktivera detta mått."}
                      {tpl.source === "ads" && "Koppla Google Ads i Inställningar för att aktivera detta mått."}
                      {tpl.source === "combined" && "Koppla GA4 i Inställningar — krävs för totalmått."}
                    </span>
                  </div>
                )}
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
                    disabled={!sourceAvailable}
                  />
                  {suggested !== null && sourceAvailable && (
                    <Button type="button" variant="outline" size="sm" onClick={onSuggest} className="shrink-0">
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Föreslå
                    </Button>
                  )}
                </div>
                {currentVal !== null && sourceAvailable && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Ni ligger på <span className="font-mono text-foreground">{formatVal(metric, currentVal)}</span> idag
                    {suggested !== null && <> — föreslaget mål: <span className="font-mono text-primary">{formatVal(metric, suggested)}</span></>}
                  </p>
                )}
                {currentVal === null && sourceAvailable && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Inget nuläge ännu — hämta data från källan för att få förslag.
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
              <Button onClick={onSave} disabled={saving || !targetValue || !sourceAvailable}>Spara mål</Button>
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
            {goals.map((g) => {
              const gtpl = METRIC_TEMPLATES.find((t) => t.value === g.target.metric);
              return (
                <div key={g.target.id} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-sm gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {g.status === "achieved" ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      ) : g.status === "on_track" ? (
                        <Target className="h-4 w-4 text-primary/70 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="font-medium truncate">{g.target.label}</span>
                      {gtpl && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {SOURCE_LABELS[gtpl.source]}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">({g.target.timeframe})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm">
                        {formatVal(g.target.metric, g.currentValue)}
                        <span className="text-muted-foreground"> / {formatVal(g.target.metric, g.target.target_value)}</span>
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
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
