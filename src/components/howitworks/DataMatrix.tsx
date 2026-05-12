// Matris: vilken motor läser vilken datakälla.

import { Check, Minus } from "lucide-react";

const COLS = ["Projekt-mål", "GA4", "Search Console", "Google Ads", "Sökordsuniversum"];

const ROWS: Array<{ name: string; sub: string; values: (1 | 0 | 0.5)[] }> = [
  { name: "SEO-motor", sub: "dashboard · tech · kluster", values: [1, 1, 1, 0, 1] },
  { name: "Ads-motor", sub: "audit · auction · chat", values: [1, 1, 0.5, 1, 0.5] },
  { name: "Veckobriefing", sub: "topp-åtgärder", values: [1, 1, 1, 1, 0.5] },
  { name: "Pre-launch", sub: "strategi · prognos", values: [1, 0, 0, 0, 1] },
];

function Cell({ v }: { v: 1 | 0 | 0.5 }) {
  if (v === 1) return (
    <div className="mx-auto h-7 w-7 rounded-full bg-primary/15 ring-1 ring-primary flex items-center justify-center">
      <Check className="h-3.5 w-3.5 text-primary" />
    </div>
  );
  if (v === 0.5) return (
    <div className="mx-auto h-7 w-7 rounded-full border border-primary/40 flex items-center justify-center">
      <span className="text-[10px] font-mono text-primary/80">opt</span>
    </div>
  );
  return (
    <div className="mx-auto h-7 w-7 rounded-full border border-border flex items-center justify-center">
      <Minus className="h-3 w-3 text-muted-foreground/50" />
    </div>
  );
}

export function DataMatrix() {
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Datamatris</div>
        <h3 className="font-serif text-xl">Vilken motor använder vilken data?</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/30">
              <th className="text-left p-3 font-medium text-muted-foreground w-[28%]">Motor</th>
              {COLS.map((c) => (
                <th key={c} className="p-3 text-center text-[11px] font-mono uppercase text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                <td className="p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{r.sub}</div>
                </td>
                {r.values.map((v, i) => (
                  <td key={i} className="p-3 text-center"><Cell v={v} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-background/20 border-t border-border flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Krävs</span>
        <span className="flex items-center gap-1.5"><span className="font-mono text-primary/80">opt</span> Förbättrar resultatet</span>
        <span className="flex items-center gap-1.5"><Minus className="h-3 w-3" /> Används ej</span>
      </div>
    </div>
  );
}
