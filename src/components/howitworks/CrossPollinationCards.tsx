// Tre kort som visar hur data korsbefruktar mellan delar av systemet.

import { ArrowRight, Search, Megaphone, BarChart3 } from "lucide-react";

const CARDS = [
  {
    from: { label: "Sökordsuniversum", icon: Search },
    to: { label: "Google Ads", icon: Megaphone },
    title: "Universum → Ads",
    body: "Brand-termer och negativ-kandidater från klusteranalysen exporteras till Ads. Cluster-intent hjälper Ads förstå rätt steg i tratten.",
  },
  {
    from: { label: "Google Ads", icon: Megaphone },
    to: { label: "SEO", icon: Search },
    title: "Ads → SEO",
    body: "Hög CPC + låg organisk position = prioriterad SEO-möjlighet. Reglerna lyfter dessa automatiskt i opportunities-listan.",
  },
  {
    from: { label: "GA4", icon: BarChart3 },
    to: { label: "Båda motorerna", icon: ArrowRight },
    title: "GA4 → SEO + Ads",
    body: "Konverteringar ger estimated_value_sek på varje åtgärd. Utan GA4 är prioritering en gissning.",
  },
];

export function CrossPollinationCards() {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {CARDS.map((c) => {
        const FromI = c.from.icon;
        const ToI = c.to.icon;
        return (
          <div key={c.title} className="rounded-xl border border-border bg-card/40 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border text-xs">
                <FromI className="h-3.5 w-3.5 text-primary" /> {c.from.label}
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/40 text-xs">
                <ToI className="h-3.5 w-3.5 text-primary" /> {c.to.label}
              </div>
            </div>
            <h4 className="font-serif text-lg mb-1">{c.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
          </div>
        );
      })}
    </div>
  );
}
