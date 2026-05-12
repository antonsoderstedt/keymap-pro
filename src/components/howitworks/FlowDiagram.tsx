// Inline SVG-flowchart som visar hela datakedjan i Slay Station.
// Hover på en nod ger en kort förklaring. Inga externa bibliotek.

import { useState } from "react";

type Node = {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  tone?: "input" | "process" | "output" | "loop";
  tip: string;
};

const NODES: Node[] = [
  { id: "project", x: 40, y: 30, label: "1. Projekt & mål", sub: "bransch · brand · mål", tone: "input", tip: "Allt börjar här. Mål och brand-termer styr hur diagnoser tolkar siffror senare." },
  { id: "data", x: 40, y: 150, label: "2. Datakällor", sub: "GA4 · GSC · Google Ads", tone: "input", tip: "Ger råa siffror: trafik, konverteringar, sökpositioner och annonsmetrik." },
  { id: "universe", x: 40, y: 270, label: "3. Sökordsuniversum", sub: "Lite · Max · Ultra", tone: "input", tip: "Marknadens karta. AI + DataForSEO + SEMrush ger volym, intent, kluster och SERP-features." },

  { id: "lake", x: 360, y: 150, w: 200, h: 90, label: "Datalager", sub: "snapshots · cache · realtime", tone: "process", tip: "Allt landar här. Auto-sync hämtar nytt vid sidöppning + intervall. Snapshots cachas för snabb diagnos." },

  { id: "seo", x: 660, y: 30, label: "SEO-motor", sub: "diagnostik · tech · kluster", tone: "process", tip: "Läser universum + GSC + audit + backlinks. Producerar SEO-dashboard, tech-issues, kluster-åtgärder." },
  { id: "ads", x: 660, y: 150, label: "Ads-motor", sub: "audit · auction · chat", tone: "process", tip: "Läser Google Ads + GA4 + brand-termer. Producerar Ads Audit, Auction Insights, Ads Chat." },
  { id: "pre", x: 660, y: 270, label: "Pre-launch & rapporter", sub: "strategi · sajtkarta · prognos", tone: "process", tip: "Använder universum + Firecrawl + AI för fulla strategi-rapporter." },

  { id: "brief", x: 960, y: 90, label: "Veckobriefing", sub: "topp-åtgärder · värde i SEK", tone: "output", tip: "Samlar diagnoser från båda motorerna och prioriterar efter estimerat värde." },
  { id: "actions", x: 960, y: 210, label: "Action Tracker", sub: "att göra → klart", tone: "output", tip: "Här lever de faktiska åtgärderna. measure-action-impact mäter före/efter." },
];

const EDGES: Array<[string, string]> = [
  ["project", "lake"],
  ["data", "lake"],
  ["universe", "lake"],
  ["lake", "seo"],
  ["lake", "ads"],
  ["lake", "pre"],
  ["seo", "brief"],
  ["ads", "brief"],
  ["seo", "actions"],
  ["ads", "actions"],
  ["pre", "actions"],
];

const TONE_CLASS: Record<string, string> = {
  input: "fill-card stroke-primary/60",
  process: "fill-card stroke-primary",
  output: "fill-primary/10 stroke-primary",
  loop: "fill-card stroke-muted-foreground",
};

export function FlowDiagram() {
  const [hover, setHover] = useState<string | null>(null);
  const W = 280, H = 84;

  const findNode = (id: string) => NODES.find(n => n.id === id)!;

  return (
    <div className="rounded-xl border border-border bg-card/30 p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Hela flödet</div>
          <div className="font-serif text-xl">Från råa data till åtgärd</div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary/60 ring-1 ring-primary/40" /> Indata</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Bearbetning</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/30" /> Resultat</span>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg viewBox="0 0 1280 380" className="w-full min-w-[860px] h-auto">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
            </marker>
            <linearGradient id="edge" x1="0" x2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* edges */}
          {EDGES.map(([a, b], i) => {
            const A = findNode(a);
            const B = findNode(b);
            const aw = A.w ?? W, ah = A.h ?? H;
            const bw = B.w ?? W;
            const x1 = A.x + aw;
            const y1 = A.y + ah / 2;
            const x2 = B.x;
            const y2 = B.y + (B.h ?? H) / 2;
            const mx = (x1 + x2) / 2;
            const active = hover === a || hover === b;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="url(#edge)"
                strokeWidth={active ? 2.5 : 1.5}
                opacity={hover && !active ? 0.25 : 0.9}
                markerEnd="url(#arrow)"
                className="transition-all"
              />
            );
          })}

          {/* nodes */}
          {NODES.map((n) => {
            const w = n.w ?? W, h = n.h ?? H;
            const active = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <rect
                  width={w} height={h} rx={12}
                  className={`${TONE_CLASS[n.tone || "process"]} transition-all`}
                  strokeWidth={active ? 2 : 1.2}
                  style={{ filter: active ? "drop-shadow(0 0 12px hsl(var(--primary) / 0.45))" : undefined }}
                />
                <text x={16} y={32} className="fill-foreground font-medium" style={{ fontSize: 16 }}>
                  {n.label}
                </text>
                {n.sub && (
                  <text x={16} y={56} className="fill-muted-foreground" style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 min-h-[44px] rounded-lg border border-border/70 bg-background/40 px-4 py-2.5 text-sm text-muted-foreground">
        {hover ? (
          <span><span className="text-foreground font-medium">{findNode(hover).label}: </span>{findNode(hover).tip}</span>
        ) : (
          <span className="text-muted-foreground/70">Hovra över en nod för att se vad den gör.</span>
        )}
      </div>
    </div>
  );
}
