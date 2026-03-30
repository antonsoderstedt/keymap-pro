import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, LogOut, FolderOpen, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/lib/types";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    } else {
      setProjects((data as Project[]) || []);
    }
    setLoading(false);
  };

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer border-border bg-card transition-colors hover:border-primary/50"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <CardHeader>
                  <CardTitle className="font-serif text-lg">{project.name || "Namnlöst projekt"}</CardTitle>
                  <CardDescription>{project.company || "Inget företag angivet"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(project.created_at).toLocaleDateString("sv-SE")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
