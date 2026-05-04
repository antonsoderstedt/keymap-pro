import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, Activity, Target, RefreshCw, AlertTriangle, ListTree } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

interface EventRow { eventName: string; eventCount: number; conversions: number; keyEvents: number; }

export default function Ga4Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [range, setRange] = useState("28daysAgo");

  const load = useCallback(async () => {
    if (!id) return;
    const { data: settings } = await supabase
      .from("project_google_settings").select("ga4_property_id").eq("project_id", id).maybeSingle();
    setPropertyId(settings?.ga4_property_id || null);

    const { data } = await supabase
      .from("ga4_snapshots").select("*").eq("project_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setSnapshot(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    if (!propertyId) return toast.error("Koppla GA4-property under Inställningar först");
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("ga4-fetch", {
        body: {
          action: "report",
          propertyId,
          projectId: id,
          startDate: range,
          endDate: "today",
          dimensions: [{ name: "sessionSourceMedium" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "conversions" }],
          limit: 25,
          persist: true,
        },
      });
      if (error) throw error;
      toast.success("GA4 uppdaterad");
      await load();
    } catch (e: any) {
      toast.error("Misslyckades: " + e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const rows: any[] = (snapshot?.rows as any[]) || [];
  const totals = snapshot?.totals || {};

  const bySource: Record<string, number> = {};
  rows.forEach((r) => {
    const key = r.sessionSourceMedium || r.sourceMedium || r.source || r.channelGroup || "Other";
    bySource[key] = (bySource[key] || 0) + (r.sessions || r.users || 0);
  });
  const sourceData = Object.entries(bySource)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 6);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">GA4 Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trafik, sessioner, konvertering — kopplat till åtgärder och kanaler.
            {snapshot?.created_at && <> Senast uppdaterad {new Date(snapshot.created_at).toLocaleString("sv-SE")}.</>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7daysAgo">7 dagar</SelectItem>
              <SelectItem value="28daysAgo">28 dagar</SelectItem>
              <SelectItem value="90daysAgo">90 dagar</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={refresh} disabled={refreshing || !propertyId} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Hämtar…" : "Hämta nu"}
          </Button>
        </div>
      </div>

      {!propertyId && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Ingen GA4-property kopplad. Gå till Inställningar → Övriga kopplingar.
          </CardContent>
        </Card>
      )}

      {!snapshot && propertyId && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Ingen GA4-data än. Klicka "Hämta nu".
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Användare" value={totals.users ?? totals.totalUsers ?? rows.reduce((s, r) => s + (r.users || r.totalUsers || 0), 0)} icon={Users} />
            <Kpi label="Sessioner" value={totals.sessions ?? rows.reduce((s, r) => s + (r.sessions || 0), 0)} icon={Activity} />
            <Kpi label="Sidvisningar" value={totals.pageviews ?? totals.screenPageViews ?? rows.reduce((s, r) => s + (r.pageviews || r.screenPageViews || 0), 0)} icon={Eye} />
            <Kpi label="Konverteringar" value={totals.conversions ?? rows.reduce((s, r) => s + (r.conversions || 0), 0)} icon={Target} />
          </div>

          {sourceData.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="font-serif text-lg">Trafikkällor</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                          {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="font-serif text-lg">Topp-källor (sessioner)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={sourceData} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={100} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="font-serif text-3xl">{typeof value === "number" ? value.toLocaleString("sv-SE") : value}</div>
      </CardContent>
    </Card>
  );
}
