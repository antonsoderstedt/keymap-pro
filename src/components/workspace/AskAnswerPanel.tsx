import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AskEvidence = {
  claim: string;
  metric: string;
  value: string;
  period: string;
  delta?: string;
};

export type AskCitation = { label: string; route: string };

export type AskAnswer = {
  out_of_scope: boolean;
  need_clarification: string;
  answer: string;
  evidence: AskEvidence[];
  citations: AskCitation[];
  confidence: "low" | "medium" | "high";
  latency_ms?: number;
};

interface Props {
  loading: boolean;
  error: string | null;
  answer: AskAnswer | null;
  onCitation: (route: string, label: string) => void;
}

const CONF_LABEL: Record<AskAnswer["confidence"], string> = {
  low: "låg konfidens",
  medium: "medel konfidens",
  high: "hög konfidens",
};

export function AskAnswerPanel({ loading, error, answer, onCitation }: Props) {
  if (loading) {
    return (
      <div className="px-4 py-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Läser kundens data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!answer) return null;

  if (answer.out_of_scope) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        ASK svarar bara på operativa frågor om denna kund.
      </div>
    );
  }

  if (answer.need_clarification) {
    return (
      <div className="px-4 py-6 text-sm">
        <p className="text-foreground">{answer.need_clarification}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{answer.answer}</p>

      {answer.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {answer.evidence.map((e, i) => (
            <div
              key={i}
              className="inline-flex items-baseline gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11px] font-mono tabular-nums"
              title={e.claim}
            >
              <span className="text-muted-foreground">{e.metric}</span>
              <span className="text-foreground">{e.value}</span>
              {e.delta && (
                <span
                  className={cn(
                    "text-[10px]",
                    e.delta.trim().startsWith("-") ? "text-destructive" : "text-primary",
                  )}
                >
                  {e.delta}
                </span>
              )}
              <span className="text-muted-foreground/60">·{e.period}</span>
            </div>
          ))}
        </div>
      )}

      {answer.citations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {answer.citations.map((c, i) => (
            <button
              key={i}
              onClick={() => onCitation(c.route, c.label)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>{c.label}</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            answer.confidence === "high" && "bg-primary",
            answer.confidence === "medium" && "bg-muted-foreground/60",
            answer.confidence === "low" && "bg-destructive/70",
          )}
        />
        <span>{CONF_LABEL[answer.confidence]}</span>
        {typeof answer.latency_ms === "number" && (
          <span className="ml-auto font-mono">{(answer.latency_ms / 1000).toFixed(1)}s</span>
        )}
      </div>
    </div>
  );
}
