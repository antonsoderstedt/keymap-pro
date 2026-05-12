// Live checklist för det aktiva projektet — läser useProjectCapabilities.

import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";

interface Props { workspaceId: string }

export function ProjectStatusChecklist({ workspaceId }: Props) {
  const caps = useProjectCapabilities(workspaceId);
  const base = `/clients/${workspaceId}`;

  const items = [
    { ok: caps.hasGoals, label: "Projektmål satta", to: `${base}/settings`, fixCta: "Sätt mål" },
    { ok: caps.hasGA4, label: "GA4 kopplat", to: `${base}/data-sources`, fixCta: "Koppla GA4" },
    { ok: caps.hasGSC, label: "Search Console kopplat", to: `${base}/data-sources`, fixCta: "Koppla GSC" },
    { ok: caps.hasAds, label: "Google Ads kopplat", to: `${base}/data-sources`, fixCta: "Koppla Ads" },
    { ok: caps.hasKeywordUniverse, label: "Sökordsuniversum genererat", to: `${base}/keywords`, fixCta: "Generera nu" },
    { ok: caps.hasKpiTargets, label: "KPI-mål aktiva", to: `${base}/settings`, fixCta: "Lägg till KPI" },
  ];

  const done = items.filter(i => i.ok).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Status för detta projekt</div>
          <h3 className="font-serif text-xl">Hur långt har du kommit?</h3>
        </div>
        <div className="font-mono text-2xl text-primary">{pct}%</div>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mb-5">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {caps.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Läser projektets status…
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/30 px-3 py-2.5">
              {it.ok ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              )}
              <span className={`flex-1 text-sm ${it.ok ? "text-foreground" : "text-muted-foreground"}`}>{it.label}</span>
              {!it.ok && (
                <Link to={it.to} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {it.fixCta} <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
