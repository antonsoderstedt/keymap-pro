import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, LogOut, FolderOpen, Calendar, BarChart3, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Project, Analysis, AnalysisResult } from "@/lib/types";

interface ProjectWithAnalyses extends Project {
  analyses: Analysis[];
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<ProjectWithAnalyses[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  useEffect(() => {
    loadProjects();
    checkGoogle();
    // Toast on return from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast({ title: "Google ansluten", description: "GA4 + Search Console är nu kopplade." });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  const checkGoogle = async () => {
    const { data } = await supabase.functions.invoke("google-oauth/status");
    setGoogleConnected(!!(data as any)?.connected);
  };

  const connectGoogle = async () => {
    const { data, error } = await supabase.functions.invoke("google-oauth/start");
    if (error || !(data as any)?.url) {
      toast({ title: "Fel", description: error?.message || "Kunde inte starta Google-inloggning", variant: "destructive" });
      return;
    }
    // Append origin so callback can redirect back to current host
    const url = new URL((data as any).url);
    // Encode origin in state already; we redirect from callback to a fixed origin via query param too
    window.location.href = `${(data as any).url}`;
  };

  const disconnectGoogle = async () => {
    await supabase.functions.invoke("google-oauth/disconnect");
    setGoogleConnected(false);
    toast({ title: "Google frånkopplad" });
  };

  const loadProjects = async () => {
    const { data: projectsData, error: pError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (pError) {
      toast({ title: "Fel", description: pError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: analysesData } = await supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false });

    const analysesMap = new Map<string, Analysis[]>();
    (analysesData || []).forEach((a: any) => {
      const list = analysesMap.get(a.project_id) || [];
      list.push(a as Analysis);
      analysesMap.set(a.project_id, list);
    });

    const enriched: ProjectWithAnalyses[] = ((projectsData as Project[]) || []).map((p) => ({
      ...p,
      analyses: analysesMap.get(p.id) || [],
    }));

    setProjects(enriched);
    setLoading(false);
  };

  const toggleCompare = (analysisId: string) => {
    setCompareIds((prev) =>
      prev.includes(analysisId)
        ? prev.filter((id) => id !== analysisId)
        : prev.length < 2
        ? [...prev, analysisId]
        : prev
    );
  };

  const getResultSummary = (a: Analysis) => {
    const r = a.result_json as AnalysisResult | null;
    if (!r) return null;
    return {
      totalKeywords: r.totalKeywords || 0,
      segments: r.segments?.length || 0,
      clusters: r.keywords?.length || 0,
    };
  };

  // ... keep existing code for createProject
  const createProject = async () => {
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: "Nytt projekt", company: "", market: "se-sv", user_id: user!.id })
      .select()
      .single();
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    } else {
      navigate(`/project/${(data as Project).id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="font-serif text-2xl text-primary">KEYMAP</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl">Dina projekt</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hantera dina keyword research-projekt</p>
          </div>
          <Button onClick={createProject} className="gap-2">
            <Plus className="h-4 w-4" />
            Nytt projekt
          </Button>
        </div>

        {/* Compare bar */}
        {compareIds.length === 2 && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm text-primary">2 analyser valda för jämförelse</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate(`/compare?a=${compareIds[0]}&b=${compareIds[1]}`)}>
                Jämför nu
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCompareIds([])}>
                Avbryt
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse border-border bg-card">
                <CardHeader><div className="h-6 w-32 rounded bg-muted" /></CardHeader>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">Inga projekt ännu</p>
              <Button onClick={createProject} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Skapa ditt första projekt
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card key={project.id} className="border-border bg-card transition-colors hover:border-primary/30">
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-serif text-lg">{project.name || "Namnlöst projekt"}</CardTitle>
                      <CardDescription>{project.company || "Inget företag angivet"}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      {project.analyses.length > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <BarChart3 className="h-3 w-3" />
                          {project.analyses.length} {project.analyses.length === 1 ? "analys" : "analyser"}
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(project.created_at).toLocaleDateString("sv-SE")}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedProject(expandedProject === project.id ? null : project.id);
                        }}
                      >
                        {expandedProject === project.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedProject === project.id && (
                  <CardContent className="border-t border-border pt-4">
                    {project.analyses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Inga analyser körda ännu.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Analyshistorik</p>
                        {project.analyses.map((analysis) => {
                          const summary = getResultSummary(analysis);
                          const isSelected = compareIds.includes(analysis.id);
                          return (
                            <div
                              key={analysis.id}
                              className={`flex items-center justify-between rounded-md border p-3 text-sm transition-colors ${
                                isSelected ? "border-primary bg-primary/5" : "border-border"
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(analysis.created_at).toLocaleDateString("sv-SE", {
                                    year: "numeric", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </div>
                                {summary && (
                                  <div className="flex gap-3 text-xs">
                                    <span className="text-muted-foreground">{summary.totalKeywords} sökord</span>
                                    <span className="text-muted-foreground">{summary.segments} segment</span>
                                    <span className="text-muted-foreground">{summary.clusters} kluster</span>
                                  </div>
                                )}
                                {!summary && (
                                  <span className="text-xs text-muted-foreground italic">Inget resultat</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCompare(analysis.id);
                                  }}
                                >
                                  {isSelected ? "Avmarkera" : "Jämför"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/project/${project.id}/results?analysis=${analysis.id}`);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                  Visa
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
