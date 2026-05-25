import { useState } from "react";
import { ChevronDown, ShieldCheck, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useKeywordPlannerIdeas } from "@/hooks/useKeywordPlannerIdeas";
import { reconnectGoogle } from "@/lib/googleOAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { KeywordPlannerIdea } from "@/lib/types";

interface Props {
  projectId: string;
}

const LANGUAGES: [string, string][] = [
  ["1015", "Svenska"],
  ["1000", "Engelska"],
  ["1001", "Tyska"],
];

const LOCATIONS: [string, string][] = [
  ["2752", "Sverige"],
  ["2208", "Danmark"],
  ["2578", "Norge"],
  ["2246", "Finland"],
];

function formatBidSek(micros: number | null): string {
  if (micros == null) return "—";
  return (micros / 1_000_000).toFixed(2);
}

function competitionVariant(c: KeywordPlannerIdea["competition"]): "default" | "secondary" | "destructive" | "outline" {
  if (c === "HIGH") return "destructive";
  if (c === "MEDIUM") return "default";
  if (c === "LOW") return "secondary";
  return "outline";
}

export function KeywordPlannerPanel({ projectId }: Props) {
  const { toast } = useToast();
  const { runs, loading, error, fetch: fetchIdeas } = useKeywordPlannerIdeas(projectId);
  const [open, setOpen] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [seeds, setSeeds] = useState<string[]>([]);
  const [seedUrl, setSeedUrl] = useState("");
  const [language, setLanguage] = useState("1015");
  const [location, setLocation] = useState("2752");
  const [maxIdeas, setMaxIdeas] = useState(200);
  const [reauth, setReauth] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("project_google_settings")
        .select("ads_customer_id")
        .eq("project_id", projectId)
        .maybeSingle();
      if (!cancelled) setCustomerId((data as any)?.ads_customer_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const addSeed = () => {
    const cleaned = seedInput.trim().toLowerCase();
    if (!cleaned) return;
    if (seeds.includes(cleaned)) { setSeedInput(""); return; }
    if (seeds.length >= 20) {
      toast({ title: "Max 20 seeds", variant: "destructive" });
      return;
    }
    setSeeds([...seeds, cleaned]);
    setSeedInput("");
  };

  const removeSeed = (s: string) => setSeeds(seeds.filter((x) => x !== s));

  const canSubmit = !!customerId && (seeds.length > 0 || seedUrl.trim().length > 0);
  const latestCount = runs[0]?.count ?? 0;

  const handleSubmit = async () => {
    if (!customerId) {
      toast({ title: "Inget Ads-konto valt", description: "Välj ett Ads-konto i projektinställningar först.", variant: "destructive" });
      return;
    }
    setReauth(false);
    const result = await fetchIdeas({
      customer_id: customerId,
      seed_keywords: seeds,
      seed_url: seedUrl.trim() || undefined,
      language_code: language,
      location_codes: [location],
      max_ideas: maxIdeas,
    });
    if (result.reason === "reauth_required") {
      setReauth(true);
      return;
    }
    if (!result.ok) {
      toast({ title: "Misslyckades", description: result.error || "Okänt fel", variant: "destructive" });
      return;
    }
    toast({ title: "Klart", description: `${result.count ?? 0} idéer hämtade.` });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition rounded-t"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-medium">Google Ads Keyword Planner</span>
              {latestCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {latestCount} idéer i senaste run
                </Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            {!customerId && (
              <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>Inget Google Ads-konto valt för projektet. Välj kontot i projektinställningar för att hämta idéer.</span>
              </div>
            )}

            {reauth && (
              <div className="flex items-center justify-between gap-2 rounded border border-destructive/30 bg-destructive/10 p-3 text-xs">
                <span>Google-anslutningen behöver förnyas.</span>
                <Button size="sm" variant="outline" onClick={() => reconnectGoogle()}>Koppla om Google Ads</Button>
              </div>
            )}

            {error && !reauth && (
              <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Seed-keywords (max 20)</Label>
                <div className="flex gap-2">
                  <Input
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSeed(); } }}
                    placeholder="t.ex. takläggning stockholm"
                    className="h-9"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addSeed}>Lägg till</Button>
                </div>
                {seeds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {seeds.map((s) => (
                      <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => removeSeed(s)}>
                        {s} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Seed-URL (valfritt)</Label>
                <Input
                  value={seedUrl}
                  onChange={(e) => setSeedUrl(e.target.value)}
                  placeholder="https://exempel.se/landningssida"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Språk</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Region</Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">Max idéer: {maxIdeas}</Label>
                <Slider
                  value={[maxIdeas]}
                  min={50}
                  max={1000}
                  step={50}
                  onValueChange={(v) => setMaxIdeas(v[0] ?? 200)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Idéerna hämtas direkt från Google Ads och sparas som verifierad efterfrågan.
              </p>
              <Button onClick={handleSubmit} disabled={!canSubmit || loading} size="sm" className="gap-2">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {loading ? "Hämtar från Google Ads…" : "Hämta från Google"}
              </Button>
            </div>

            {runs.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground">Senaste runs</p>
                {runs.slice(0, 5).map((run) => {
                  const isOpen = expandedRun === run.run_id;
                  return (
                    <Card key={run.run_id} className="border-border bg-muted/20">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                        onClick={() => setExpandedRun(isOpen ? null : run.run_id)}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono">{new Date(run.fetched_at).toLocaleString("sv-SE")}</span>
                          <Badge variant="outline" className="text-[10px]">{run.count} idéer</Badge>
                          {run.seed_keywords.length > 0 && (
                            <span className="text-muted-foreground">seeds: {run.seed_keywords.slice(0, 3).join(", ")}{run.seed_keywords.length > 3 ? "…" : ""}</span>
                          )}
                          {run.seed_url && <span className="text-muted-foreground">url: {run.seed_url}</span>}
                        </div>
                        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Keyword</TableHead>
                                <TableHead className="text-right">Avg/mån</TableHead>
                                <TableHead>Konkurrens</TableHead>
                                <TableHead className="text-right">CPC-spann (SEK)</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {run.ideas.slice(0, 200).map((idea) => (
                                <TableRow key={idea.id}>
                                  <TableCell className="font-mono text-xs">{idea.keyword}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{idea.avg_monthly_searches ?? "—"}</TableCell>
                                  <TableCell>
                                    <Badge variant={competitionVariant(idea.competition)} className="text-[10px]">
                                      {idea.competition || "UNKNOWN"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatBidSek(idea.low_top_of_page_bid_micros)}–{formatBidSek(idea.high_top_of_page_bid_micros)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-[10px] h-7"
                                      onClick={() => toast({ title: "Kommer i nästa sprint" })}
                                    >
                                      {/* TODO R3c-followup: merge into keyword_universe_json */}
                                      Lägg till i universe
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {run.ideas.length > 200 && (
                            <p className="text-[10px] text-muted-foreground text-center py-2">
                              Visar 200 av {run.ideas.length} — exportera senare via CSV
                            </p>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
