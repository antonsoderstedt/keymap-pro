import { useState } from "react";
import { useParams } from "react-router-dom";
import { useActionItems, type ActionItem } from "@/hooks/useActionItems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CheckCircle2, ListChecks, BarChart3 } from "lucide-react";
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
  const { items, loading, create, update, remove, markImplemented } = useActionItems(projectId);
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("open");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", category: "general", priority: "medium" });

  const filtered = items.filter((i) => {
    if (filter === "open") return i.status === "todo" || i.status === "in_progress";
    if (filter === "done") return i.status === "done";
    if (filter === "all") return true;
    return i.category === filter;
  });

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
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-primary" />
            Action Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allt vi rekommenderat — och hur det går när det implementerats.
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
              else toast({ title: "Klart", description: `${data?.measured ?? 0} mätpunkter sparade.` });
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: "open", l: `Öppna (${items.filter((i) => i.status !== "done" && i.status !== "archived").length})` },
          { v: "done", l: `Klara (${items.filter((i) => i.status === "done").length})` },
          { v: "all", l: "Alla" },
          ...CATEGORIES.map((c) => ({ v: c.value, l: c.label })),
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
          {[1, 2, 3].map((i) => <Card key={i} className="h-20 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Inga åtgärder här ännu.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Åtgärder skapas automatiskt från analyser och audits, eller manuellt.
            </p>
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
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="outline" className={priorityBadge(item.priority)}>
                          {PRIORITIES.find((p) => p.value === item.priority)?.label || item.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIES.find((c) => c.value === item.category)?.label || item.category}
                        </Badge>
                        {item.source_type && item.source_type !== "manual" && (
                          <Badge variant="secondary" className="text-xs">{item.source_type}</Badge>
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
