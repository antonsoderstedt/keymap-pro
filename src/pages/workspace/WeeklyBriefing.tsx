import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertTriangle, Target, RefreshCw, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, valueColor, isSupportedCurrency, type Currency } from "@/lib/revenue";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import ReactMarkdown from "react-markdown";
import WeeklyBriefingHistory from "@/components/workspace/WeeklyBriefingHistory";
import BriefingDrillDown, { type DrillDownItem } from "@/components/workspace/BriefingDrillDown";
import BriefingEmailPanel from "@/components/workspace/BriefingEmailPanel";

interface Briefing {
  id: string;
  week_start: string;
  summary_md: string | null;
  wins: any[];
  risks: any[];
  actions: any[];
  total_value_at_stake_sek: number;
  created_at: string;
}

function startOfIsoWeek(d: Date): string {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

const valueClass = (v: number) => {
  const c = valueColor(v);
  if (c === "red") return "bg-destructive/10 text-destructive border-destructive/30";
  if (c === "yellow") return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
  if (c === "green") return "bg-primary/10 text-primary border-primary/30";
  return "bg-muted text-muted-foreground border-border";
};

export default function WeeklyBriefing() {
  const { id } = useParams<{ id: string }>();
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>(startOfIsoWeek(new Date()));
  const [generating, setGenerating] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [drill, setDrill] = useState<{ item: DrillDownItem; kind: "win" | "risk" | "action" } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("weekly_briefings")
      .select("*")
      .eq("project_id", id)
      .order("week_start", { ascending: false })
      .limit(12);
    setBriefings((data as Briefing[]) || []);
  };
  useEffect(() => { load(); }, [id]);

  const current = useMemo(
    () => briefings.find(b => b.week_start === selectedWeek) || briefings[0],
    [briefings, selectedWeek],
  );

  const generate = async () => {
    if (!id) return;
    setGenerating(true);
    setHistoryKey((k) => k + 1);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-briefing", {
        body: { project_id: id, week_start: selectedWeek, trigger: "manual" },
      });
      if (error) throw error;
      toast.success("Briefing genererad");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte generera briefing");
    } finally {
      setGenerating(false);
      setHistoryKey((k) => k + 1);
    }
  };

  const downloadPdf = () => {
    if (!printRef.current) return;
    window.print();
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" /> Veckans strategibriefing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-genererad analys av läget — vinster, risker och vad du ska göra härnäst, med kronvärde på allt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="text-sm bg-card border border-border rounded-md px-3 py-2"
          >
            <option value={startOfIsoWeek(new Date())}>Denna vecka</option>
            {briefings.map(b => (
              <option key={b.id} value={b.week_start}>v.{b.week_start}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={generate} disabled={generating} className="gap-2">
            <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Genererar…" : "Generera"}
          </Button>
          {current && (
            <>
              <Button size="sm" variant="ghost" onClick={downloadPdf} className="gap-2">
                <Download className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="ghost" disabled className="gap-2" title="Aktiveras när byrå-domän är konfigurerad">
                <Mail className="h-3 w-3" /> Email
              </Button>
            </>
          )}
        </div>
      </div>

      {!current ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Sparkles className="h-10 w-10 text-primary mx-auto" />
            <div>
              <h3 className="font-serif text-xl">Ingen briefing för denna vecka</h3>
              <p className="text-sm text-muted-foreground mt-1">Klicka "Generera" så bygger AI:n veckans strategibriefing åt dig.</p>
            </div>
            <Button onClick={generate} disabled={generating} className="gap-2">
              <Sparkles className="h-4 w-4" /> {generating ? "Genererar…" : "Generera briefing nu"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div ref={printRef} className="space-y-6">
          {/* Hero — totalvärde */}
          <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/30">
            <CardContent className="p-8">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Värde att hämta hem denna vecka</div>
              <div className="font-serif text-5xl mt-2 text-primary">
                {formatSEK(current.total_value_at_stake_sek, { compact: true })}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Beräknat på dina sökord, positioner, annonsspill och åtgärder. Genererad {new Date(current.created_at).toLocaleString("sv-SE")}.
              </p>
            </CardContent>
          </Card>

          {/* AI-text */}
          {current.summary_md && (
            <Card>
              <CardContent className="p-6 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{current.summary_md}</ReactMarkdown>
              </CardContent>
            </Card>
          )}

          {/* Tre kolumner */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Column icon={<TrendingUp className="h-4 w-4 text-primary" />} title="Vinster" items={current.wins} emptyText="Inga mätbara vinster denna vecka." onSelect={(it) => setDrill({ item: it, kind: "win" })} />
            <Column icon={<AlertTriangle className="h-4 w-4 text-destructive" />} title="Risker" items={current.risks} emptyText="Inga akuta risker upptäckta." onSelect={(it) => setDrill({ item: it, kind: "risk" })} />
            <Column icon={<Target className="h-4 w-4 text-primary" />} title="Actions" items={current.actions} emptyText="Inga prioriterade actions just nu." onSelect={(it) => setDrill({ item: it, kind: "action" })} />
          </div>
        </div>
      )}

      {id && <BriefingEmailPanel projectId={id} weekStart={selectedWeek} />}
      {id && <WeeklyBriefingHistory projectId={id} refreshKey={historyKey} />}

      <BriefingDrillDown
        item={drill?.item || null}
        kind={drill?.kind || "win"}
        open={!!drill}
        onOpenChange={(v) => !v && setDrill(null)}
      />
    </div>
  );
}

function Column({ icon, title, items, emptyText, onSelect }: { icon: React.ReactNode; title: string; items: any[]; emptyText: string; onSelect: (it: DrillDownItem) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(it)}
              className="w-full text-left p-3 rounded-md border border-border space-y-1 hover:border-primary/50 hover:bg-primary/[0.03] transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium leading-snug">{it.title}</div>
                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  Detaljer →
                </span>
              </div>
              {it.why && <div className="text-[11px] text-muted-foreground">{it.why}</div>}
              {typeof it.value_sek === "number" && it.value_sek > 0 && (
                <Badge variant="outline" className={`text-[10px] ${valueClass(it.value_sek)}`}>
                  {formatSEK(it.value_sek, { compact: true })}/år
                </Badge>
              )}
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
