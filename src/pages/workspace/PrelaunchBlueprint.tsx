import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, X, Rocket, ArrowRight, Pencil, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { formatMoney } from "@/lib/revenue";

type Brief = {
  id: string;
  status: string;
  business_idea: string | null;
  target_audience: string | null;
  usp: string | null;
  competitors: string[];
  locations: string[];
  error_message?: string | null;
  created_at: string;
};

type Blueprint = {
  id: string;
  brief_id: string;
  market_analysis: any;
  strategy: any;
  keyword_universe: any;
  sitemap: any[];
  personas: any[];
  forecast: any;
  created_at: string;
};

export default function PrelaunchBlueprint() {
  const { id: projectId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const currency = useProjectCurrency(projectId);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("brief");
  // editingBriefId = null → skapar ny; satt → redigerar existerande brief
  const [editingBriefId, setEditingBriefId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [businessIdea, setBusinessIdea] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [usp, setUsp] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState("");
  const [locations, setLocations] = useState<string[]>([]);

  function resetForm() {
    setBusinessIdea(""); setTargetAudience(""); setUsp("");
    setCompetitors([]); setLocations([]);
    setCompetitorInput(""); setLocationInput("");
    setEditingBriefId(null);
  }

  function loadBriefIntoForm(b: Brief) {
    setBusinessIdea(b.business_idea || "");
    setTargetAudience(b.target_audience || "");
    setUsp(b.usp || "");
    setCompetitors(b.competitors || []);
    setLocations(b.locations || []);
    setCompetitorInput(""); setLocationInput("");
    setEditingBriefId(b.id);
    setActiveTab("brief");
  }

  useEffect(() => {
    if (!projectId) return;
    loadBriefs();
  }, [projectId]);

  async function loadBriefs() {
    setLoading(true);
    const { data } = await supabase
      .from("prelaunch_briefs")
      .select("*")
      .eq("project_id", projectId!)
      .order("created_at", { ascending: false });
    setBriefs((data as Brief[]) || []);
    if (data && data[0]) {
      setActiveBriefId(data[0].id);
      loadBlueprint(data[0].id);
    }
    setLoading(false);
  }

  async function loadBlueprint(briefId: string) {
    const { data } = await supabase
      .from("prelaunch_blueprints")
      .select("*")
      .eq("brief_id", briefId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    setBlueprint(data as Blueprint | null);
  }

  async function selectBrief(briefId: string) {
    setActiveBriefId(briefId);
    setBlueprint(null);
    await loadBlueprint(briefId);
    // Om vi byter brief — avsluta ev. redigeringsläge
    if (editingBriefId && editingBriefId !== briefId) resetForm();
  }

  async function saveBriefOnly() {
    if (!editingBriefId) return;
    if (!businessIdea.trim()) {
      toast({ title: "Verksamhetsbeskrivning krävs", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("prelaunch_briefs")
        .update({
          business_idea: businessIdea,
          target_audience: targetAudience,
          usp,
          competitors,
          locations,
        })
        .eq("id", editingBriefId);
      if (error) throw error;
      toast({ title: "Brief sparad", description: "Tryck \"Generera om\" för att uppdatera resultatet." });
      await loadBriefs();
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function createBriefAndRun() {
    if (!businessIdea.trim()) {
      toast({ title: "Verksamhetsbeskrivning krävs", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      let briefId = editingBriefId;

      if (editingBriefId) {
        // Uppdatera existerande brief och kör om research
        const { error } = await supabase
          .from("prelaunch_briefs")
          .update({
            business_idea: businessIdea,
            target_audience: targetAudience,
            usp,
            competitors,
            locations,
            status: "researching",
            error_message: null,
          })
          .eq("id", editingBriefId);
        if (error) throw error;
      } else {
        const { data: brief, error } = await supabase
          .from("prelaunch_briefs")
          .insert({
            project_id: projectId!,
            business_idea: businessIdea,
            target_audience: targetAudience,
            usp,
            competitors,
            locations,
            status: "researching",
          })
          .select()
          .single();
        if (error) throw error;
        briefId = brief.id;
        setBriefs([brief as Brief, ...briefs]);
      }

      setActiveBriefId(briefId!);
      resetForm();

      const { error: invErr } = await supabase.functions.invoke("prelaunch-research", {
        body: { brief_id: briefId },
      });
      if (invErr) throw invErr;

      toast({ title: "Klart!", description: "Blueprint genererad." });
      await loadBriefs();
      await loadBlueprint(briefId!);
      setActiveTab("result");
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const activeBrief = briefs.find(b => b.id === activeBriefId);

  if (loading) {
    return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl mb-1">Pre-launch Blueprint</h1>
        <p className="text-sm text-muted-foreground">
          För nya sajter utan data — generera marknadsanalys, sökordsuniversum, sajtkarta och prognos från enbart en brief.
        </p>
      </div>

      {/* Briefs list */}
      {briefs.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          {briefs.map(b => (
            <div key={b.id} className="inline-flex items-center rounded-md border border-border overflow-hidden">
              <Button
                variant={activeBriefId === b.id ? "default" : "ghost"}
                size="sm"
                className="rounded-none border-0"
                onClick={() => selectBrief(b.id)}
              >
                {new Date(b.created_at).toLocaleDateString("sv-SE")}
                <Badge variant="secondary" className="ml-2 text-[10px]">{b.status}</Badge>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none border-0 border-l border-border px-2"
                title="Redigera brief"
                onClick={() => loadBriefIntoForm(b)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {editingBriefId && (
            <Button variant="ghost" size="sm" onClick={resetForm} className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Ny brief istället
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="brief">{editingBriefId ? "Redigera brief" : "Ny brief"}</TabsTrigger>
          <TabsTrigger value="result" disabled={!blueprint}>Resultat</TabsTrigger>
        </TabsList>

        <TabsContent value="brief" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Brief — verksamhet & marknad</CardTitle>
              <CardDescription>
                Ju mer detaljerad input, desto bättre resultat. Beräkningstid: ~60-120 sekunder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Verksamhetsbeskrivning *</Label>
                <Textarea
                  value={businessIdea}
                  onChange={e => setBusinessIdea(e.target.value)}
                  placeholder="Vad gör företaget? Vilka produkter/tjänster säljs? Affärsmodell?"
                  rows={4}
                />
              </div>
              <div>
                <Label>Målgrupp</Label>
                <Textarea
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  placeholder="Vem är kunden? Demografi, beteende, drivkrafter."
                  rows={2}
                />
              </div>
              <div>
                <Label>USP / Differentierare</Label>
                <Textarea
                  value={usp}
                  onChange={e => setUsp(e.target.value)}
                  placeholder="Vad gör er unika? Pris, kvalitet, kompetens, geografi…"
                  rows={2}
                />
              </div>

              <ChipInput
                label="Geografiska marknader / städer"
                value={locations}
                onChange={setLocations}
                inputValue={locationInput}
                setInputValue={setLocationInput}
                placeholder="t.ex. Stockholm, Norrtälje, Sverige"
              />

              <ChipInput
                label="Konkurrentdomäner (2-5 st)"
                value={competitors}
                onChange={setCompetitors}
                inputValue={competitorInput}
                setInputValue={setCompetitorInput}
                placeholder="exempel.se"
              />

              <Button onClick={createBriefAndRun} disabled={running} className="w-full">
                {running ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Genererar blueprint…</>
                ) : (
                  <><Rocket className="mr-2 h-4 w-4" /> Generera blueprint</>
                )}
              </Button>

              {running && (
                <div className="space-y-2">
                  <Progress value={66} className="animate-pulse" />
                  <p className="text-xs text-muted-foreground text-center">
                    Skrapar konkurrenter → extraherar sökord → hämtar volymer → bygger sajtkarta…
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result" className="mt-4">
          {activeBrief?.status === "researching" && (
            <Card><CardContent className="p-8 text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              <p className="text-sm">Research pågår — detta tar 1-2 minuter.</p>
              <Button variant="outline" size="sm" onClick={() => loadBlueprint(activeBrief.id)}>
                Uppdatera
              </Button>
            </CardContent></Card>
          )}
          {activeBrief?.status === "failed" && (
            <Card><CardContent className="p-6">
              <p className="text-sm text-destructive">Misslyckades: {activeBrief.error_message}</p>
            </CardContent></Card>
          )}
          {blueprint && <BlueprintResult blueprint={blueprint} currency={currency} projectId={projectId!} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChipInput({ label, value, onChange, inputValue, setInputValue, placeholder }: any) {
  const add = () => {
    const v = inputValue.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInputValue("");
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e: any) => setInputValue(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((v: string) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button onClick={() => onChange(value.filter((x: string) => x !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function BlueprintResult({ blueprint, currency, projectId }: { blueprint: Blueprint; currency: any; projectId: string }) {
  const ma = blueprint.market_analysis || {};
  const strat = blueprint.strategy || {};
  const sitemap = blueprint.sitemap || [];
  const personas = blueprint.personas || [];
  const forecast = blueprint.forecast || {};
  const kws = blueprint.keyword_universe?.keywords || [];

  return (
    <Tabs defaultValue="market" className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="market">Marknadsanalys</TabsTrigger>
        <TabsTrigger value="strategy">Strategi</TabsTrigger>
        <TabsTrigger value="keywords">Sökord ({kws.length})</TabsTrigger>
        <TabsTrigger value="sitemap">Sajtkarta ({sitemap.length})</TabsTrigger>
        <TabsTrigger value="forecast">Prognos</TabsTrigger>
      </TabsList>

      <TabsContent value="market" className="space-y-4">
        <Card><CardHeader><CardTitle>Sammanfattning</CardTitle></CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{ma.summary}</div>
          </CardContent>
        </Card>
        {ma.assessment && (
          <Card><CardHeader><CardTitle>Bedömningsmatris</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left p-2">Faktor</th><th className="text-left p-2">Bedömning</th><th className="text-left p-2">Not</th></tr></thead>
                <tbody>{ma.assessment.map((a: any, i: number) => (
                  <tr key={i} className="border-b"><td className="p-2 font-medium">{a.factor}</td><td className="p-2">{a.rating}</td><td className="p-2 text-muted-foreground">{a.note}</td></tr>
                ))}</tbody>
              </table>
            </CardContent></Card>
        )}
        {ma.demographics && (
          <Card><CardHeader><CardTitle>Demografi & upptagningsområde</CardTitle></CardHeader>
            <CardContent><div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{ma.demographics}</div></CardContent>
          </Card>
        )}
        {ma.competitors && (
          <Card><CardHeader><CardTitle>Konkurrentkartläggning</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">{ma.competitors.map((c: any, i: number) => (
                <div key={i} className="border rounded p-3 flex justify-between items-start gap-4">
                  <div><div className="font-medium">{c.name} <Badge variant="outline" className="ml-1 text-[10px]">{c.type}</Badge></div>
                    <p className="text-sm text-muted-foreground mt-1">{c.positioning}</p></div>
                  <Badge variant={c.threat_level === "hög" ? "destructive" : c.threat_level === "medel" ? "default" : "secondary"}>
                    Hot: {c.threat_level}
                  </Badge>
                </div>
              ))}</div>
            </CardContent></Card>
        )}
        {ma.implications && (
          <Card><CardHeader><CardTitle>Strategiska implikationer</CardTitle></CardHeader>
            <CardContent><ul className="space-y-2">{ma.implications.map((s: string, i: number) => (
              <li key={i} className="flex gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /><span className="text-sm">{s}</span></li>
            ))}</ul></CardContent>
          </Card>
        )}
        {personas.length > 0 && (
          <Card><CardHeader><CardTitle>Personas</CardTitle></CardHeader>
            <CardContent><div className="grid gap-3 md:grid-cols-2">{personas.map((p: any, i: number) => (
              <div key={i} className="border rounded p-3">
                <h4 className="font-medium">{p.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                <div className="mt-2 text-xs"><span className="font-medium">Pain:</span> {(p.pain_points || []).join(", ")}</div>
                <div className="text-xs"><span className="font-medium">Triggers:</span> {(p.triggers || []).join(", ")}</div>
              </div>
            ))}</div></CardContent></Card>
        )}
      </TabsContent>

      <TabsContent value="strategy" className="space-y-4">
        <Card><CardHeader><CardTitle>Positionering & tonalitet</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs uppercase text-muted-foreground">Positionering</Label><p className="text-sm mt-1">{strat.positioning}</p></div>
            <div><Label className="text-xs uppercase text-muted-foreground">Tonalitet</Label><p className="text-sm mt-1">{strat.tonality}</p></div>
          </CardContent></Card>
        {strat.channels && (
          <Card><CardHeader><CardTitle>Kanalstrategi</CardTitle></CardHeader>
            <CardContent><table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Kanal</th><th className="text-left p-2">Roll</th><th className="text-left p-2">Prio</th><th className="text-left p-2">Start</th></tr></thead>
              <tbody>{strat.channels.map((c: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2 font-medium">{c.channel}</td><td className="p-2 text-muted-foreground">{c.role}</td>
                  <td className="p-2"><Badge variant={c.priority === "kritisk" ? "destructive" : "secondary"}>{c.priority}</Badge></td>
                  <td className="p-2 text-xs">{c.start_when}</td></tr>
              ))}</tbody></table></CardContent></Card>
        )}
        {strat.goals && (
          <Card><CardHeader><CardTitle>12-månadersmål</CardTitle></CardHeader>
            <CardContent><table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Mål</th><th className="text-left p-2">Mätetal</th><th className="text-left p-2">Tidslinje</th></tr></thead>
              <tbody>{strat.goals.map((g: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2 font-medium">{g.metric}</td><td className="p-2">{g.target}</td><td className="p-2 text-muted-foreground">{g.timeframe}</td></tr>
              ))}</tbody></table></CardContent></Card>
        )}
        {strat.content_plan && (
          <Card><CardHeader><CardTitle>Innehållsplan (6 mån)</CardTitle></CardHeader>
            <CardContent><table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Mån</th><th className="text-left p-2">Typ</th><th className="text-left p-2">Titel</th><th className="text-left p-2">Sökord</th></tr></thead>
              <tbody>{strat.content_plan.map((c: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2">{c.month}</td><td className="p-2"><Badge variant="outline">{c.type}</Badge></td>
                  <td className="p-2">{c.title}</td><td className="p-2 text-muted-foreground font-mono text-xs">{c.target_kw}</td></tr>
              ))}</tbody></table></CardContent></Card>
        )}
      </TabsContent>

      <TabsContent value="keywords">
        <Card><CardHeader><CardTitle>Sökordsuniversum ({kws.length})</CardTitle>
          <CardDescription>Genererat från brief + konkurrentanalys, berikat med Google-volymer.</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Sökord</th><th className="text-left p-2">Kluster</th><th className="text-left p-2">Intent</th><th className="text-right p-2">Volym/mån</th><th className="text-right p-2">CPC</th></tr></thead>
              <tbody>{kws.map((k: any, i: number) => (
                <tr key={i} className="border-b hover:bg-muted/30"><td className="p-2 font-mono text-xs">{k.keyword}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[10px]">{k.cluster}</Badge></td>
                  <td className="p-2 text-xs">{k.intent}</td>
                  <td className="p-2 text-right tabular-nums">{(k.volume || 0).toLocaleString("sv-SE")}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{k.cpc ? k.cpc.toFixed(1) : "—"}</td>
                </tr>
              ))}</tbody></table></div>
          </CardContent></Card>
      </TabsContent>

      <TabsContent value="sitemap">
        <Card><CardHeader><CardTitle>Sajtkarta ({sitemap.length} sidor)</CardTitle>
          <CardDescription>Föreslagen struktur med målsökord per sida.</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left p-2">Slug</th><th className="text-left p-2">H1</th>
                <th className="text-left p-2">Primärt sökord</th><th className="text-left p-2">Intent</th>
                <th className="text-left p-2">Prio</th><th className="text-right p-2">Volym</th>
              </tr></thead>
              <tbody>{sitemap.map((p: any, i: number) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  <td className="p-2 font-mono text-xs">/{p.slug}</td>
                  <td className="p-2">{p.h1}</td>
                  <td className="p-2 text-xs text-muted-foreground">{p.primary_kw}</td>
                  <td className="p-2 text-xs">{p.intent}</td>
                  <td className="p-2"><Badge variant={p.priority === "high" ? "default" : p.priority === "medium" ? "secondary" : "outline"}>{p.priority}</Badge></td>
                  <td className="p-2 text-right tabular-nums">{(p.primary_volume || 0).toLocaleString("sv-SE")}</td>
                </tr>
              ))}</tbody></table></div>
            <Button className="mt-4" variant="outline" size="sm" onClick={() => exportSitemapCsv(sitemap)}>Exportera CSV</Button>
          </CardContent></Card>
      </TabsContent>

      <TabsContent value="forecast">
        <ForecastView forecast={forecast} currency={currency} />
      </TabsContent>
    </Tabs>
  );
}

function exportSitemapCsv(sitemap: any[]) {
  const header = ["slug","h1","meta_title","primary_kw","secondary_kws","intent","priority","primary_volume"];
  const rows = sitemap.map(p => [
    p.slug, p.h1, p.meta_title || "", p.primary_kw,
    (p.secondary_kws || []).join(" | "), p.intent, p.priority, p.primary_volume || 0,
  ]);
  const csv = [header, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sajtkarta.csv"; a.click();
  URL.revokeObjectURL(url);
}

function ForecastView({ forecast, currency }: { forecast: any; currency: any }) {
  const scenarios = ["realistic", "pessimistic", "optimistic"] as const;
  const labels: Record<string, string> = {
    realistic: "Realistisk", pessimistic: "Pessimistisk", optimistic: "Optimistisk",
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map(s => {
          const arr = forecast[s] || [];
          const last = arr[arr.length - 1];
          const m6 = arr[5];
          return (
            <Card key={s}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{labels[s]}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Månad 6 trafik:</span>
                  <span className="font-mono">{m6?.monthlyClicks?.toLocaleString("sv-SE") || 0} klick/mån</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Månad 12 trafik:</span>
                  <span className="font-mono">{last?.monthlyClicks?.toLocaleString("sv-SE") || 0} klick/mån</span></div>
                <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Totalt 12 mån:</span>
                  <span className="font-mono font-semibold">{formatMoney(last?.cumulativeRevenue || 0, currency, { compact: true })}</span></div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card><CardHeader><CardTitle>Realistisk månadsprognos</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left p-2">Mån</th><th className="text-right p-2">Snittpos</th>
              <th className="text-right p-2">Klick</th><th className="text-right p-2">Konv.</th>
              <th className="text-right p-2">Intäkt</th><th className="text-right p-2">Ackum.</th></tr></thead>
            <tbody>{(forecast.realistic || []).map((p: any) => (
              <tr key={p.month} className="border-b">
                <td className="p-2">{p.month}</td>
                <td className="p-2 text-right tabular-nums">{p.avgPosition}</td>
                <td className="p-2 text-right tabular-nums">{p.monthlyClicks.toLocaleString("sv-SE")}</td>
                <td className="p-2 text-right tabular-nums">{p.monthlyConversions}</td>
                <td className="p-2 text-right tabular-nums">{formatMoney(p.monthlyRevenue, currency, { compact: true })}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{formatMoney(p.cumulativeRevenue, currency, { compact: true })}</td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
