import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Download, RefreshCw, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { KeywordUniverse } from "@/lib/types";
import {
  ContentBrief, briefToMarkdown,
  downloadBriefDOCX, downloadBriefJSON, downloadBriefMarkdown, downloadBriefPDF,
} from "@/lib/contentBriefExport";

interface Props {
  analysisId: string;
  universe: KeywordUniverse;
}

export function ContentBriefsTab({ analysisId, universe }: Props) {
  const { toast } = useToast();
  const clusters = Array.from(new Set(universe.keywords.filter((k) => !k.isNegative).map((k) => k.cluster)));
  const clusterStats = clusters.map((c) => {
    const kws = universe.keywords.filter((k) => k.cluster === c && !k.isNegative);
    return {
      cluster: c,
      count: kws.length,
      volume: kws.reduce((s, k) => s + (k.searchVolume ?? 0), 0),
      avgKd: kws.filter((k) => k.kd != null).reduce((s, k, _, arr) => s + (k.kd! / arr.length), 0),
    };
  }).sort((a, b) => b.volume - a.volume);

  const [selected, setSelected] = useState<string>(clusterStats[0]?.cluster || "");
  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedClusters, setSavedClusters] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("content_briefs").select("cluster").eq("analysis_id", analysisId).then(({ data }) => {
      if (data) setSavedClusters(new Set(data.map((d: any) => d.cluster)));
    });
  }, [analysisId]);

  useEffect(() => {
    if (!selected) return;
    setBrief(null);
    supabase.from("content_briefs").select("payload").eq("analysis_id", analysisId).eq("cluster", selected).maybeSingle().then(({ data }) => {
      if (data) setBrief(data.payload as ContentBrief);
    });
  }, [selected, analysisId]);

  const generate = async (force = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-brief", { body: { analysis_id: analysisId, cluster: selected, force } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setBrief((data as any).brief);
      setSavedClusters((prev) => new Set([...prev, selected]));
      toast({ title: (data as any).cached ? "Brief hämtad från cache" : "Brief genererad", description: selected });
    } catch (e: any) {
      toast({ title: "Kunde inte generera", description: e?.message || "Okänt fel", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Välj kluster</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Välj kluster..." /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {clusterStats.map((c) => (
                    <SelectItem key={c.cluster} value={c.cluster}>
                      {savedClusters.has(c.cluster) ? "✓ " : ""}{c.cluster} — {c.count} kw, {c.volume} vol
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => generate(false)} disabled={!selected || loading} className="gap-2">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {brief ? "Visa brief" : "Generera brief"}
            </Button>
            {brief && (
              <Button variant="outline" onClick={() => generate(true)} disabled={loading} className="gap-2">
                <RefreshCw className="h-3 w-3" /> Generera om
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{savedClusters.size} av {clusters.length} kluster har briefs sparade</p>
        </CardContent>
      </Card>

      {brief && (
        <>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => downloadBriefMarkdown(selected, brief)} className="gap-2">
                  <Download className="h-3 w-3" /> .md
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBriefDOCX(selected, brief)} className="gap-2">
                  <Download className="h-3 w-3" /> .docx
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBriefPDF(selected, brief)} className="gap-2">
                  <Download className="h-3 w-3" /> .pdf
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBriefJSON(selected, brief)} className="gap-2">
                  <Download className="h-3 w-3" /> .json
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(briefToMarkdown(selected, brief)).then(() => toast({ title: "Kopierat" }))}>
                  Kopiera Markdown
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-2xl">{selected}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge>Primary: {brief.primaryKeyword}</Badge>
                  <Badge variant="secondary">{brief.targetWordCount} ord</Badge>
                </div>
              </div>

              <Section title="Search intent">{brief.searchIntent}</Section>

              <Section title="SEO-meta">
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Title:</span> <span className="font-mono">{brief.title}</span> <span className="text-xs text-muted-foreground">({brief.title.length} tecken)</span></div>
                  <div><span className="text-muted-foreground">Meta:</span> <span className="font-mono">{brief.metaDescription}</span> <span className="text-xs text-muted-foreground">({brief.metaDescription.length} tecken)</span></div>
                </div>
              </Section>

              <Section title="Sidstruktur">
                <p className="font-semibold mb-3">H1: {brief.h1}</p>
                <ol className="space-y-3">
                  {brief.outline.map((s, i) => (
                    <li key={i} className="border-l-2 border-primary/40 pl-3">
                      <p className="font-semibold text-sm">{i + 1}. {s.h2}</p>
                      <p className="text-sm text-muted-foreground mt-1">{s.summary}</p>
                      {s.h3s?.length ? <ul className="text-xs mt-1 list-disc list-inside text-muted-foreground">{s.h3s.map((h, j) => <li key={j}>{h}</li>)}</ul> : null}
                    </li>
                  ))}
                </ol>
              </Section>

              <div className="grid md:grid-cols-2 gap-5">
                <Section title="Sekundära sökord">
                  <div className="flex flex-wrap gap-1">{brief.secondaryKeywords.map((k, i) => <Badge key={i} variant="outline">{k}</Badge>)}</div>
                </Section>
                <Section title="LSI / entiteter">
                  <div className="flex flex-wrap gap-1">{brief.lsiTerms.map((k, i) => <Badge key={i} variant="secondary">{k}</Badge>)}</div>
                </Section>
              </div>

              <Section title="FAQ (PAA)">
                <div className="space-y-3">
                  {brief.faq.map((f, i) => (
                    <div key={i} className="border-b border-border pb-2 last:border-0">
                      <p className="font-semibold text-sm">Q: {f.q}</p>
                      <p className="text-sm text-muted-foreground mt-1">A: {f.a}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Interna länkar">
                <ul className="space-y-2 text-sm">
                  {brief.internalLinks.map((l, i) => (
                    <li key={i}>
                      <span className="font-mono">[{l.anchor}]</span> → <span className="text-muted-foreground">"{l.targetCluster}"</span>
                      <span className="text-xs text-muted-foreground block">{l.why}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {brief.externalReferences?.length ? (
                <Section title="Auktoritativa källor">
                  <ul className="text-sm list-disc list-inside text-muted-foreground">{brief.externalReferences.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </Section>
              ) : null}

              {brief.schemaMarkup?.length ? (
                <Section title="Schema.org">
                  <div className="flex gap-2 flex-wrap">{brief.schemaMarkup.map((s, i) => <Badge key={i}>{s}</Badge>)}</div>
                </Section>
              ) : null}

              <Section title="CTA">{brief.cta}</Section>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="text-sm">{children}</div>
    </div>
  );
}
