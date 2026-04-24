import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Search, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GscSite { siteUrl: string; permissionLevel: string }
interface Ga4Property { property: string; displayName: string; parent: string }

interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
interface Ga4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

export default function GoogleDataPanel() {
  const { toast } = useToast();
  const [loadingLists, setLoadingLists] = useState(true);
  const [sites, setSites] = useState<GscSite[]>([]);
  const [properties, setProperties] = useState<Ga4Property[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  const [gscLoading, setGscLoading] = useState(false);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [ga4Rows, setGa4Rows] = useState<Ga4Row[]>([]);
  const [ga4Totals, setGa4Totals] = useState<{ sessions: number; users: number } | null>(null);

  useEffect(() => { loadLists(); }, []);

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const [gsc, ga4] = await Promise.all([
        supabase.functions.invoke("gsc-fetch", { body: { action: "sites" } }),
        supabase.functions.invoke("ga4-fetch", { body: { action: "properties" } }),
      ]);
      const gscData: any = gsc.data;
      const ga4Data: any = ga4.data;
      const siteList: GscSite[] = gscData?.siteEntry || [];
      setSites(siteList);
      if (siteList.length && !selectedSite) setSelectedSite(siteList[0].siteUrl);

      const propList: Ga4Property[] = [];
      (ga4Data?.accountSummaries || []).forEach((acc: any) => {
        (acc.propertySummaries || []).forEach((p: any) => {
          propList.push({ property: p.property, displayName: p.displayName, parent: acc.displayName });
        });
      });
      setProperties(propList);
      if (propList.length && !selectedProperty) setSelectedProperty(propList[0].property);
    } catch (e: any) {
      toast({ title: "Kunde inte hämta listor", description: e.message, variant: "destructive" });
    } finally {
      setLoadingLists(false);
    }
  };

  const fetchGsc = async () => {
    if (!selectedSite) return;
    setGscLoading(true);
    const endDate = new Date().toISOString().slice(0, 10);
    const start = new Date(); start.setDate(start.getDate() - 28);
    const startDate = start.toISOString().slice(0, 10);
    const { data, error } = await supabase.functions.invoke("gsc-fetch", {
      body: { action: "query", siteUrl: selectedSite, startDate, endDate, dimensions: ["query"], rowLimit: 25 },
    });
    setGscLoading(false);
    if (error) { toast({ title: "GSC-fel", description: error.message, variant: "destructive" }); return; }
    setGscRows((data as any)?.rows || []);
  };

  const fetchGa4 = async () => {
    if (!selectedProperty) return;
    setGa4Loading(true);
    const id = selectedProperty.replace("properties/", "");
    const { data, error } = await supabase.functions.invoke("ga4-fetch", {
      body: {
        action: "report",
        propertyId: id,
        startDate: "28daysAgo",
        endDate: "today",
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        limit: 100,
      },
    });
    setGa4Loading(false);
    if (error) { toast({ title: "GA4-fel", description: error.message, variant: "destructive" }); return; }
    const rows: Ga4Row[] = (data as any)?.rows || [];
    setGa4Rows(rows);
    const sessions = rows.reduce((s, r) => s + Number(r.metricValues?.[0]?.value || 0), 0);
    const users = rows.reduce((s, r) => s + Number(r.metricValues?.[1]?.value || 0), 0);
    setGa4Totals({ sessions, users });
  };

  if (loadingLists) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Hämtar Google-konton…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* GSC */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Search className="h-4 w-4" /> Search Console
              </CardTitle>
              <CardDescription>Senaste 28 dagar — top queries</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={loadLists}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga sites hittade på detta Google-konto.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Välj site" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={fetchGsc} disabled={gscLoading || !selectedSite}>
                  {gscLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hämta"}
                </Button>
              </div>
              {gscRows.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Query</th>
                        <th className="p-2 text-right">Klick</th>
                        <th className="p-2 text-right">Imp.</th>
                        <th className="p-2 text-right">Pos.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscRows.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">{r.keys?.[0]}</td>
                          <td className="p-2 text-right">{r.clicks}</td>
                          <td className="p-2 text-right">{r.impressions}</td>
                          <td className="p-2 text-right">{r.position?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* GA4 */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <BarChart3 className="h-4 w-4" /> GA4
              </CardTitle>
              <CardDescription>Senaste 28 dagar — sessions & users</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={loadLists}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga GA4-properties hittade.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Välj property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.property} value={p.property}>
                        {p.displayName} <span className="text-muted-foreground">({p.parent})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={fetchGa4} disabled={ga4Loading || !selectedProperty}>
                  {ga4Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hämta"}
                </Button>
              </div>
              {ga4Totals && (
                <div className="flex gap-2">
                  <Badge variant="secondary">Sessions: {ga4Totals.sessions.toLocaleString("sv-SE")}</Badge>
                  <Badge variant="secondary">Users: {ga4Totals.users.toLocaleString("sv-SE")}</Badge>
                </div>
              )}
              {ga4Rows.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Datum</th>
                        <th className="p-2 text-right">Sessions</th>
                        <th className="p-2 text-right">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ga4Rows.map((r, i) => {
                        const d = r.dimensionValues?.[0]?.value || "";
                        const fmt = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="p-2">{fmt}</td>
                            <td className="p-2 text-right">{r.metricValues?.[0]?.value}</td>
                            <td className="p-2 text-right">{r.metricValues?.[1]?.value}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
