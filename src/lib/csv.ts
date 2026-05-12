// CSV helpers — minimal, no deps. Sv-format vänligt.
export function toCsv(rows: Record<string, any>[], headers?: string[]): string {
  if (!rows.length) return "";
  const cols = headers ?? Array.from(rows.reduce<Set<string>>((s, r) => {
    Object.keys(r).forEach((k) => s.add(k));
    return s;
  }, new Set<string>()));
  const esc = (v: any) => {
    if (v == null) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  // BOM så Excel öppnar UTF-8 + å/ä/ö korrekt
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
