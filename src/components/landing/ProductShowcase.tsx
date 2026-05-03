import SitemapGraph from "./SitemapGraph";
import KeywordBubbles from "./KeywordBubbles";
import TrendMini from "./TrendMini";

const items = [
  {
    tag: "Pre-launch",
    title: "Sajtkartan innan första raden kod",
    desc: "AI bygger en komplett informations­arkitektur från en affärsidé. Sökord, sidor, intent-mappning.",
    visual: <SitemapGraph />,
  },
  {
    tag: "Sökordsuniversum",
    title: "Kluster med intent och volym",
    desc: "Tusentals sökord grupperade i tematiska kluster. Se exakt vilket innehåll som ska byggas först.",
    visual: <KeywordBubbles />,
  },
  {
    tag: "Performance",
    title: "Live tracking från GSC, GA4 och Ads",
    desc: "En vy. Alla källor. Trendgrafer som visar exakt vilka åtgärder som flyttar nålen vecka för vecka.",
    visual: <TrendMini />,
  },
];

export default function ProductShowcase() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((it) => (
        <div
          key={it.tag}
          className="group relative rounded-2xl border border-border bg-card/60 backdrop-blur p-5 hover:border-primary/40 transition-colors overflow-hidden"
        >
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{it.tag}</span>
          <h3 className="mt-2 text-lg font-semibold leading-snug">{it.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{it.desc}</p>
          <div className="mt-4 h-44 rounded-lg border border-border/60 bg-background/40 p-2">
            {it.visual}
          </div>
        </div>
      ))}
    </div>
  );
}
