// "Varför den här rekommendationen?" — pedagogisk panel som visar de exakta
// datapunkter, regler och beräkningar som ligger bakom en åtgärd/diagnos.
// Återanvänds av både SEO- och Ads-diagnoserna.

import { useState } from "react";
import {
  Database,
  Calculator,
  Gauge,
  ScrollText,
  ChevronDown,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface RationaleEvidence {
  source: string;            // t.ex. "GSC", "GA4", "Ads", "audit"
  metric: string;            // t.ex. "ctr", "avg_position"
  value: number | string;
  period?: string;           // t.ex. "30d"
}

export interface RationaleAction {
  label: string;
  detail?: string;
  steps?: string[];
  risk?: string;
  risk_reason?: string;
  effort?: string;
}

export interface RationaleProps {
  ruleId: string;
  category?: string;
  severity?: "info" | "warn" | "critical";
  confidence: number;                 // 0..1
  why?: string;                       // affärs-/människo-förklaring
  evidence: RationaleEvidence[];
  dataSources?: string[];             // t.ex. ["GSC","GA4"]
  expectedImpact?: {
    metric?: string;
    direction?: string;
    low?: number;
    mid: number;
    high?: number;
    horizon_days: number;
    reasoning?: string;
  };
  estimatedValueSek?: number;
  proposedAction?: RationaleAction;   // primär åtgärd
  defaultOpen?: boolean;
  className?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  gsc: "Search Console",
  GSC: "Search Console",
  ga4: "GA4",
  GA4: "GA4",
  ads: "Google Ads",
  Ads: "Google Ads",
  audit: "Tech-audit",
  universe: "Sökordsuniversum",
  semrush: "SEMrush",
  dataforseo: "DataForSEO",
};

function humanizeRule(id: string): string {
  return id
    .replace(/^seo[._]/i, "")
    .replace(/^ads[._]/i, "")
    .replace(/[_.\-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(v: number | string): string {
  if (typeof v === "number") {
    if (Math.abs(v) >= 1000) return v.toLocaleString("sv-SE");
    if (!Number.isInteger(v)) return v.toFixed(2);
  }
  return String(v);
}

const CONF_TONE = (c: number) =>
  c >= 0.8 ? "text-primary" : c >= 0.5 ? "text-yellow-500" : "text-muted-foreground";

export function RecommendationRationale(props: RationaleProps) {
  const {
    ruleId,
    category,
    severity,
    confidence,
    why,
    evidence,
    dataSources,
    expectedImpact,
    estimatedValueSek,
    proposedAction,
    defaultOpen = false,
    className,
  } = props;

  const [open, setOpen] = useState(defaultOpen);
  const confPct = Math.round(confidence * 100);

  // gruppera evidence per källa
  const grouped: Record<string, RationaleEvidence[]> = {};
  for (const e of evidence || []) {
    const key = e.source || "other";
    (grouped[key] = grouped[key] || []).push(e);
  }

  return (
    <div className={cn("rounded-lg border border-primary/30 bg-primary/[0.04]", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-primary/[0.06] transition-colors rounded-lg"
      >
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">Varför den här rekommendationen?</span>
        <span className={cn("text-[11px] font-mono", CONF_TONE(confidence))}>
          {confPct}% säkerhet
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 text-sm">
          {/* 1. REGEL */}
          <Section icon={ScrollText} title="Regeln som triggade">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">{ruleId}</Badge>
              {category && <Badge variant="secondary" className="text-[10px]">{category}</Badge>}
              {severity && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    severity === "critical" && "border-destructive/50 text-destructive",
                    severity === "warn" && "border-yellow-500/50 text-yellow-500",
                  )}
                >
                  {severity.toUpperCase()}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {humanizeRule(ruleId)}
              </span>
            </div>
            {why && <p className="text-muted-foreground mt-2 leading-relaxed">{why}</p>}
          </Section>

          {/* 2. DATAPUNKTER */}
          <Section
            icon={Database}
            title="Datapunkter som användes"
            hint={dataSources && dataSources.length > 0
              ? `Källor: ${dataSources.map((s) => SOURCE_LABEL[s] || s).join(", ")}`
              : undefined}
          >
            {evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga datapunkter sparade för denna regel.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(grouped).map(([src, list]) => (
                  <div key={src} className="rounded-md border border-border bg-background/40 p-2.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-1.5">
                      {SOURCE_LABEL[src] || src}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {list.map((e, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="text-muted-foreground truncate">
                            {e.metric}{e.period ? ` · ${e.period}` : ""}
                          </span>
                          <span className="font-mono font-medium tabular-nums">{fmt(e.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 3. VÄRDEBERÄKNING */}
          {(expectedImpact || estimatedValueSek != null) && (
            <Section icon={Calculator} title="Så räknades värdet">
              {expectedImpact && (
                <div className="rounded-md border border-border bg-background/40 p-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    {expectedImpact.metric && (
                      <span className="text-muted-foreground">
                        Påverkar <span className="text-foreground font-medium">{expectedImpact.metric}</span>
                      </span>
                    )}
                    {expectedImpact.direction && (
                      <span className="text-muted-foreground">
                        riktning <span className="font-mono text-foreground">{expectedImpact.direction}</span>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      horisont <span className="font-mono text-foreground">{expectedImpact.horizon_days}d</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Förväntat utfall:</span>
                    <span className="font-mono">
                      {expectedImpact.low != null && <>{fmt(expectedImpact.low)} · </>}
                      <span className="text-primary font-medium">{fmt(expectedImpact.mid)}</span>
                      {expectedImpact.high != null && <> · {fmt(expectedImpact.high)}</>}
                    </span>
                    {(expectedImpact.low != null || expectedImpact.high != null) && (
                      <span className="text-[10px] text-muted-foreground">(låg · mid · hög)</span>
                    )}
                  </div>
                  {expectedImpact.reasoning && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                      {expectedImpact.reasoning}
                    </p>
                  )}
                </div>
              )}
              {estimatedValueSek != null && estimatedValueSek > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Estimerat värde</span>
                  <span className="font-mono font-semibold text-primary">
                    {estimatedValueSek.toLocaleString("sv-SE")} kr
                  </span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/80 mt-2 leading-relaxed">
                Värdet beräknas som potentiell trafik × konverteringsgrad × värde per konvertering, justerat för {confPct}% säkerhet och kostnad där det är relevant.
              </p>
            </Section>
          )}

          {/* 4. ÅTGÄRD + RISK */}
          {proposedAction && (
            <Section icon={Gauge} title="Vad vi föreslår och varför det är säkert">
              <div className="rounded-md border border-border bg-background/40 p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-sm">{proposedAction.label}</span>
                  {proposedAction.effort && (
                    <Badge variant="outline" className="text-[10px]">
                      Insats: {proposedAction.effort}
                    </Badge>
                  )}
                  {proposedAction.risk && (
                    <Badge variant="outline" className="text-[10px]">
                      Risk: {proposedAction.risk}
                    </Badge>
                  )}
                </div>
                {proposedAction.detail && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{proposedAction.detail}</p>
                )}
                {proposedAction.steps && proposedAction.steps.length > 0 && (
                  <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-0.5 pt-1">
                    {proposedAction.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
                {proposedAction.risk_reason && (
                  <p className="text-[11px] text-muted-foreground/80 pt-1 border-t border-border mt-2">
                    <span className="font-medium text-foreground">Varför säker: </span>
                    {proposedAction.risk_reason}
                  </p>
                )}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: any;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-foreground">{title}</span>
        </div>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
