import { Area, AreaChart, ResponsiveContainer } from "recharts";

const data = Array.from({ length: 24 }, (_, i) => ({
  v: 30 + i * 2.5 + Math.sin(i / 1.5) * 8 + Math.cos(i / 0.9) * 4,
}));

export default function TrendMini() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mini" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#mini)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
