// TODO: DEAD FILE — absorberat i KeywordsHub
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, ArrowRight, FileText, Megaphone, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getKeywordUniverse } from "@/lib/keywordUniverseCache";

export default function WorkspaceSegments() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ kind: "brief" | "ad"; data: any; segment: any } | null>(null);
  const [availableClusters, setAvailableClusters] = useState<string[]>([]);
  const [reassign, setReassign] = useState<{ segment: any; current: string } | null>(null);
  const [reassignChoice, setReassignChoice] = useState<string>("");

  const load = async () => {
    if (!id) return;
    const { data: analyses } = await supabase
      .from("analyses")
      .select("id, result_json")
      .eq("project_id", id)
      .not("result_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const latest = analyses?.[0];
    if (!latest) {
      setLoading(false);
      return;
    }
    setAnalysisId(latest.id);
    const result = latest.result_json as any;
    const rawSegments: any[] = result?.segments || [];

    // Hämta keyword universe (cachat per analysis_id i klienten)
    const universe = await getKeywordUniverse(latest.id);
    const clusterKeys = Array.from(new Set(universe.map((k: any) => k?.cluster).filter(Boolean))) as string[];
    setAvailableClusters(clusterKeys);

    const resolveCluster = (s: any): { key: string; kind: "exact" | "substring" | "none" } => {
      const candidates = [s.cluster, s.name, s.label, s.title].filter(Boolean).map(String);
      for (const c of candidates) {
        const hit = clusterKeys.find((k) => k.toLowerCase() === c.toLowerCase());
        if (hit) return { key: hit, kind: "exact" };
      }
      for (const c of candidates) {
        const needle = c.toLowerCase();
        const hit = clusterKeys.find((k) => k.toLowerCase().includes(needle) || needle.includes(k.toLowerCase()));
        if (hit) return { key: hit, kind: "substring" };
      }
      return { key: candidates[0] || "", kind: "none" };
    };

    const enriched = rawSegments.map((s) => {
      const r = resolveCluster(s);
      return { ...s, _clusterKey: r.key, _resolveKind: r.kind };
    });
    setSegments(enriched);

    const [{ data: briefRows }, { data: adRows }] = await Promise.all([
      supabase.from("content_briefs").select("cluster, payload").eq("analysis_id", latest.id),
      supabase.from("ad_drafts").select("ad_group, payload").eq("analysis_id", latest.id),
    ]);
    setBriefs(briefRows || []);
    setAds(adRows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const generate = async (kind: "brief" | "ad", cluster: string) => {
    if (!analysisId) return;
    setGenerating(`${kind}-${cluster}`);
    try {
      const fn = kind === "brief" ? "generate-brief" : "generate-ads";
      const { error } = await supabase.functions.invoke(fn, {
        body: { analysis_id: analysisId, cluster },
      });
      if (error) throw error;
      toast.success(kind === "brief" ? "Brief genererad" : "Ads-paket genererat");
      load();
    } catch (e: any) {
      toast.error("Misslyckades: " + (e.message || "okänt fel"));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <Layers className="h-7 w-7 text-primary" /> Segment & paket
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Klicka på ett paket för att se innehållet eller generera direkt.
        </p>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Laddar…</CardContent></Card>
      ) : segments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Layers className="h-8 w-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Inga segment identifierade än.</p>
            <Button onClick={() => navigate(`/project/${id}`)}>Kör analys</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {segments.map((s: any, i: number) => {
            const cluster = s._clusterKey || s.cluster || s.name;
            const brief = briefs.find((b) => b.cluster === cluster);
            const ad = ads.find((a) => a.ad_group === cluster);
            const briefMeta = brief?.payload?._meta;
            const briefFallback = briefMeta && briefMeta.match_kind && briefMeta.match_kind !== "exact";
            const resolveFallback = s._resolveKind && s._resolveKind !== "exact";
            const showWarning = briefFallback || resolveFallback;
            const warningText = briefFallback
              ? briefMeta.match_kind === "top"
                ? `Briefen byggdes på top-30 sökord (ingen klustermatch hittades för "${briefMeta.requested_cluster}").`
                : `Briefen matchades fuzzy: "${briefMeta.requested_cluster}" → "${briefMeta.matched_cluster}".`
              : `Segmentet matchas inte exakt mot något kluster (${s._resolveKind}). Välj rätt kluster för bästa resultat.`;
            return (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <CardTitle className="font-serif text-base">
                    {s.name || cluster || `Segment ${i + 1}`}
                  </CardTitle>
                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {s.intent && <Badge variant="outline" className="text-[10px]">{s.intent}</Badge>}
                    {s.priority && <Badge variant="default" className="text-[10px]">prio: {s.priority}</Badge>}
                    {s.size && <Badge variant="secondary" className="text-[10px]">{s.size}</Badge>}
                    <Badge variant="outline" className="text-[10px] font-mono">cluster: {cluster || "—"}</Badge>
                  </div>
                  {showWarning && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="text-foreground">{warningText}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px]"
                          onClick={() => {
                            setReassign({ segment: s, current: cluster });
                            setReassignChoice(cluster);
                          }}
                        >
                          Välj rätt kluster
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-2">
                    <PackageTile
                      icon={FileText}
                      label="Content brief"
                      ready={!!brief}
                      busy={generating === `brief-${cluster}`}
                      onOpen={() => brief && setDrawer({ kind: "brief", data: brief.payload, segment: s })}
                      onGenerate={() => generate("brief", cluster)}
                    />
                    <PackageTile
                      icon={Megaphone}
                      label="Ads-kampanj"
                      ready={!!ad}
                      busy={generating === `ad-${cluster}`}
                      onOpen={() => ad && setDrawer({ kind: "ad", data: ad.payload, segment: s })}
                      onGenerate={() => generate("ad", cluster)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Button variant="outline" onClick={() => navigate(`/clients/${id}/artifacts`)} className="gap-2">
            Öppna alla artefakter <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif">
                  {drawer.kind === "brief" ? "Content brief" : "Ads-kampanj"} — {drawer.segment?.name || drawer.segment?.cluster}
                </SheetTitle>
                <SheetDescription>
                  Förhandsvisning. Fullständig version i Artefakter.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <PayloadView payload={drawer.data} />
                <Button variant="outline" className="gap-2" onClick={() => navigate(`/clients/${id}/artifacts`)}>
                  Öppna i Artefakter <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!reassign} onOpenChange={(o) => !o && setReassign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Välj kluster för segmentet</DialogTitle>
            <DialogDescription>
              Välj vilket sökordskluster "{reassign?.segment?.name || reassign?.current}" ska kopplas mot. Detta används vid generering av brief och Ads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={reassignChoice} onValueChange={setReassignChoice}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kluster" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {availableClusters.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassign(null)}>Avbryt</Button>
            <Button
              onClick={async () => {
                if (!reassign || !reassignChoice) return;
                setSegments((prev) =>
                  prev.map((x) =>
                    x === reassign.segment
                      ? { ...x, _clusterKey: reassignChoice, _resolveKind: "exact" }
                      : x
                  )
                );
                setReassign(null);
                toast.success(`Kluster satt till "${reassignChoice}". Generera om för att uppdatera brief.`);
              }}
            >
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackageTile({ icon: Icon, label, ready, busy, onOpen, onGenerate }: any) {
  return (
    <button
      type="button"
      onClick={ready ? onOpen : onGenerate}
      disabled={busy}
      className={`text-left p-3 rounded-md border transition-colors hover:border-primary/60 ${ready ? "border-primary/30 bg-primary/5" : "border-border border-dashed"}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
        {busy ? (<><Loader2 className="h-3 w-3 animate-spin" /> Genererar…</>) : ready ? "Klar — klicka för att se" : "Klicka för att generera"}
      </div>
    </button>
  );
}

function PayloadView({ payload }: { payload: any }) {
  if (!payload) return <p className="text-sm text-muted-foreground">Inget innehåll.</p>;
  // Render common fields nicely, fall back to JSON
  const entries = Object.entries(payload).filter(([k, v]) => !k.startsWith("_") && v !== null && v !== undefined && v !== "");
  return (
    <div className="space-y-3">
      {entries.map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{k.replace(/_/g, " ")}</div>
          {Array.isArray(v) ? (
            <ul className="text-sm space-y-1 pl-4 list-disc">
              {v.slice(0, 30).map((item, i) => (
                <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          ) : typeof v === "object" ? (
            <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{String(v)}</p>
          )}
        </div>
      ))}
    </div>
  );
}