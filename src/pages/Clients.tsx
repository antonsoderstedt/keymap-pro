import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, LogOut, Calendar, BarChart3, Building2, ArrowRight, Sparkles, Home, BookOpen, Rocket, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatMoney, valueColor, isSupportedCurrency, type Currency } from "@/lib/revenue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ClientCard extends Project {
  analyses_count: number;
  open_actions: number;
  last_analysis_at: string | null;
  weekly_value: number | null;
  currency: Currency;
}

export default function Clients() {
  const { user, signOut } = useAuth();
  const [clients, setClients] = useState<ClientCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("*")
      .eq("is_archived", false)
      .order("last_active_at", { ascending: false });

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const ids = (projects || []).map((p: any) => p.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: analyses }, { data: actions }, { data: briefings }, { data: revSettings }] = await Promise.all([
      supabase.from("analyses").select("project_id, created_at").in("project_id", safeIds),
      supabase.from("action_items").select("project_id, status").in("project_id", safeIds),
      supabase.from("weekly_briefings").select("project_id, total_value_at_stake_sek, week_start").in("project_id", safeIds).order("week_start", { ascending: false }),
      supabase.from("project_revenue_settings").select("project_id, currency").in("project_id", safeIds),
    ]);

    const enriched: ClientCard[] = ((projects as Project[]) || []).map((p) => {
      const projAnalyses = (analyses || []).filter((a: any) => a.project_id === p.id);
      const projActions = (actions || []).filter((a: any) => a.project_id === p.id);
      const lastAnalysis = projAnalyses.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const latestBriefing = (briefings || []).find((b: any) => b.project_id === p.id);
      const projCur = (revSettings || []).find((r: any) => r.project_id === p.id)?.currency;
      return {
        ...p,
        analyses_count: projAnalyses.length,
        open_actions: projActions.filter((a: any) => a.status !== "done" && a.status !== "archived").length,
        last_analysis_at: lastAnalysis?.created_at ?? null,
        weekly_value: latestBriefing?.total_value_at_stake_sek ?? null,
        currency: isSupportedCurrency(projCur) ? projCur : "SEK",
      };
    });

    setClients(enriched);
    setLoading(false);
  };

  const createClient = async (kind: "established" | "prelaunch") => {
    setCreating(true);
    const defaults =
      kind === "prelaunch"
        ? { name: "Ny pre-launch", company: "", market: "se-sv", description: "Pre-launch — ingen historisk data ännu" }
        : { name: "Ny kund", company: "", market: "se-sv" };
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...defaults, user_id: user!.id } as any)
      .select()
      .single();
    setCreating(false);
    setPickerOpen(false);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    const id = (data as Project).id;
    if (kind === "prelaunch") {
      navigate(`/clients/${id}/prelaunch`);
    } else {
      navigate(`/project/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-primary">Slay Station</h1>
            <p className="text-xs text-muted-foreground">Min byrå</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <Home className="h-4 w-4" />
                Startsida
              </Button>
            </Link>
            <Link to="/docs">
              <Button variant="ghost" size="sm" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Knowledge base
              </Button>
            </Link>
            <ThemeToggle />
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl">Mina kunder</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Varje kund är ett permanent hem för analyser, dashboards och åtgärder
            </p>
          </div>
          <Button onClick={createClient} className="gap-2">
            <Plus className="h-4 w-4" />
            Ny kund
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse border-border bg-card h-44" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">Inga kunder ännu</p>
              <Button onClick={createClient} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Skapa din första kund
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="group cursor-pointer border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="font-serif text-lg truncate">
                        {client.name || "Namnlös kund"}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {client.company || client.domain || "—"}
                      </CardDescription>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <BarChart3 className="h-3 w-3" />
                      {client.analyses_count} {client.analyses_count === 1 ? "analys" : "analyser"}
                    </Badge>
                    {client.open_actions > 0 && (
                      <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                        {client.open_actions} öppna åtgärder
                      </Badge>
                    )}
                  </div>
                  {client.weekly_value !== null && client.weekly_value > 0 && (
                    <div className={`flex items-center gap-2 p-2 rounded-md border ${
                      valueColor(client.weekly_value) === "red" ? "bg-destructive/10 border-destructive/30 text-destructive" :
                      valueColor(client.weekly_value) === "yellow" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" :
                      "bg-primary/10 border-primary/30 text-primary"
                    }`}>
                      <Sparkles className="h-3 w-3" />
                      <span className="text-xs font-medium">Veckans värde: {formatMoney(client.weekly_value, client.currency, { compact: true })}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                    <Calendar className="h-3 w-3" />
                    {client.last_analysis_at
                      ? `Senaste analys: ${new Date(client.last_analysis_at).toLocaleDateString("sv-SE")}`
                      : `Skapad: ${new Date(client.created_at).toLocaleDateString("sv-SE")}`}
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
