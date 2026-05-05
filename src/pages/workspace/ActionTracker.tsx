import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useActionItems, type ActionItem } from "@/hooks/useActionItems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, CheckCircle2, ListChecks, BarChart3, ChevronDown, ChevronRight,
  MessageSquare, Send, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ActionImpact } from "@/components/workspace/ActionImpact";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = [
  { value: "seo", label: "SEO" },
  { value: "ads", label: "Google Ads" },
  { value: "content", label: "Innehåll" },
  { value: "technical", label: "Teknisk" },
  { value: "general", label: "Övrigt" },
];

const PRIORITIES = [
  { value: "critical", label: "Kritisk" },
  { value: "high", label: "Hög" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Låg" },
];

const STATUSES: { value: ActionItem["status"]; label: string }[] = [
  { value: "todo", label: "Att göra" },
  { value: "in_progress", label: "Pågår" },
  { value: "done", label: "Klar" },
  { value: "archived", label: "Arkiverad" },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manuell",
  seo_diagnosis: "SEO-diagnos",
  ads_audit: "Ads Audit",
  ads_wasted: "Wasted Spend",
  ads_negatives: "Negativa sökord",
  ads_pacing: "Ads Pacing",
  ads_rsa: "RSA",
  briefing: "Veckobriefing",
  cluster_action: "Kluster",
  keyword_cluster: "Kluster",
  seo_audit: "SEO Audit",
};

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    high: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    medium: "bg-primary/10 text-primary border-primary/30",
    low: "bg-muted text-muted-foreground border-border",
  };
  return map[p] || map.medium;
}

