import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, MousePointerClick, DollarSign } from "lucide-react";
import CountUp from "./CountUp";

const data = Array.from({ length: 28 }, (_, i) => {
  const base = 1200 + i * 95;
  const noise = Math.sin(i / 2) * 180 + Math.cos(i / 1.3) * 80;
  return { d: i, sessions: Math.round(base + noise), conv: Math.round((base + noise) * 0.034) };
});

export default function HeroMockup() {
  return (
    <div className="relative">
      {/* glow */}
      <div className="absolute -inset-6 rounded-3xl bg-primary/10 blur-3xl" />
      <div className="relative rounded-2xl border border-border bg-card/80 backdrop-blur-xl p-5 shadow-elevated animate-float-y">
        {/* window chrome */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
            slay-station / executive
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { icon: MousePointerClick, label: "Sessions", value: 48230, suffix: "", color: "text-primary" },
            { icon: TrendingUp, label: "CR", value: 3.42, suffix: "%", decimals: 2, color: "text-accent" },
            { icon: DollarSign, label: "ROI", value: 412, suffix: "%", color: "text-primary-glow" },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</span>
                  <Icon className={`h-3.5 w-3.5 ${k.color}`} />
                </div>
                <div className="text-lg font-semibold">
                  <CountUp end={k.value} suffix={k.suffix} decimals={k.decimals ?? 0} />
                </div>
              </div>
            );
          })}
        </div>

        {/* chart */}
        <div className="h-48 rounded-lg border border-border/60 bg-background/40 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="heroFill2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="d" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              />
              <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#heroFill)" />
              <Area type="monotone" dataKey="conv" stroke="hsl(var(--accent))" strokeWidth={1.5} fill="url(#heroFill2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* footer chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {["GSC", "GA4", "Google Ads", "AI insights"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-border/60 bg-background/40 px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
