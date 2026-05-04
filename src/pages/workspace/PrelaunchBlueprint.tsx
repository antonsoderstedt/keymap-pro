import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, X, Rocket, ArrowRight, Pencil, Save, RefreshCw, Eye, EyeOff, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { formatMoney } from "@/lib/revenue";
import { FactCheckCard, type FactCheckPayload } from "@/components/workspace/FactCheckCard";
import { PrelaunchStepper, type PrelaunchStep } from "@/components/workspace/PrelaunchStepper";

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
  fact_check?: FactCheckPayload | null;
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
  selected_keywords?: string[] | null;
  ads_plan?: any;
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
  const [factChecking, setFactChecking] = useState(false);

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
    setBriefs(((data as unknown) as Brief[]) || []);
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
    setBlueprint(((data as unknown) as Blueprint) || null);
    if (data && !editingBriefId) setActiveTab("result");
  }

  async function runFactCheck() {
    if (!activeBriefId) return;
    setFactChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("prelaunch-factcheck", {
        body: { brief_id: activeBriefId },
      });
      if (error) throw error;
      toast({ title: "Faktakoll klar", description: data?.fact_check?.overall_summary?.slice(0, 120) || "Resultat sparat." });
      await loadBriefs();
    } catch (e: any) {
      toast({ title: "Faktakoll misslyckades", description: e.message, variant: "destructive" });
    } finally {
      setFactChecking(false);
    }
  }

  async function recomputeFromSelection(selected: string[]) {
    if (!blueprint) return;
    const { error } = await supabase.functions.invoke("prelaunch-recompute", {
      body: { blueprint_id: blueprint.id, selected_keywords: selected },
    });
    if (error) {
      toast({ title: "Omräkning misslyckades", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Klart!", description: "Sajtkarta, ads-plan och prognos uppdaterade." });
    await loadBlueprint(blueprint.brief_id);
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
        setBriefs([(brief as unknown) as Brief, ...briefs]);
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
              <CardTitle>
                {editingBriefId ? "Redigera brief" : "Brief — verksamhet & marknad"}
              </CardTitle>
              <CardDescription>
                {editingBriefId
                  ? "Ändra fälten och spara, eller spara + generera om resultatet (~60-120 sek)."
                  : "Ju mer detaljerad input, desto bättre resultat. Beräkningstid: ~60-120 sekunder."}
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

              {editingBriefId ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={saveBriefOnly}
                    disabled={saving || running}
                    className="flex-1"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Spara ändringar
                  </Button>
                  <Button onClick={createBriefAndRun} disabled={running || saving} className="flex-1">
                    {running ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Genererar om…</>
                    ) : (
                      <><RefreshCw className="mr-2 h-4 w-4" /> Spara & generera om</>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={resetForm} disabled={running || saving}>
                    Avbryt
                  </Button>
                </div>
              ) : (
                <Button onClick={createBriefAndRun} disabled={running} className="w-full">
                  {running ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Genererar blueprint…</>
                  ) : (
                    <><Rocket className="mr-2 h-4 w-4" /> Generera blueprint</>
                  )}
                </Button>
              )}

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

        <TabsContent value="result" className="mt-4 space-y-4">
          {activeBrief && (
            <PrelaunchStepper
              current={
                activeBrief.status === "researching" ? "market" :
                !blueprint ? "factcheck" :
                (blueprint.selected_keywords && blueprint.selected_keywords.length > 0) ? "export" :
                "keywords"
              }
              completed={[
                "brief",
                ...(activeBrief.fact_check ? ["factcheck" as PrelaunchStep] : []),
                ...(blueprint ? ["market" as PrelaunchStep, "keywords" as PrelaunchStep, "strategy" as PrelaunchStep] : []),
                ...((blueprint?.selected_keywords?.length ?? 0) > 0 ? ["export" as PrelaunchStep] : []),
              ]}
            />
          )}

          {activeBrief && (
            <FactCheckCard
              factCheck={activeBrief.fact_check}
              onRerun={runFactCheck}
              rerunning={factChecking}
            />
          )}

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
          {blueprint && (
            <BlueprintResult
              blueprint={blueprint}
              currency={currency}
              projectId={projectId!}
              onRecompute={recomputeFromSelection}
            />
          )}
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

function BlueprintResult({ blueprint, currency, projectId, onRecompute }: { blueprint: Blueprint; currency: any; projectId: string; onRecompute: (selected: string[]) => Promise<void> }) {
  const ma = blueprint.market_analysis || {};
  const strat = blueprint.strategy || {};
  const sitemap = blueprint.sitemap || [];
  const personas = blueprint.personas || [];
  const forecast = blueprint.forecast || {};
  const kws = blueprint.keyword_universe?.keywords || [];
  const adsPlan = blueprint.ads_plan;

  return (
    <Tabs defaultValue="market" className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="market">Marknadsanalys</TabsTrigger>
        <TabsTrigger value="strategy">Strategi</TabsTrigger>
        <TabsTrigger value="keywords">Sökord ({kws.length})</TabsTrigger>
        <TabsTrigger value="sitemap">Sajtkarta ({sitemap.length})</TabsTrigger>
        {adsPlan && <TabsTrigger value="ads">Ads-plan</TabsTrigger>}
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
        <KeywordSelectorTab
          keywords={kws}
          initialSelected={blueprint.selected_keywords || []}
          onRecompute={onRecompute}
        />
      </TabsContent>

      {adsPlan && (
        <TabsContent value="ads">
          <AdsPlanView adsPlan={adsPlan} currency={currency} />
        </TabsContent>
      )}

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

function KeywordSelectorTab({ keywords, initialSelected, onRecompute }: { keywords: any[]; initialSelected: string[]; onRecompute: (selected: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected.map(k => k.toLowerCase().trim())));
  const [hideZero, setHideZero] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const visible = useMemo(
    () => hideZero ? keywords.filter((k: any) => (k.volume || 0) >= 10) : keywords,
    [keywords, hideZero],
  );
  const zeroCount = keywords.length - keywords.filter((k: any) => (k.volume || 0) >= 10).length;

  const clusters = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const k of visible) {
      const c = k.cluster || "Övrigt";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(k);
    }
    return Array.from(m.entries());
  }, [visible]);

  function toggle(kw: string) {
    const key = kw.toLowerCase().trim();
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  function toggleCluster(items: any[]) {
    const allKeys = items.map(k => k.keyword.toLowerCase().trim());
    const allSelected = allKeys.every(k => selected.has(k));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) allKeys.forEach(k => n.delete(k));
      else allKeys.forEach(k => n.add(k));
      return n;
    });
  }

  const selectedList = Array.from(selected);
  const selectedKws = keywords.filter((k: any) => selected.has(k.keyword.toLowerCase().trim()));
  const totalVolume = selectedKws.reduce((s, k: any) => s + (k.volume || 0), 0);

  async function handleRecompute() {
    setRecomputing(true);
    try { await onRecompute(selectedList); }
    finally { setRecomputing(false); }
  }

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Välj sökord ({selected.size}/{keywords.length})</CardTitle>
              <CardDescription>Bocka i sökord — sajtkarta, ads-plan och prognos räknas om från valen.</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="hide-zero" checked={hideZero} onCheckedChange={setHideZero} />
              <Label htmlFor="hide-zero" className="cursor-pointer flex items-center gap-1">
                {hideZero ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Dölj 0-volym {zeroCount > 0 && `(${zeroCount} st)`}
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {clusters.map(([cluster, items]) => {
            const allKeys = items.map((k: any) => k.keyword.toLowerCase().trim());
            const allSel = allKeys.every((k: string) => selected.has(k));
            const someSel = allKeys.some((k: string) => selected.has(k));
            return (
              <div key={cluster} className="border rounded-md overflow-hidden">
                <div className="flex items-center justify-between p-2 bg-muted/30 border-b">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSel ? true : someSel ? "indeterminate" : false}
                      onCheckedChange={() => toggleCluster(items)}
                    />
                    <span className="font-medium text-sm">{cluster}</span>
                    <Badge variant="outline" className="text-[10px]">{items.length} ord</Badge>
                  </div>
                </div>
                <div className="divide-y">
                  {items.map((k: any, i: number) => {
                    const key = k.keyword.toLowerCase().trim();
                    return (
                      <label key={i} className="flex items-center gap-3 p-2 hover:bg-muted/20 cursor-pointer">
                        <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(k.keyword)} />
                        <span className="font-mono text-xs flex-1 truncate">{k.keyword}</span>
                        <span className="text-xs text-muted-foreground">{k.intent}</span>
                        <span className="text-xs tabular-nums w-16 text-right">{(k.volume || 0).toLocaleString("sv-SE")}</span>
                        <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">{k.cpc ? k.cpc.toFixed(1) : "—"}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-primary/40 rounded-full shadow-lg px-5 py-3 flex items-center gap-4 text-sm">
          <span><strong>{selected.size}</strong> sökord valda</span>
          <span className="text-muted-foreground">·</span>
          <span><strong>{totalVolume.toLocaleString("sv-SE")}</strong> sök/mån</span>
          <Button size="sm" onClick={handleRecompute} disabled={recomputing} className="gap-2">
            {recomputing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Använd valda sökord
          </Button>
        </div>
      )}
    </div>
  );
}

function AdsPlanView({ adsPlan, currency }: { adsPlan: any; currency: any }) {
  const campaigns = adsPlan?.campaigns || [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Google Ads-plan</CardTitle>
          <CardDescription>
            Total daglig budget: <strong>{formatMoney(adsPlan.recommended_total_daily_sek || 0, currency, { compact: true })}</strong> · {campaigns.length} kampanjer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {campaigns.map((c: any, i: number) => (
            <div key={i} className="border rounded-md p-3 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.type} · {formatMoney(c.daily_budget_sek, currency, { compact: true })}/dag</div>
                </div>
                <Badge variant="secondary">{c.ad_groups?.length || 0} ad groups</Badge>
              </div>
              {(c.ad_groups || []).map((ag: any, j: number) => (
                <div key={j} className="border-l-2 border-primary/40 pl-3 ml-2 space-y-1">
                  <div className="text-sm font-medium">{ag.name} <Badge variant="outline" className="text-[9px]">{ag.match_type}</Badge></div>
                  <div className="text-xs text-muted-foreground font-mono">{(ag.keywords || []).slice(0, 6).join(", ")}{ag.keywords?.length > 6 ? "…" : ""}</div>
                  <div className="text-xs"><span className="text-muted-foreground">Headlines:</span> {(ag.headlines || []).slice(0, 4).join(" · ")}</div>
                  <div className="text-xs text-muted-foreground">→ /{ag.landing_slug}</div>
                </div>
              ))}
            </div>
          ))}
          {adsPlan.negative_keywords?.length > 0 && (
            <div className="text-xs">
              <strong>Negativa sökord:</strong> <span className="text-muted-foreground font-mono">{adsPlan.negative_keywords.join(", ")}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
