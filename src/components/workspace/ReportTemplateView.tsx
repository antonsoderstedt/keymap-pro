import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

type Kpi = { label: string; value: string; sub?: string; trend?: string };
type Column = { key: string; label: string; format?: string };
type Table = { id: string; title: string; columns: Column[]; rows: any[] };
type Chart = { id: string; type: "bar" | "line" | "area" | "pie"; title: string; xKey: string; series: { key: string; label: string; color?: string }[]; data: any[] };

export interface ReportTemplate {
  summary: { headline: string; period?: { start?: string; end?: string }; kpis: Kpi[]; bullets: string[] };
  charts: Chart[];
  tables: Table[];
}

const PALETTE = ["hsl(var(--primary))", "#5ab0ff", "#ff7a59", "#c084fc", "#facc15", "#34d399", "#f472b6"];

function fmt(v: any, f?: string): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  switch (f) {
    case "sek": return Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k kr` : `${Math.round(n)} kr`;
    case "num": return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
    case "pct1": return `${n.toFixed(1)}%`;
    case "pct100": return `${Math.round(n * 100)}%`;
    case "decimal1": return n.toFixed(1);
    case "decimal2": return n.toFixed(2);
    default: return typeof v === "number" ? n.toLocaleString("sv-SE") : String(v);
  }
}

function ChartBlock({ chart }: { chart: Chart }) {
  const common = { data: chart.data, margin: { top: 8, right: 16, left: 0, bottom: 8 } };
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{chart.title}</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart>
              <Pie data={chart.data} dataKey={chart.series[0].key} nameKey={chart.xKey} outerRadius={90} label>
                {chart.data.map((d, i) => <Cell key={i} fill={d.color || PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart {...common}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series.map((s, i) => (
                <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : chart.type === "area" ? (
            <AreaChart {...common}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series.map((s, i) => (
                <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} fill={s.color || PALETTE[i % PALETTE.length]} fillOpacity={0.25} />
              ))}
            </AreaChart>
          ) : (
            <BarChart {...common}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableBlock({ table }: { table: Table }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {table.title}
      </div>
      <div className="overflow-x-auto max-h-[360px]">
        <table className="w-full text-xs">
          <thead className="bg-muted/20 sticky top-0">
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} className="text-left px-3 py-2 font-medium text-muted-foreground">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr><td colSpan={table.columns.length} className="px-3 py-4 text-center text-muted-foreground">Inga rader</td></tr>
            ) : table.rows.slice(0, 50).map((row, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/10">
                {table.columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 font-mono">{fmt(row[c.key], c.format)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportTemplateView({ template }: { template: ReportTemplate }) {
  const { summary, charts, tables } = template;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
        <div className="font-serif text-xl mb-1">{summary.headline}</div>
        {summary.period?.start && (
          <div className="text-xs text-muted-foreground mb-3">
            Period: {summary.period.start} → {summary.period.end}
          </div>
        )}
        {summary.kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {summary.kpis.map((k, i) => (
              <div key={i} className="rounded-md border border-border bg-background p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                <div className="font-mono text-lg">{k.value}</div>
                {k.sub && <div className="text-[10px] text-muted-foreground truncate">{k.sub}</div>}
              </div>
            ))}
          </div>
        )}
        {summary.bullets.length > 0 && (
          <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
            {summary.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
      {charts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {charts.map((c) => <ChartBlock key={c.id} chart={c} />)}
        </div>
      )}
      {tables.map((t) => <TableBlock key={t.id} table={t} />)}
    </div>
  );
}
