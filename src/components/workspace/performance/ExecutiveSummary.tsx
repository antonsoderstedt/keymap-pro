// Deterministisk sammanfattning av nuläget. Ingen LLM — bara
// tröskelbaserad regelmotor på KPI-deltas.
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { PeriodKpis } from "@/lib/performance";
import { deltaPct } from "@/lib/performance";

interface Props {
  current: PeriodKpis;
  previous: PeriodKpis;
  adsHealth: number | null;
  ga4HasData: boolean;
  rangeDays: number;
}

function describe(delta: number | null, label: string, betterUp = true): string | null {
  if (delta == null || Math.abs(delta) < 5) return null;
  const dir = delta > 0 ? "ökat" : "minskat";
  const isGood = betterUp ? delta > 0 : delta < 0;
  const tone = isGood ? "" : " (negativ trend)";
  return `${label} har ${dir} ${Math.abs(delta).toFixed(0)} %${tone}`;
}

export function ExecutiveSummary({ current, previous, adsHealth, ga4HasData, rangeDays }: Props) {
  const clicksDelta = deltaPct(current.clicks, previous.clicks);
  const impDelta = deltaPct(current.impressions, previous.impressions);
  const posDelta = deltaPct(current.position, previous.position);
  const ctrDelta = deltaPct(current.ctr, previous.ctr);

  const parts: string[] = [];

  // SEO-mening
  const clicksDesc = describe(clicksDelta, "Organiska klick", true);
  const posDesc = describe(posDelta, "Genomsnittlig position", false);
  if (clicksDesc) parts.push(clicksDesc);
  else if (Math.abs(clicksDelta ?? 0) < 5 && current.clicks > 0)
    parts.push("Organisk trafik är stabil");
  if (posDesc) parts.push(posDesc.toLowerCase());

  // CTR-mening
  if (current.impressions > 100 && current.ctr < 0.01) {
    parts.push("CTR är låg — meta titles och descriptions kan behöva ses över");
  } else {
    const ctrDesc = describe(ctrDelta, "CTR", true);
    if (ctrDesc) parts.push(ctrDesc.toLowerCase());
  }

  // Ads-mening
  if (adsHealth != null) {
    if (adsHealth >= 80) parts.push(`Google Ads-kontot ser stabilt ut (hälsa ${adsHealth} %)`);
    else if (adsHealth >= 60)
      parts.push(`Google Ads har optimeringsmöjligheter (hälsa ${adsHealth} %)`);
    else parts.push(`Google Ads-kontot behöver uppmärksamhet (hälsa ${adsHealth} %)`);
  }

  // GA4-mening
  if (!ga4HasData) parts.push("GA4-data saknas för perioden");

  const summary =
    parts.length > 0
      ? parts.join(". ") + "."
      : `Inga signifikanta förändringar senaste ${rangeDays} dagar.`;

  // Bygg samma top-line med en KPI-rad
  return (
    <Card className="border-border/60 bg-gradient-to-br from-muted/30 to-transparent">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Sammanfattning
            </div>
            <p className="text-sm leading-relaxed text-foreground">{summary}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
