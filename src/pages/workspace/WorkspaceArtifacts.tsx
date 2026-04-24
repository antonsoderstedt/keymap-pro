import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Eye, BarChart3, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnalysisRow {
  id: string;
  created_at: string;
  result_json: any;
}

export default function WorkspaceArtifacts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("analyses")
        .select("id, created_at, result_json")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      setAnalyses((data as AnalysisRow[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Artefakter</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alla analyser, rapporter och snapshots du sparat för den här kunden.
          </p>
        </div>
        <Button onClick={() => navigate(`/project/${id}`)} className="gap-2">
          <Plus className="h-4 w-4" />
          Kör ny analys
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Card key={i} className="h-24 animate-pulse" />)}
        </div>
      ) : analyses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Inga analyser ännu</p>
            <Button onClick={() => navigate(`/project/${id}`)} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Kör första analysen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => {
            const r = a.result_json as any;
            return (
              <Card key={a.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="secondary" className="gap-1">
                        <BarChart3 className="h-3 w-3" />
                        Analys
                      </Badge>
                      {r ? (
                        <span className="text-xs text-muted-foreground">
                          {r.totalKeywords ?? 0} sökord · {r.segments?.length ?? 0} segment
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Inget resultat</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(a.created_at).toLocaleString("sv-SE")}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate(`/project/${id}/results?analysis=${a.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visa
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
