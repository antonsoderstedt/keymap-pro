import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, ArrowRight, FileText, Megaphone } from "lucide-react";

export default function WorkspaceSegments() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [segments, setSegments] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: analyses } = await supabase
        .from("analyses")
        .select("id, result_json")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = analyses?.[0];
      if (!latest) {
        setLoading(false);
        return;
      }
      const result = latest.result_json as any;
      setSegments(result?.segments || []);

      const [{ data: briefRows }, { data: adRows }] = await Promise.all([
        supabase.from("content_briefs").select("cluster, payload").eq("analysis_id", latest.id),
        supabase.from("ad_drafts").select("ad_group, payload").eq("analysis_id", latest.id),
      ]);
      setBriefs(briefRows || []);
      setAds(adRows || []);
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <Layers className="h-7 w-7 text-primary" /> Segment & paket
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-identifierade segment med färdiga paket: landningssida-brief och Google Ads-kampanj.
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
            const cluster = s.cluster || s.name;
            const brief = briefs.find((b) => b.cluster === cluster);
            const ad = ads.find((a) => a.ad_group === cluster);
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
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className={`p-3 rounded-md border ${brief ? "border-primary/30 bg-primary/5" : "border-border border-dashed"}`}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <FileText className="h-3 w-3" /> Content brief
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {brief ? "Klar — öppna i Artefakter" : "Ej genererad"}
                      </div>
                    </div>
                    <div className={`p-3 rounded-md border ${ad ? "border-primary/30 bg-primary/5" : "border-border border-dashed"}`}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Megaphone className="h-3 w-3" /> Ads-kampanj
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {ad ? "Klar — öppna i Artefakter" : "Ej genererad"}
                      </div>
                    </div>
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
    </div>
  );
}
