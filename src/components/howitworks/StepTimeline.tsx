// Vertikal numrerad timeline med 5 steg och "Gör nu"-länkar.

import { Link } from "react-router-dom";
import { ArrowRight, Target, Plug, Sparkles, BarChart3, ListChecks } from "lucide-react";

interface Props { workspaceId: string }

const stepIcons = [Target, Plug, Sparkles, BarChart3, ListChecks];

export function StepTimeline({ workspaceId }: Props) {
  const base = `/clients/${workspaceId}`;
  const steps = [
    {
      title: "Skapa projekt & sätt mål",
      body: "Bransch, brand-termer, konkurrenter och affärsmål. Detta är grunden — utan mål kan vi inte räkna estimerat värde i SEK.",
      cta: "Öppna inställningar",
      to: `${base}/settings`,
      time: "5 min",
    },
    {
      title: "Koppla GA4, Search Console & Google Ads",
      body: "Råa siffror för trafik, konverteringar, sökpositioner och annonser. Auto-sync hämtar nytt vid sidöppning + schemalagt.",
      cta: "Till datakällor",
      to: `${base}/data-sources`,
      time: "10 min",
    },
    {
      title: "Generera sökordsuniversum",
      body: "Lite (~snabbt) eller Ultra (~10–20 min i bakgrunden). Ultra ger bredast täckning och SEMrush-berikning. Behövs en gång — kör om vid större marknadsförändring.",
      cta: "Öppna Sökord & innehåll",
      to: `${base}/keywords`,
      time: "10–20 min (bakgrund)",
    },
    {
      title: "Läs SEO-dashboard & Ads Audit",
      body: "Båda motorerna har nu allt de behöver: kluster, intent, GSC-positioner, GA4-värde, Ads-prestanda. Du får konkreta möjligheter sorterade efter värde.",
      cta: "Till översikt",
      to: base,
      time: "Genomgång 15 min",
    },
    {
      title: "Följ Veckobriefing → Action Tracker",
      body: "Briefingen plockar topp-åtgärder från båda motorerna. Markera klart och systemet mäter effekten före/efter.",
      cta: "Öppna åtgärder",
      to: `${base}/actions`,
      time: "Återkommande",
    },
  ];

  return (
    <ol className="relative space-y-6">
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {steps.map((s, i) => {
        const Icon = stepIcons[i];
        return (
          <li key={i} className="relative pl-14">
            <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-background">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                <span className="font-mono text-[11px] text-primary">STEG {i + 1}</span>
                <h3 className="font-serif text-lg leading-tight">{s.title}</h3>
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">{s.time}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.body}</p>
              <Link to={s.to} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                {s.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
