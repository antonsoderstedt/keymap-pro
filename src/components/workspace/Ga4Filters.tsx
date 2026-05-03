import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Ga4Filter {
  id: string;
  label: string;
  dimension: string;
  operator: string;
  value: string;
  exclude: boolean;
  is_active: boolean;
}

const PRESETS = [
  { label: "Exkludera /admin", dimension: "pagePath", operator: "CONTAINS", value: "/admin", exclude: true },
  { label: "Exkludera intern (utm_source=internal)", dimension: "sessionSource", operator: "EXACT", value: "internal", exclude: true },
  { label: "Exkludera bot-trafik", dimension: "deviceCategory", operator: "EXACT", value: "bot", exclude: true },
  { label: "Endast Sverige", dimension: "country", operator: "EXACT", value: "Sweden", exclude: false },
];

const DIMENSIONS = ["pagePath", "pageLocation", "sessionSource", "sessionMedium", "sessionSourceMedium", "country", "city", "deviceCategory", "browser"];
const OPERATORS = ["CONTAINS", "EXACT", "BEGINS_WITH", "ENDS_WITH"];

export default function Ga4Filters({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Ga4Filter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ label: "", dimension: "pagePath", operator: "CONTAINS", value: "", exclude: true });

  const load = async () => {
    const { data } = await supabase.from("ga4_filters").select("*").eq("project_id", projectId).order("created_at");
    setRows((data as Ga4Filter[]) || []);
  };
  useEffect(() => { load(); }, [projectId]);

  const add = async (preset?: typeof PRESETS[number]) => {
    const f = preset ?? draft;
    if (!f.value || !f.label) return toast.error("Etikett och värde krävs");
    const { error } = await supabase.from("ga4_filters").insert({
      project_id: projectId,
      label: f.label, dimension: f.dimension, operator: f.operator, value: f.value, exclude: f.exclude,
    });
    if (error) return toast.error(error.message);
    toast.success("Filter sparat");
    setShowForm(false);
    setDraft({ label: "", dimension: "pagePath", operator: "CONTAINS", value: "", exclude: true });
    load();
  };

  const toggle = async (id: string, is_active: boolean) => {
    await supabase.from("ga4_filters").update({ is_active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ga4_filters").delete().eq("id", id);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" /> GA4-filter
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1"><Plus className="h-3 w-3" /> Nytt filter</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Filter appliceras automatiskt på all GA4-data (dashboards och ROI). Exkludera t.ex. intern admin-trafik.
        </p>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" variant="outline" onClick={() => add(p)}>+ {p.label}</Button>
          ))}
        </div>

        {showForm && (
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>Etikett</Label><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="t.ex. Exkludera /admin" /></div>
              <div><Label>Värde</Label><Input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="/admin" /></div>
              <div><Label>Dimension</Label>
                <Select value={draft.dimension} onValueChange={(v) => setDraft({ ...draft, dimension: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Operator</Label>
                <Select value={draft.operator} onValueChange={(v) => setDraft({ ...draft, operator: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={draft.exclude} onCheckedChange={(v) => setDraft({ ...draft, exclude: v })} />
              <Label className="text-xs">{draft.exclude ? "Exkludera" : "Inkludera endast"} matchande</Label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => add()}>Spara</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Avbryt</Button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Inga filter aktiva.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {r.exclude ? "EXCLUDE" : "INCLUDE"} {r.dimension} {r.operator} "{r.value}"
                  </div>
                </div>
                <Badge variant={r.is_active ? "default" : "outline"} className="text-[10px]">{r.is_active ? "aktiv" : "av"}</Badge>
                <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, v)} />
                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
