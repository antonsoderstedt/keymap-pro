import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Filter } from "lucide-react";

type Source = "ads" | "ga4" | "gsc" | "dataforseo" | "semrush";

type Row = {
  id: string;
  source: Source;
  entity: string;
  metric: string;
  value: string;
  observedAt: string;
};

const SAMPLE_ROWS: Row[] = [
  { id: "1", source: "ads", entity: "Campaign: Brand SE", metric: "Cost", value: "12 430", observedAt: "2026-05-27" },
  { id: "2", source: "ga4", entity: "Landing: /pris", metric: "Sessions", value: "2 146", observedAt: "2026-05-27" },
  { id: "3", source: "gsc", entity: "Query: rormokare stockholm", metric: "Clicks", value: "328", observedAt: "2026-05-27" },
  { id: "4", source: "dataforseo", entity: "Keyword: stambyte pris", metric: "Volume", value: "1 900", observedAt: "2026-05-27" },
  { id: "5", source: "semrush", entity: "Competitor: konkurrent.se", metric: "Visibility", value: "48.2", observedAt: "2026-05-27" },
];

export default function RawDataExplorer() {
  const [source, setSource] = useState<Source | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 4;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_ROWS.filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      if (!q) return true;
      return [row.entity, row.metric, row.value, row.source].join(" ").toLowerCase().includes(q);
    });
  }, [source, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Kalldata</h1>
        <p className="text-sm text-muted-foreground">
          Filtrera och exportera radniva-data per kalla nar du vill validera slutsatser bortom standardrapporter.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter och scope</CardTitle>
          <CardDescription>Valj kalla, sok pa entitet och exportera aktuellt urval.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <Select value={source} onValueChange={(v) => { setSource(v as Source | "all"); setPage(1); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kallor</SelectItem>
              <SelectItem value="ads">Google Ads</SelectItem>
              <SelectItem value="ga4">GA4</SelectItem>
              <SelectItem value="gsc">GSC</SelectItem>
              <SelectItem value="dataforseo">DataForSEO</SelectItem>
              <SelectItem value="semrush">Semrush</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Sok pa kampanj, query, sida eller metric"
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Fler filter
            </Button>
            <Button size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export raw rows
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Rows: {filtered.length}</Badge>
        <Badge variant="outline">Coverage: synced fields</Badge>
        <Badge variant="outline">Freshness: synced today</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kalla</TableHead>
                <TableHead>Entitet</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Varde</TableHead>
                <TableHead>Observerad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="capitalize">{row.source}</TableCell>
                  <TableCell>{row.entity}</TableCell>
                  <TableCell>{row.metric}</TableCell>
                  <TableCell>{row.value}</TableCell>
                  <TableCell>{row.observedAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Sida {safePage} av {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                Forra
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Nasta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
