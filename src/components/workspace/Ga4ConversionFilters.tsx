import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Target, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  event_name: string;
  mode: string;
  is_active: boolean;
}

const COMMON_EVENTS = ["purchase", "form_submit", "generate_lead", "sign_up", "begin_checkout", "add_to_cart", "contact"];

export default function Ga4ConversionFilters({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [event, setEvent] = useState("");
  const [mode, setMode] = useState<"allow" | "deny">("allow");

  const load = async () => {
    const { data } = await supabase
      .from("ga4_conversion_filters")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    setRows((data as Row[]) || []);
  };
  useEffect(() => { load(); }, [projectId]);

  const allowMode = rows.some((r) => r.mode === "allow" && r.is_active);

  const add = async (eventName?: string, m?: "allow" | "deny") => {
    const name = (eventName ?? event).trim();
    if (!name) return toast.error("Skriv ett event-namn");
    const { error } = await supabase.from("ga4_conversion_filters").insert({
      project_id: projectId,
      event_name: name,
      mode: m ?? mode,
    });
    if (error) return toast.error(error.message);
    setEvent("");
    load();
  };

  const toggle = async (id: string, is_active: boolean) => {
    await supabase.from("ga4_conversion_filters").update({ is_active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ga4_conversion_filters").delete().eq("id", id);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> GA4 konverterings-events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Filtrera vilka GA4-events som räknas som "konverteringar" i Slay Station.
          {" "}<strong>Allow</strong> = endast dessa räknas. <strong>Deny</strong> = uteslut dessa.
          {" "}Lämna tomt för att använda alla GA4 key events. Användbart om GA4-property har felmarkerade key events (t.ex. <code>page_view</code>).
        </p>

        <div className="flex flex-wrap gap-2">
          {COMMON_EVENTS.map((e) => (
            <Button key={e} size="sm" variant="outline" onClick={() => add(e, "allow")}>
              + allow: {e}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Event-namn</Label>
            <Input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="t.ex. purchase" />
          </div>
          <div>
            <Label className="text-xs">Läge</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "allow" | "deny")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => add()} className="gap-1"><Plus className="h-3 w-3" /> Lägg till</Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Inga filter — alla GA4 key events räknas.</p>
        ) : (
          <div className="space-y-2">
            {allowMode && (
              <p className="text-[11px] text-muted-foreground">
                Allow-läge aktivt: endast events nedan med läge "allow" räknas.
              </p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono">{r.event_name}</div>
                </div>
                <Badge variant={r.mode === "allow" ? "default" : "outline"} className="text-[10px]">
                  {r.mode === "allow" ? "ALLOW" : "DENY"}
                </Badge>
                <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, v)} />
                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
