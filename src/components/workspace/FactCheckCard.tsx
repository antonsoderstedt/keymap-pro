// FactCheckCard — visar verifieringen av klientens påståenden från
// prelaunch-factcheck. Röda flaggor överst, sedan motbevisade, partiella, ovissa.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, ChevronDown, ExternalLink, RefreshCw, Loader2, ShieldCheck } from "lucide-react";

type Verdict = "verified" | "contradicted" | "partially_true" | "unverifiable";

interface ClaimSource {
  url: string;
  title?: string;
  snippet: string;
  source_type: "serp" | "maps" | "scrape";
}

interface FactCheckClaim {
  claim: string;
  type: string;
  verdict: Verdict;
  confidence: "high" | "medium" | "low";
  evidence: string;
  recommendation: string;
  sources: ClaimSource[];
}

export interface FactCheckPayload {
  generated_at?: string;
  overall_summary?: string;
  claims: FactCheckClaim[];
}

interface Props {
  factCheck: FactCheckPayload | null | undefined;
  onRerun?: () => Promise<void> | void;
  rerunning?: boolean;
}

const VERDICT_META: Record<Verdict, { label: string; icon: any; color: string; tone: "destructive" | "warning" | "success" | "muted" }> = {
  verified: { label: "Verifierat", icon: CheckCircle2, color: "text-emerald-500", tone: "success" },
  contradicted: { label: "Motbevisat", icon: XCircle, color: "text-destructive", tone: "destructive" },
  partially_true: { label: "Delvis sant", icon: AlertTriangle, color: "text-amber-500", tone: "warning" },
  unverifiable: { label: "Ovisst", icon: HelpCircle, color: "text-muted-foreground", tone: "muted" },
};

const VERDICT_ORDER: Verdict[] = ["contradicted", "partially_true", "unverifiable", "verified"];

export function FactCheckCard({ factCheck, onRerun, rerunning }: Props) {
  if (!factCheck || !factCheck.claims?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium text-sm">Faktakoll inte körd ännu</div>
              <div className="text-xs text-muted-foreground">
                Verifierar klientens påståenden mot Google, Maps och konkurrentsidor.
              </div>
            </div>
          </div>
          {onRerun && (
            <Button variant="outline" size="sm" onClick={() => onRerun()} disabled={rerunning}>
              {rerunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Kör faktakoll
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const sorted = [...factCheck.claims].sort(
    (a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict)
  );
  const counts = factCheck.claims.reduce<Record<Verdict, number>>((acc, c) => {
    acc[c.verdict] = (acc[c.verdict] || 0) + 1;
    return acc;
  }, { verified: 0, contradicted: 0, partially_true: 0, unverifiable: 0 });

  const hasIssues = counts.contradicted > 0 || counts.partially_true > 0;

  return (
    <Card className={hasIssues ? "border-destructive/40" : "border-emerald-500/30"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-serif flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Faktakoll
            </CardTitle>
            <CardDescription className="mt-1">
              {factCheck.overall_summary || "Verifiering av klientens påståenden mot källor."}
            </CardDescription>
          </div>
          {onRerun && (
            <Button variant="ghost" size="sm" onClick={() => onRerun()} disabled={rerunning}>
              {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {VERDICT_ORDER.map(v => counts[v] > 0 && (
            <Badge key={v} variant={VERDICT_META[v].tone === "destructive" ? "destructive" : "secondary"} className="gap-1">
              {VERDICT_META[v].label}: {counts[v]}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((c, i) => <ClaimRow key={i} claim={c} />)}
      </CardContent>
    </Card>
  );
}

function ClaimRow({ claim }: { claim: FactCheckClaim }) {
  const [open, setOpen] = useState(claim.verdict === "contradicted");
  const meta = VERDICT_META[claim.verdict];
  const Icon = meta.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`border rounded-md ${claim.verdict === "contradicted" ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors rounded-md">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">"{claim.claim}"</div>
              <div className="flex items-center gap-2 mt-1 text-xs">
                <span className={meta.color}>{meta.label}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{claim.confidence} konfidens</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{claim.sources.length} källor</span>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Bevis</div>
              <p className="text-sm">{claim.evidence}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Rekommendation</div>
              <p className="text-sm text-foreground/90">{claim.recommendation}</p>
            </div>
            {claim.sources.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Källor</div>
                <div className="space-y-1.5">
                  {claim.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs p-2 rounded border border-border/50 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 text-foreground/90 font-medium">
                        <Badge variant="outline" className="text-[9px] uppercase">{s.source_type}</Badge>
                        <span className="truncate">{s.title || s.url}</span>
                        <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
                      </div>
                      {s.snippet && <p className="text-muted-foreground mt-1 line-clamp-2">{s.snippet}</p>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
