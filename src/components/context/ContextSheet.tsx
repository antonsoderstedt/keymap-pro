// ContextSheet — canonical decision surface (Phase C, MVP).
//
// Renders a DecisionContext for a single action_item or ads_change_proposal.
// Deterministic section order. Empty sections hidden. Narrative secondary to
// evidence. No charts, no AI theatrics, no nested cards, no typing indicators.
// Max 3 footer actions.
//
// State machine: closed | loading | error | empty | ready | building.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, RotateCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDecisionContext } from "@/hooks/useDecisionContext";
import { cn } from "@/lib/utils";
import {
  confidenceTone,
  gateLabel,
  riskTone,
  scoreTone,
  sourceLabel,
} from "./contextBands";
import type {
  AnalogRef,
  CausalSignal,
  ChangeEvent,
  ComponentContribution,
  DecisionContext,
  EvidenceRef,
  MetricDelta,
  RelatedSignal,
  ScoreBand,
  ScoreComponentName,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ContextSheetAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  pending?: boolean;
};

export type ContextSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  // exactly one of:
  actionItemId?: string;
  adsProposalId?: string;
  title: string;
  subtitle?: string;
  actions?: ContextSheetAction[];
  // optional: when caller has the matching OpportunityScore, score breakdown
  // section is rendered (collapsed); otherwise hidden entirely.
  score?: {
    value: number;
    band: ScoreBand;
    contribution_trace?: ComponentContribution[];
  };
};

// ---------------------------------------------------------------------------
// Constants — UI-only Swedish labels
// ---------------------------------------------------------------------------

const COMPONENT_LABEL: Record<ScoreComponentName, string> = {
  buyer_intent: "Köpintention",
  business_fit: "Affärsmatchning",
  conversion_likelihood: "Konverteringssannolikhet",
  serp_weakness: "SERP-svaghet",
  commercial_value: "Kommersiellt värde",
  historical_performance: "Historisk prestanda",
  strategic_value: "Strategiskt värde",
  operational_feasibility: "Genomförbarhet",
  competition_quality: "Konkurrens",
  landing_page_fit: "Landningssida",
};

// ---------------------------------------------------------------------------
// ContextSheet
// ---------------------------------------------------------------------------

export function ContextSheet(props: ContextSheetProps) {
  const {
    open,
    onOpenChange,
    projectId,
    actionItemId,
    adsProposalId,
    title,
    subtitle,
    actions,
    score,
  } = props;

  const ref = useMemo(() => {
    if (actionItemId) return { kind: "action_item" as const, id: actionItemId };
    if (adsProposalId) return { kind: "ads_change_proposal" as const, id: adsProposalId };
    return null;
  }, [actionItemId, adsProposalId]);

  // Only fetch when the sheet is open (saves a request per row hover).
  const { data, loading, error, building, build, refresh } = useDecisionContext(
    open ? projectId : undefined,
    open ? ref : null,
  );

  // Enforce "max 3 actions" defensively at the surface.
  const safeActions = (actions ?? []).slice(0, 3);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col gap-0 p-0"
        data-testid="context-sheet"
      >
        <SheetHeader className="border-b border-border/40 px-5 pt-5 pb-4 text-left">
          <SheetTitle className="text-base font-medium leading-snug">
            {title}
          </SheetTitle>
          {subtitle && (
            <SheetDescription className="text-xs text-muted-foreground">
              {subtitle}
            </SheetDescription>
          )}
          <HeaderBands data={data} score={score} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!ref && <InvariantError />}
          {ref && loading && <LoadingState />}
          {ref && !loading && error && error.kind === "schema_missing" && (
            <SchemaMissingState />
          )}
          {ref && !loading && error && error.kind !== "schema_missing" && (
            <ErrorState error={error.message} code={error.code} onRetry={refresh} />
          )}
          {ref && !loading && !error && !data && (
            <EmptyState
              building={building}
              onBuild={() => build()}
            />
          )}

          {ref && !loading && !error && data && (
            <Body data={data} score={score} onRebuild={() => build({ force: true })} building={building} />
          )}
        </div>

        {safeActions.length > 0 && (
          <FooterBar actions={safeActions} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Header bands
// ---------------------------------------------------------------------------

function HeaderBands({
  data,
  score,
}: {
  data: DecisionContext | null;
  score?: ContextSheetProps["score"];
}) {
  if (!data && !score) return null;
  const confTone = data ? confidenceTone(data.confidence.band) : null;
  const rTone = riskTone(data?.risk?.band);
  const sTone = score ? scoreTone(score.band) : null;

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]"
      data-testid="context-bands"
    >
      {sTone && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", sTone.dot)} aria-hidden />
          <span className="tabular-nums">{Math.round((score?.value ?? 0))}</span>
          <span className="sr-only">Score-band: {sTone.label}</span>
        </span>
      )}
      {confTone && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", confTone.dot)} aria-hidden />
          {confTone.label}
          <span className="sr-only">{confTone.sr}</span>
        </span>
      )}
      {rTone && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", rTone.dot)} aria-hidden />
          {rTone.label}
          <span className="sr-only">{rTone.sr}</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="space-y-3" data-testid="context-loading">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
      <div className="pt-3">
        <Skeleton className="h-4 w-1/4" />
        <div className="mt-2 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error, code, onRetry }: { error: string; code: string | null; onRetry: () => void }) {
  return (
    <div className="space-y-3" data-testid="context-error">
      <p className="text-sm text-destructive">Kontexten kunde inte laddas.</p>
      <p className="text-xs text-muted-foreground">
        {code ? <span className="font-mono mr-1">[{code}]</span> : null}
        {error}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Försök igen
      </Button>
    </div>
  );
}

