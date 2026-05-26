// SEO-möjligheter i 2x2-grid: Top sökord, Nära topp 10, Hög imp/låg CTR, Tappar.
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Target, TrendingDown, MousePointerClick } from "lucide-react";
import type { RankingRow } from "@/lib/performance";
import { Link } from "react-router-dom";

interface Props {
  projectId: string;
  rankings: RankingRow[];
}

function CompactRow({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-foreground truncate flex-1 min-w-0">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
        {primary}
        {secondary && <span className="ml-1.5 text-[10px]">{secondary}</span>}
      </span>
    </li>
  );
}

function Block({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
        <ul>{children}</ul>
      </CardContent>
    </Card>
  );
}

export function SeoOpportunities({ projectId, rankings }: Props) {
  if (rankings.length === 0) return null;

  const topQueries = [...rankings].sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const nearTopTen = rankings
    .filter((r) => r.position > 10 && r.position <= 20 && r.impressions > 30)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  const lowCtr = rankings
    .filter((r) => r.impressions > 100 && r.position > 0 && r.position <= 10 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  const droppers = rankings
    .filter((r) => r.delta != null && r.delta < -2 && r.impressions > 30)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-medium tracking-tight">SEO-möjligheter</h2>
        <Link
          to={`/clients/${projectId}/keywords`}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Öppna sökord →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Block
          title="Topp sökord"
          icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
          hint="Sökord som driver mest klick just nu."
        >
          {topQueries.length === 0 ? (
            <li className="text-xs text-muted-foreground py-2">Inga sökord ännu.</li>
          ) : (
            topQueries.map((r) => (
              <CompactRow
                key={r.query}
                label={r.query}
                primary={`${r.clicks} klick`}
                secondary={`pos ${r.position.toFixed(1)}`}
              />
            ))
          )}
        </Block>

        <Block
          title="Nära topp 10 (position 11–20)"
          icon={<Target className="h-3.5 w-3.5 text-primary" />}
          hint="Optimera title, H1 och internlänkar för att flytta upp till sida 1."
        >
          {nearTopTen.length === 0 ? (
            <li className="text-xs text-muted-foreground py-2">Inga sökord i intervallet.</li>
          ) : (
            nearTopTen.map((r) => (
              <CompactRow
                key={r.query}
                label={r.query}
                primary={`pos ${r.position.toFixed(1)}`}
                secondary={`${r.impressions} imp`}
              />
            ))
          )}
        </Block>

        <Block
          title="Hög synlighet, låg CTR"
          icon={<MousePointerClick className="h-3.5 w-3.5 text-yellow-500" />}
          hint="Syns men får få klick — skriv om meta title och description."
        >
          {lowCtr.length === 0 ? (
            <li className="text-xs text-muted-foreground py-2">Inga problem hittade.</li>
          ) : (
            lowCtr.map((r) => (
              <CompactRow
                key={r.query}
                label={r.query}
                primary={`${(r.ctr * 100).toFixed(2)} %`}
                secondary={`${r.impressions} imp`}
              />
            ))
          )}
        </Block>

        <Block
          title="Största tapp"
          icon={<TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          hint="Sökord som tappat mest positioner — analysera konkurrenter."
        >
          {droppers.length === 0 ? (
            <li className="text-xs text-muted-foreground py-2">Inga större tapp.</li>
          ) : (
            droppers.map((r) => (
              <CompactRow
                key={r.query}
                label={r.query}
                primary={`${r.delta?.toFixed(1)} pos`}
                secondary={`pos ${r.position.toFixed(1)}`}
              />
            ))
          )}
        </Block>
      </div>
    </section>
  );
}
