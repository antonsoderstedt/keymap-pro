import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, Link2, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { analysisId: string }

export function TechSeoTab({ analysisId }: Props) {
  const { toast } = useToast();
  const [audit, setAudit] = useState<any>(null);
  const [backlinks, setBacklinks] = useState<any>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingBl, setLoadingBl] = useState(false);

  useEffect(() => {
    supabase.from("site_audits").select("payload").eq("analysis_id", analysisId).maybeSingle().then(({ data }) => {
      if (data) setAudit(data.payload);
    });
    supabase.from("backlink_gaps").select("payload").eq("analysis_id", analysisId).maybeSingle().then(({ data }) => {
      if (data) setBacklinks(data.payload);
    });
  }, [analysisId]);

  const runAudit = async (force = false) => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase.functions.invoke("semrush-audit", { body: { analysis_id: analysisId, force } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAudit((data as any).audit);
      toast({ title: (data as any).cached ? "Audit från cache" : "Audit klar" });
    } catch (e: any) {
      toast({ title: "Kunde inte köra audit", description: e?.message, variant: "destructive" });
    } finally { setLoadingAudit(false); }
  };

  const runBacklinks = async (force = false) => {
    setLoadingBl(true);
    try {
      const { data, error } = await supabase.functions.invoke("semrush-backlinks", { body: { analysis_id: analysisId, force } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setBacklinks((data as any).data);
      toast({ title: (data as any).cached ? "Backlinks från cache" : "Backlink-analys klar" });
    } catch (e: any) {
      toast({ title: "Kunde inte hämta backlinks", description: e?.message, variant: "destructive" });
    } finally { setLoadingBl(false); }
  };

  return (
    <Tabs defaultValue="audit">
      <TabsList>
        <TabsTrigger value="audit" className="gap-1"><ShieldCheck className="h-3 w-3" />Site Audit</TabsTrigger>
        <TabsTrigger value="backlinks" className="gap-1"><Link2 className="h-3 w-3" />Backlink Gap</TabsTrigger>
      </TabsList>

      <TabsContent value="audit" className="space-y-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-sm">Teknisk SEO-audit</p>
              <p className="text-xs text-muted-foreground">On-page-check + Semrush domain overview. Cache 7 dagar.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => runAudit(false)} disabled={loadingAudit} className="gap-2">
                {loadingAudit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                {audit ? "Uppdatera" : "Kör audit"}
              </Button>
              {audit && <Button size="sm" variant="outline" onClick={() => runAudit(true)} disabled={loadingAudit}><RefreshCw className="h-3 w-3" /></Button>}
            </div>
          </CardContent>
        </Card>

        {audit && (
          <>
            {audit.semrush?.overview && (
              <div className="grid md:grid-cols-4 gap-3">
                <Stat label="Authority" value={audit.semrush.overview.rank ? `#${audit.semrush.overview.rank}` : "—"} />
                <Stat label="Organisk traffik" value={audit.semrush.overview.organicTraffic?.toLocaleString() || "—"} />
                <Stat label="Organiska sökord" value={audit.semrush.overview.organicKeywords?.toLocaleString() || "—"} />
                <Stat label="Trafikvärde (USD)" value={audit.semrush.overview.organicCost?.toLocaleString() || "—"} />
              </div>
            )}

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">On-page issues ({audit.onPage?.issues?.length || 0})</h3>
                {!audit.onPage?.issues?.length ? (
                  <p className="text-sm text-muted-foreground">Inga issues funna 🎉</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Allvar</TableHead>
                        <TableHead className="w-32">Kategori</TableHead>
                        <TableHead>Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.onPage.issues.map((i: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant={i.severity === "high" ? "destructive" : i.severity === "medium" ? "default" : "outline"}>{i.severity}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{i.category}</TableCell>
                          <TableCell className="text-sm">{i.title}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {audit.semrush?.topPages?.length > 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Topprankade sidor</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL</TableHead>
                        <TableHead className="text-right">Sökord</TableHead>
                        <TableHead className="text-right">Trafik</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.semrush.topPages.slice(0, 20).map((p: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs truncate max-w-md"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a></TableCell>
                          <TableCell className="text-right font-mono">{p.keywordCount}</TableCell>
                          <TableCell className="text-right font-mono">{p.traffic}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="backlinks" className="space-y-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-sm">Backlink Gap-analys</p>
              <p className="text-xs text-muted-foreground">Domäner som länkar till konkurrenter men inte till dig. Cache 14 dagar.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => runBacklinks(false)} disabled={loadingBl} className="gap-2">
                {loadingBl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                {backlinks ? "Uppdatera" : "Kör analys"}
              </Button>
              {backlinks && <Button size="sm" variant="outline" onClick={() => runBacklinks(true)} disabled={loadingBl}><RefreshCw className="h-3 w-3" /></Button>}
            </div>
          </CardContent>
        </Card>

        {backlinks && (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <Stat label="Authority Score" value={backlinks.ownOverview?.authorityScore ?? "—"} />
              <Stat label="Backlinks (din)" value={backlinks.ownOverview?.totalBacklinks?.toLocaleString() || "—"} />
              <Stat label="Refererande domäner" value={backlinks.ownOverview?.referringDomains?.toLocaleString() || "—"} />
            </div>

            {backlinks.competitors?.length > 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Konkurrenter</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domän</TableHead>
                        <TableHead className="text-right">AS</TableHead>
                        <TableHead className="text-right">Backlinks</TableHead>
                        <TableHead className="text-right">Ref. domäner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backlinks.competitors.map((c: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{c.domain}</TableCell>
                          <TableCell className="text-right font-mono">{c.overview?.authorityScore ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono">{c.overview?.totalBacklinks?.toLocaleString() || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{c.overview?.referringDomains?.toLocaleString() || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Gap-domäner ({backlinks.gapDomains?.length || 0}) — länkar till konkurrenter, inte till dig</h3>
                {!backlinks.gapDomains?.length ? (
                  <p className="text-sm text-muted-foreground">Inga gap-domäner hittade. Lägg till konkurrenter på projektet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domän</TableHead>
                        <TableHead className="text-right">AS</TableHead>
                        <TableHead className="text-right">Backlinks</TableHead>
                        <TableHead>Länkar till</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backlinks.gapDomains.slice(0, 50).map((g: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs"><a href={`https://${g.domain}`} target="_blank" rel="noreferrer" className="hover:underline">{g.domain}</a></TableCell>
                          <TableCell className="text-right font-mono">{g.authority}</TableCell>
                          <TableCell className="text-right font-mono">{g.backlinks}</TableCell>
                          <TableCell><div className="flex gap-1 flex-wrap">{g.linksToCompetitors.map((c: string, i: number) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}</div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
