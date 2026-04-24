import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Target, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface KpiTarget {
  id: string;
  metric: string;
  label: string;
  target_value: number;
  direction: string;
  timeframe: string;
  channel: string | null;
  is_active: boolean;
}

const METRIC_PRESETS = [
  { metric: "organic_clicks", label: "Organiska klick", direction: "increase", timeframe: "month" },
  { metric: "conversions", label: "Konverteringar", direction: "increase", timeframe: "month" },
  { metric: "roas", label: "ROAS", direction: "increase", timeframe: "month" },
  { metric: "cpa", label: "CPA (kr)", direction: "decrease", timeframe: "month" },
  { metric: "ctr", label: "CTR (%)", direction: "increase", timeframe: "month" },
  { metric: "avg_position", label: "Snittposition (SEO)", direction: "decrease", timeframe: "month" },
];

export default function WorkspaceSettings() {
  const { id } = useParams<{ id: string }>();
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ metric: "organic_clicks", label: "Organiska klick", target_value: "", direction: "increase", timeframe: "month" });

  const load = async () => {
    if (!id) return;
    const { data } = await supabase.from("kpi_targets").select("*").eq("project_id", id).order("created_at", { ascending: false });
    setTargets((data as KpiTarget[]) || []);
  };
  useEffect(() => { load(); }, [id]);

  const addTarget = async () => {
    if (!id || !form.target_value) return;
    const { error } = await supabase.from("kpi_targets").insert({
      project_id: id,
      metric: form.metric,
      label: form.label,
      target_value: parseFloat(form.target_value),
      direction: form.direction,
      timeframe: form.timeframe,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Mål sparat");
      setShowForm(false);
      setForm({ metric: "organic_clicks", label: "Organiska klick", target_value: "", direction: "increase", timeframe: "month" });
      load();
    }
  };

  const deleteTarget = async (tid: string) => {
    await supabase.from("kpi_targets").delete().eq("id", tid);
    load();
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <SettingsIcon className="h-7 w-7 text-primary" /> Inställningar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          KPI-mål, automation-regler, kopplingar.
        </p>
      </div>

      {/* KPI Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> KPI-mål
            </CardTitle>
            <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
              <Plus className="h-3 w-3" /> Lägg till
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showForm && (
            <div className="p-4 rounded-lg border border-border space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Metric</Label>
                  <Select
                    value={form.metric}
                    onValueChange={(v) => {
                      const p = METRIC_PRESETS.find(x => x.metric === v);
                      if (p) setForm({ ...form, metric: v, label: p.label, direction: p.direction, timeframe: p.timeframe });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_PRESETS.map(p => <SelectItem key={p.metric} value={p.metric}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mål-värde</Label>
                  <Input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="t.ex. 5000" />
                </div>
                <div>
                  <Label>Riktning</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">Öka mot</SelectItem>
                      <SelectItem value="decrease">Minska till</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tidsfönster</Label>
                  <Select value={form.timeframe} onValueChange={(v) => setForm({ ...form, timeframe: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Vecka</SelectItem>
                      <SelectItem value="month">Månad</SelectItem>
                      <SelectItem value="quarter">Kvartal</SelectItem>
                      <SelectItem value="year">År</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addTarget}>Spara mål</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Avbryt</Button>
              </div>
            </div>
          )}
          {targets.length === 0 && !showForm ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Inga KPI-mål satta. Sätt mål för att få avvikelse-alerts.
            </p>
          ) : (
            <div className="space-y-2">
              {targets.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.direction === "increase" ? "Öka mot" : "Minska till"} <span className="font-medium">{t.target_value}</span> per {t.timeframe}
                    </div>
                  </div>
                  <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px]">{t.is_active ? "aktiv" : "pausad"}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => deleteTarget(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connections placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Kopplingar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ConnectionRow name="Google Search Console" status="se på workspace" />
          <ConnectionRow name="Google Analytics 4" status="se på workspace" />
          <ConnectionRow name="Google Ads" status="kräver developer token" warning />
          <ConnectionRow name="Semrush" status="aktiv (global)" />
          <ConnectionRow name="DataForSEO" status="aktiv (global)" />
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectionRow({ name, status, warning }: { name: string; status: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span>{name}</span>
      <Badge variant={warning ? "outline" : "secondary"} className="text-[10px]">{status}</Badge>
    </div>
  );
}