export default function ActionTracker() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { items, loading, create, update, remove, markImplemented, reload } = useActionItems(projectId);
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("open");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", category: "general", priority: "medium" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [pushing, setPushing] = useState<Record<string, boolean>>({});

  const isPushable = (item: ActionItem) =>
    ["ads_wasted", "ads_negatives", "ads_pacing", "ads_rsa"].includes(item.source_type || "");

  const sourceTypes = useMemo(() => {
    const types = new Set(items.map((i) => i.source_type).filter(Boolean) as string[]);
    return Array.from(types);
  }, [items]);

  const openCount = items.filter((i) => i.status !== "done" && i.status !== "archived").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  const implementedWithValue = items.filter(
    (i) => i.status === "done" && i.expected_impact_sek && i.expected_impact_sek > 0
  );
  const totalImplementedValue = implementedWithValue.reduce((s, i) => s + (i.expected_impact_sek ?? 0), 0);
  const openValue = items
    .filter((i) => i.status !== "done" && i.status !== "archived" && i.expected_impact_sek)
    .reduce((s, i) => s + (i.expected_impact_sek ?? 0), 0);

  const filtered = items
    .filter((i) => {
      if (filter === "open") return i.status === "todo" || i.status === "in_progress";
      if (filter === "done") return i.status === "done";
      if (filter === "all") return true;
      return i.source_type === filter;
    })
    .sort((a, b) => {
      if (a.status !== "done" && b.status !== "done") {
        return (b.expected_impact_sek ?? 0) - (a.expected_impact_sek ?? 0);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const addNote = async (item: ActionItem) => {
    const text = (noteDraft[item.id] || "").trim();
    if (!text) return;
    const existing = Array.isArray((item as any).notes) ? (item as any).notes : [];
    const next = [...existing, { text, at: new Date().toISOString() }];
    await update(item.id, { ...(item as any), notes: next } as any);
    setNoteDraft({ ...noteDraft, [item.id]: "" });
    toast({ title: "Kommentar sparad" });
    reload();
  };

  const reviewAndPush = async (item: ActionItem) => {
    if (!item.source_payload) return toast({ title: "Saknar payload", variant: "destructive" });
    if (!confirm(`Pusha "${item.title}" till Google Ads?`)) return;
    setPushing({ ...pushing, [item.id]: true });
    try {
      const { error } = await supabase.functions.invoke("ads-mutate", {
        body: { project_id: projectId, source_action_item_id: item.id, ...(item.source_payload as any) },
      });
      if (error) throw error;
      toast({ title: "Pushad till Google Ads" });
      await update(item.id, { status: "done", implemented_at: new Date().toISOString() });
      reload();
    } catch (e: any) {
      toast({ title: "Push misslyckades", description: e.message, variant: "destructive" });
    } finally {
      setPushing({ ...pushing, [item.id]: false });
    }
  };

  const handleCreate = async () => {
    if (!draft.title.trim()) {
      toast({ title: "Titel saknas", variant: "destructive" });
      return;
    }
    await create({ ...draft, source_type: "manual" });
    setDraft({ title: "", description: "", category: "general", priority: "medium" });
    setShowNew(false);
    toast({ title: "Åtgärd skapad" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-primary" />
            Åtgärder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allt vi rekommenderat — sorterat på kronvärde. Effekt mäts efter implementation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              toast({ title: "Mäter effekt…" });
              const { data, error } = await supabase.functions.invoke("measure-action-impact", {
                body: { project_id: projectId },
              });
              if (error) toast({ title: "Mätning misslyckades", description: error.message, variant: "destructive" });
              else toast({ title: "Klart", description: `${(data as any)?.measured ?? 0} mätpunkter sparade.` });
            }}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Mät effekt
          </Button>
          <Button onClick={() => setShowNew((s) => !s)} className="gap-2">
            <Plus className="h-4 w-4" />
            Ny åtgärd
          </Button>
        </div>
      </div>

      {/* ROI summary */}
      {(implementedWithValue.length > 0 || openValue > 0 || items.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Öppna åtgärder</div>
            <div className="font-mono text-xl mt-1">{openCount}</div>
          </div>
          {openValue > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Värde att hämta</div>
              <div className="font-mono text-xl mt-1 text-emerald-600 dark:text-emerald-400">
                {openValue.toLocaleString("sv-SE")} kr/mån
              </div>
            </div>
          )}
          {implementedWithValue.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Implementerat</div>
              <div className="font-mono text-xl mt-1">
                {implementedWithValue.length} åtgärder
                {totalImplementedValue > 0 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    ({totalImplementedValue.toLocaleString("sv-SE")} kr/mån)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter pills — source-based */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: "open", l: `Öppna (${openCount})` },
          { v: "done", l: `Klara (${doneCount})` },
          { v: "all", l: "Alla" },
          ...sourceTypes.map((s) => ({ v: s, l: SOURCE_LABELS[s] ?? s })),
        ].map((f) => (
          <Button
            key={f.v}
            size="sm"
            variant={filter === f.v ? "default" : "outline"}
            onClick={() => setFilter(f.v)}
          >
            {f.l}
          </Button>
        ))}
      </div>

      {/* New form */}
      {showNew && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Ny åtgärd</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Titel (kort, action-orienterad)"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              placeholder="Beskrivning — vad ska göras, varför, hur?"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Avbryt</Button>
              <Button onClick={handleCreate}>Skapa</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ListChecks className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Inga åtgärder ännu</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Åtgärder skapas automatiskt från SEO-diagnos, Ads-audit och veckobriefing — eller lägg till manuellt.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center pt-1">
              <Button size="sm" variant="outline" onClick={() => navigate(`/clients/${projectId}/keywords`)}>
                Kör SEO-diagnos
              </Button>
              <Button size="sm" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till manuellt
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id} className={item.status === "done" ? "opacity-70" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={item.status === "done"}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        markImplemented(item.id);
                        toast({ title: "Markerad som klar", description: "Effekten mäts under kommande veckor." });
                      } else {
                        update(item.id, { status: "todo", implemented_at: null });
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className={`font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </h3>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {item.expected_impact_sek != null && item.expected_impact_sek > 0 && (
                          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            +{item.expected_impact_sek.toLocaleString("sv-SE")} kr/mån
                          </span>
                        )}
                        <Badge variant="outline" className={priorityBadge(item.priority)}>
                          {PRIORITIES.find((p) => p.value === item.priority)?.label || item.priority}
                        </Badge>
                        {item.source_type && item.source_type !== "manual" && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {SOURCE_LABELS[item.source_type] ?? item.source_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    )}
                    {item.expected_impact && (
                      <p className="text-xs text-primary mt-2">→ {item.expected_impact}</p>
                    )}
                    {item.implemented_at && (
                      <>
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          Implementerad {new Date(item.implemented_at).toLocaleDateString("sv-SE")}
                        </p>
                        <ActionImpact actionId={item.id} />
                      </>
                    )}
                    {(item.source_payload || isPushable(item) || Array.isArray((item as any).metadata?.steps)) && (
                      <button
                        onClick={() => setExpanded({ ...expanded, [item.id]: !expanded[item.id] })}
                        className="text-xs text-primary mt-2 inline-flex items-center gap-1 hover:underline"
                      >
                        {expanded[item.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Detaljer & kommentarer
                      </button>
                    )}

                    {expanded[item.id] && (
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        {Array.isArray((item as any).metadata?.steps) && (item as any).metadata.steps.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Steg att följa</div>
                            <ol className="space-y-1">
                              {((item as any).metadata.steps as string[]).map((step, i) => (
                                <li key={i} className="flex gap-2 text-sm">
                                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium">
                                    {i + 1}
                                  </span>
                                  <span className="text-muted-foreground">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {item.source_payload && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Källdata</div>
                            <pre className="text-xs bg-muted/40 p-2 rounded border border-border overflow-auto max-h-48">
{JSON.stringify(item.source_payload, null, 2)}
                            </pre>
                          </div>
                        )}

                        {Array.isArray((item as any).notes) && (item as any).notes.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Kommentarer</div>
                            <div className="space-y-1">
                              {(item as any).notes.map((n: any, i: number) => (
                                <div key={i} className="text-xs p-2 rounded bg-muted/40 border border-border">
                                  <div className="text-[10px] text-muted-foreground">{new Date(n.at).toLocaleString("sv-SE")}</div>
                                  {n.text}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Textarea
                              value={noteDraft[item.id] || ""}
                              onChange={(e) => setNoteDraft({ ...noteDraft, [item.id]: e.target.value })}
                              placeholder="Lägg till kommentar…"
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => addNote(item)}>
                            <MessageSquare className="h-3 w-3" /> Spara
                          </Button>
                          {isPushable(item) && item.status !== "done" && (
                            <Button
                              size="sm"
                              className="gap-1"
                              onClick={() => reviewAndPush(item)}
                              disabled={pushing[item.id]}
                            >
                              {pushing[item.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Review & push
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={item.status} onValueChange={(v) => update(item.id, { status: v })}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
