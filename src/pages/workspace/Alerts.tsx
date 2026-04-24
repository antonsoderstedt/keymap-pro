import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, RefreshCw, CheckCircle2, X, ArrowRight, Sparkles, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

interface Alert {
  id: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  suggested_action: string | null;
  expected_impact: string | null;
  status: string;
  created_at: string;
}

const SEV: Record<string, { icon: any; color: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-orange-500" },
  info: { icon: Info, color: "text-primary" },
};

export default function Alerts() {
  const { id } = useParams<{ id: string }>();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data } = await supabase.from("alerts").select("*").eq("project_id", id).order("created_at", { ascending: false });
    setAlerts((data as Alert[]) || []);
  };
  useEffect(() => { load(); }, [id]);

  const runMonitor = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("ads-monitor", { body: { project_id: id } });
      toast.success("Bevakning körd");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const updateStatus = async (a: Alert, status: string) => {
    await supabase.from("alerts").update({
      status, resolved_at: status === "resolved" ? new Date().toISOString() : null,
    }).eq("id", a.id);
    setAlerts(alerts.map(x => x.id === a.id ? { ...x, status } : x));
  };

  const createAction = async (a: Alert) => {
    if (!id) return;
    await supabase.from("action_items").insert({
      project_id: id,
      title: a.title,
      description: a.message,
      category: a.category,
      priority: a.severity === "critical" ? "high" : a.severity === "warning" ? "medium" : "low",
      source_type: "alert",
      source_id: a.id,
      expected_impact: a.expected_impact,
      implementation_notes: a.suggested_action,
    });
    await updateStatus(a, "actioned");
    toast.success("Lade till i Action Tracker");
  };

  const open = alerts.filter(a => a.status === "new");
  const handled = alerts.filter(a => a.status !== "new");

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Bell className="h-7 w-7 text-primary" /> Alerts & Optimeringar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI:n bevakar dina kanaler och föreslår konkreta åtgärder. Ett klick — så hamnar det i Action Tracker.
          </p>
        </div>
        <Button onClick={runMonitor} disabled={running} className="gap-2">
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Kör bevakning nu
        </Button>
      </div>

      {open.length === 0 && handled.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Inga alerts ännu. Klicka "Kör bevakning nu" för att låta AI:n analysera kunden.
          </CardContent>
        </Card>
      )}

      {open.length > 0 && (
        <div>
          <h2 className="font-serif text-xl mb-3">Att åtgärda ({open.length})</h2>
          <div className="space-y-3">
            {open.map(a => <AlertCard key={a.id} alert={a} onAction={createAction} onDismiss={() => updateStatus(a, "dismissed")} />)}
          </div>
        </div>
      )}

      {handled.length > 0 && (
        <div>
          <h2 className="font-serif text-lg mb-3 text-muted-foreground">Hanterade ({handled.length})</h2>
          <div className="space-y-2 opacity-70">
            {handled.slice(0, 10).map(a => (
              <Card key={a.id} className="border-border">
                <CardContent className="p-3 flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{a.title}</span>
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, onAction, onDismiss }: { alert: Alert; onAction: (a: Alert) => void; onDismiss: () => void }) {
  const sev = SEV[alert.severity] || SEV.info;
  const Icon = sev.icon;
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${sev.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px]">{alert.category}</Badge>
              <Badge variant="secondary" className="text-[10px]">{alert.severity}</Badge>
            </div>
            <div className="font-medium text-sm">{alert.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{alert.message}</div>
            {alert.suggested_action && (
              <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20 text-xs">
                <span className="font-medium">Föreslagen åtgärd: </span>{alert.suggested_action}
              </div>
            )}
            {alert.expected_impact && (
              <div className="text-xs text-green-600 mt-1.5">📈 {alert.expected_impact}</div>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => onAction(alert)} className="gap-1">
                <ArrowRight className="h-3 w-3" /> Lägg till i Action Tracker
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss} className="gap-1">
                <X className="h-3 w-3" /> Avfärda
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
