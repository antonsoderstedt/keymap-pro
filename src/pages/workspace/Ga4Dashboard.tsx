import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Eye, Activity, Target } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function Ga4Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("ga4_snapshots")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSnapshot(data);
      setLoading(false);
    })();
  }, [id]);

  const rows: any[] = (snapshot?.rows as any[]) || [];
  const totals = snapshot?.totals || {};

  // Group by source/medium if exists
  const bySource: Record<string, number> = {};
  rows.forEach((r) => {
    const key = r.sourceMedium || r.source || r.channelGroup || "Other";
    bySource[key] = (bySource[key] || 0) + (r.sessions || r.users || 0);
  });
  const sourceData = Object.entries(bySource)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">GA4 Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trafik, sessioner, konvertering — kopplat till åtgärder och kanaler.
        </p>
      </div>

      {!snapshot && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Ingen GA4-data ännu. Koppla Google Analytics under Inställningar.
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Användare" value={totals.users ?? rows.reduce((s, r) => s + (r.users || 0), 0)} icon={Users} />
            <Kpi label="Sessioner" value={totals.sessions ?? rows.reduce((s, r) => s + (r.sessions || 0), 0)} icon={Activity} />
            <Kpi label="Sidvisningar" value={totals.pageviews ?? rows.reduce((s, r) => s + (r.pageviews || 0), 0)} icon={Eye} />
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