function SchemaMissingState() {
  return (
    <div className="space-y-3" data-testid="context-schema-missing">
      <p className="text-sm text-foreground">Decision-kontext är inte deployad i denna miljö ännu.</p>
      <p className="text-xs text-muted-foreground">
        Tabellen <span className="font-mono">decision_context</span> saknas i schemat.
        Kontakta admin för att deploya migrationen — att bygga kontext fungerar inte förrän tabellen finns.
      </p>
    </div>
  );
}


function EmptyState({
  building,
  onBuild,
}: {
  building: boolean;
  onBuild: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="context-empty">
      <p className="text-sm text-foreground">Ingen kontext byggd ännu.</p>
      <p className="text-xs text-muted-foreground">
        Bygg en evidensbaserad sammanställning för den här åtgärden.
      </p>
      <Button size="sm" onClick={onBuild} disabled={building}>
        {building ? "Bygger…" : "Bygg kontext"}
      </Button>
    </div>
  );
}

function InvariantError() {
  return (
    <p className="text-xs text-destructive" data-testid="context-invariant">
      ContextSheet öppnades utan action_item_id eller ads_change_proposal_id.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Body — deterministic section order
// ---------------------------------------------------------------------------

function Body({
  data,
  score,
  onRebuild,
  building,
}: {
  data: DecisionContext;
  score?: ContextSheetProps["score"];
  onRebuild: () => void;
  building: boolean;
}) {
  return (
    <div className="space-y-6 text-sm" data-testid="context-body">
      <NextStepSection text={data.recommended_next_step} />
      <ExpectedImpactSection impact={data.expected_impact} />
      <WhatChangedSection items={data.what_changed} />
      <CausalSection items={data.causal_signals} />
      <RelatedSection items={data.related_signals} />
      <RecentChangesSection items={data.recent_changes} />
      <RiskDriversSection drivers={data.risk?.drivers} />
      <EvidenceSection items={data.evidence} />
      <NarrativeSection
        text={data.why_this_matters}
        status={data.narrative_status}
      />
      <AnalogsCollapse items={data.historical_analogs} />
      {score && score.contribution_trace && score.contribution_trace.length > 0 && (
        <ScoreBreakdownCollapse trace={score.contribution_trace} />
      )}
      <ConfidenceFooterLine
        data={data}
        onRebuild={onRebuild}
        building={building}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section primitive
// ---------------------------------------------------------------------------

function Section({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function NextStepSection({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Section label="Föreslaget nästa steg" testId="section-next-step">
      <p className="text-foreground leading-relaxed">{text}</p>
    </Section>
  );
}

function ExpectedImpactSection({
  impact,
}: {
  impact: DecisionContext["expected_impact"];
}) {
  if (!impact) return null;
  const fmt = (n: number) => n.toLocaleString("sv-SE");
  return (
    <Section label="Förväntad effekt" testId="section-expected-impact">
      <p className="text-foreground tabular-nums">
        {fmt(impact.p50)} {impact.currency}
        <span className="ml-2 text-xs text-muted-foreground">
          (p10 {fmt(impact.p10)} – p90 {fmt(impact.p90)}, {impact.horizon_days}d)
        </span>
      </p>
    </Section>
  );
}

function WhatChangedSection({ items }: { items: MetricDelta[] }) {
  if (!items.length) return null;
  return (
    <Section label="Vad har förändrats" testId="section-what-changed">
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li key={`${d.source}|${d.metric}|${i}`} className="text-foreground/90">
            <MetricDeltaRow delta={d} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function MetricDeltaRow({ delta }: { delta: MetricDelta }) {
  const sign = (delta.delta_pct ?? 0) >= 0 ? "+" : "";
  const pct =
    delta.delta_pct != null
      ? `${sign}${(delta.delta_pct * 100).toFixed(1)}%`
      : null;
  const abs =
    delta.delta != null
      ? `${(delta.delta >= 0 ? "+" : "")}${delta.delta.toLocaleString("sv-SE")}${delta.unit ? ` ${delta.unit}` : ""}`
      : null;
  const window = delta.window_days ? `${delta.window_days}d` : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-medium">{delta.metric}</span>
      {pct && <span className="tabular-nums">{pct}</span>}
      {abs && <span className="text-xs text-muted-foreground tabular-nums">{abs}</span>}
      <span className="text-[11px] text-muted-foreground">
        {sourceLabel(delta.source)}
        {window ? ` · ${window}` : ""}
      </span>
    </span>
  );
}

function CausalSection({ items }: { items: CausalSignal[] }) {
  if (!items.length) return null;
  return (
    <Section label="Sannolika orsaker" testId="section-causal">
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className="space-y-0.5">
            <p className="text-foreground/90">{s.label}</p>
            {s.description && (
              <p className="text-xs text-muted-foreground">{s.description}</p>
            )}
            {s.metric_delta && (
              <p className="text-[11px] text-muted-foreground">
                <MetricDeltaRow delta={s.metric_delta} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RelatedSection({ items }: { items: RelatedSignal[] }) {
  if (!items.length) return null;
  return (
    <Section label="Relaterade signaler" testId="section-related">
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={s.id} className="space-y-0.5">
            {s.metric_delta ? (
              <MetricDeltaRow delta={s.metric_delta} />
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-foreground/90">{s.label}</span>
                <span className="text-[11px] text-muted-foreground">{sourceLabel(s.source)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RecentChangesSection({ items }: { items: ChangeEvent[] }) {
  if (!items.length) return null;
  return (
    <Section label="Senaste händelser" testId="section-recent-changes">
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-foreground/90">{c.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatShortDate(c.occurred_at)}
              {c.actor ? ` · ${c.actor}` : ""}
            </span>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RiskDriversSection({ drivers }: { drivers: string[] | undefined }) {
  if (!drivers || drivers.length === 0) return null;
  return (
    <Section label="Riskdrivare" testId="section-risk-drivers">
      <ul className="space-y-1">
        {drivers.map((d, i) => (
          <li key={`${d}|${i}`} className="text-foreground/90">
            {d}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EvidenceSection({ items }: { items: EvidenceRef[] }) {
  if (!items.length) return null;
  return (
    <Section label="Bevis" testId="section-evidence">
      <ul className="space-y-1.5">
        {items.map((e) => (
          <li key={e.id} className="space-y-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="text-foreground/90">{sourceLabel(e.source)}</span>
              {e.source_id && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {e.source_id}
                </span>
              )}
              {e.observed_at && (
                <span className="text-[11px] text-muted-foreground">
                  {formatShortDate(e.observed_at)}
                </span>
              )}
              {e.url && (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground"
                  aria-label="Öppna källa"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
            {e.excerpt && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {e.excerpt}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function NarrativeSection({
  text,
  status,
}: {
  text: string | null;
  status: DecisionContext["narrative_status"];
}) {
  if (!text || status !== "generated") return null;
  // Render with [[ev:<id>]] citations stripped from inline text but rendered as
  // small superscript markers — keeps narrative readable without breaking
  // evidence grounding.
  const segments = splitNarrativeCitations(text);
  return (
    <Section label="Varför detta spelar roll" testId="section-narrative">
      <p className="text-foreground/90 leading-relaxed">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <sup
              key={i}
              className="ml-0.5 font-mono text-[10px] text-muted-foreground"
              title={`Bevis: ${seg.value}`}
            >
              [{i}]
            </sup>
          ),
        )}
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Collapses
// ---------------------------------------------------------------------------

function AnalogsCollapse({ items }: { items: AnalogRef[] }) {
  if (!items.length) return null;
  return (
    <Collapse
      label="Liknande tidigare fall"
      count={items.length}
      testId="section-analogs"
    >
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="space-y-0.5">
            <p className="text-foreground/90">{a.label}</p>
            <p className="text-[11px] text-muted-foreground">
              n={a.n}
              {a.mean_uplift_pct != null
                ? ` · medel ${(a.mean_uplift_pct >= 0 ? "+" : "")}${(a.mean_uplift_pct * 100).toFixed(1)}%`
                : ""}
              {a.suggested_acquisition_approach
                ? ` · ${a.suggested_acquisition_approach}`
                : ""}
            </p>
          </li>
        ))}
      </ul>
    </Collapse>
  );
}

function ScoreBreakdownCollapse({ trace }: { trace: ComponentContribution[] }) {
  const sorted = [...trace].sort((a, b) => a.rank - b.rank);
  return (
    <Collapse
      label="Score-uppdelning"
      count={sorted.length}
      testId="section-score-breakdown"
    >
      <ul className="space-y-1.5">
        {sorted.map((c) => (
          <li
            key={c.component}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="text-foreground/90">{COMPONENT_LABEL[c.component] ?? c.component}</span>
            <span className="tabular-nums text-muted-foreground">
              {c.points_contributed.toFixed(1)} / {c.weight.toFixed(0)}
            </span>
          </li>
        ))}
      </ul>
    </Collapse>
  );
}

function Collapse({
  label,
  count,
  testId,
  children,
}: {
  label: string;
  count: number;
  testId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
        <span className="opacity-60">({count})</span>
      </button>
      {open && <div className="pt-1">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Confidence footer line + rebuild
// ---------------------------------------------------------------------------

function ConfidenceFooterLine({
  data,
  onRebuild,
  building,
}: {
  data: DecisionContext;
  onRebuild: () => void;
  building: boolean;
}) {
  const gates = data.confidence.gate_triggers ?? [];
  return (
    <section
      className="border-t border-border/40 pt-4 space-y-1.5"
      data-testid="section-confidence-footer"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
        <span>
          Tillförlitlighet {Math.round(data.confidence.value * 100)}%
        </span>
        {gates.length > 0 && (
          <span aria-label="Tröskeltriggers">
            ·{" "}
            {gates.slice(0, 3).map((g, i) => (
              <span key={g}>
                {i > 0 ? " · " : ""}
                {gateLabel(g)}
              </span>
            ))}
            {gates.length > 3 ? ` · +${gates.length - 3}` : ""}
          </span>
        )}
      </p>
      <div className="flex items-center gap-3">
        <p className="text-[11px] text-muted-foreground font-mono">
          {data.model_version} · {formatShortDate(data.generated_at)}
        </p>
        <button
          type="button"
          onClick={onRebuild}
          disabled={building}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Bygg om kontext"
        >
          <RotateCw className={cn("h-3 w-3", building && "animate-spin")} aria-hidden />
          {building ? "Bygger…" : "Bygg om"}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer bar
// ---------------------------------------------------------------------------

function FooterBar({ actions }: { actions: ContextSheetAction[] }) {
  // First action with variant "primary" (or first action if none marked) is the primary CTA.
  let primaryIndex = actions.findIndex((a) => a.variant === "primary");
  if (primaryIndex < 0) primaryIndex = 0;

  return (
    <div
      className="border-t border-border/40 bg-background px-5 py-3 flex flex-wrap items-center justify-end gap-2"
      data-testid="context-footer"
    >
      {actions.map((a, i) => {
        const isPrimary = i === primaryIndex;
        return (
          <Button
            key={a.id}
            size="sm"
            variant={
              isPrimary
                ? "default"
                : a.variant === "ghost"
                  ? "ghost"
                  : "outline"
            }
            onClick={a.onClick}
            disabled={a.disabled || a.pending}
          >
            {a.pending ? "…" : a.label}
          </Button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(iso: string): string {
  // Locale-stable short date used across the sheet. Falls back to raw string on
  // parse failure rather than throwing (resilience for malformed timestamps).
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

type Segment = { kind: "text" | "citation"; value: string };

// Splits a narrative text into text/citation segments. Citations are
// [[ev:<id>]] markers produced by the narrative generator. This is purely
// presentational — the validation gate in the worker already guarantees that
// only narratives whose claim ids exist in the evidence array are persisted.
export function splitNarrativeCitations(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /\[\[ev:([A-Za-z0-9_\-:.]+)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "citation", value: match[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

// Suppress unused-import warnings for SSR-safe React import (useEffect kept
// for future channel-subscription wiring without re-importing).
void useEffect;
