import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  id: string;
  rule_type: string;
  mode: string;
  is_active: boolean;
  config: Record<string, any>;
  created_at: string;
}

const RULE_TYPES = [
  { value: "pause_low_roas", label: "Pausa kampanj vid låg ROAS", defaults: { threshold: 1.0, days: 14 } },
  { value: "increase_budget_high_is_lost_budget", label: "Höj budget när IS-lost-budget > X%", defaults: { threshold: 20, days: 14 } },
  { value: "negative_keyword_high_cost_no_conv", label: "Lägg till negativa kw (hög kostnad, 0 konv)", defaults: { min_cost: 500, days: 30 } },
  { value: "alert_organic_drop", label: "Alert vid organisk klick-tapp", defaults: { drop_pct: 20, days: 7 } },
  { value: "alert_position_loss", label: "Alert när top-3 keyword tappar position", defaults: { positions: 3, days: 14 } },
];

const MODES = [
  { value: "suggest", label: "Föreslå (skapa åtgärd)" },
  { value: "alert", label: "Bara notifiera" },
  { value: "auto", label: "Auto (när stöd finns)" },
];

export default function AutomationRules({ projectId }: { projectId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ rule_type: RULE_TYPES[0].value, mode: "suggest", threshold: "1.0", days: "14" });

  const load = async () => {
    const { data } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setRules((data as Rule[]) ?? []);
  };

  useEffect(() => { load(); }, [projectId]);

  const addRule = async () => {
    const preset = RULE_TYPES.find((r) => r.value === draft.rule_type);
    const config: any = { ...preset?.defaults };
    if (draft.threshold) config.threshold = parseFloat(draft.threshold);
    if (draft.days) config.days = parseInt(draft.days, 10);
    const { error } = await supabase.from("automation_rules").insert({
      project_id: projectId,
      rule_type: draft.rule_type,
      mode: draft.mode,
      config,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Regel skapad");
      setShowForm(false);
      setDraft({ rule_type: RULE_TYPES[0].value, mode: "suggest", threshold: "1.0", days: "14" });
      load();
    }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await supabase.from("automation_rules").update({ is_active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("automation_rules").delete().eq("id", id);
    load();
  };

  const selectedType = RULE_TYPES.find((r) => r.value === draft.rule_type);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Automation-regler
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
            <Plus className="h-3 w-3" /> Lägg till
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Regler körs när alerts/monitor-jobben triggas. "Föreslå" skapar en åtgärd i Action Tracker.
        </p>

        {showForm && (
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div>
              <Label>Regeltyp</Label>
              <Select value={draft.rule_type} onValueChange={(v) => {
                const p = RULE_TYPES.find((r) => r.value === v)!;
                setDraft({ ...draft, rule_type: v, threshold: String(p.defaults.threshold ?? p.defaults.min_cost ?? p.defaults.drop_pct ?? ""), days: String(p.defaults.days ?? "") });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Tröskel</Label>
                <Input type="number" step="0.1" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} />
              </div>
              <div>
                <Label>Fönster (dagar)</Label>
                <Input type="number" value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} />
              </div>
              <div>
                <Label>Läge</Label>
                <Select value={draft.mode} onValueChange={(v) => setDraft({ ...draft, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedType && (
              <p className="text-xs text-muted-foreground">{selectedType.label}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={addRule}>Spara regel</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Avbryt</Button>
            </div>
          </div>
        )}

        {rules.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Inga regler — lägg till för att aktivera proaktiv övervakning.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => {
              const label = RULE_TYPES.find((t) => t.value === r.rule_type)?.label ?? r.rule_type;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      tröskel: {r.config?.threshold ?? r.config?.min_cost ?? r.config?.drop_pct ?? "—"}
                      {" · "}fönster: {r.config?.days ?? "—"}d
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{MODES.find((m) => m.value === r.mode)?.label ?? r.mode}</Badge>
                  <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
