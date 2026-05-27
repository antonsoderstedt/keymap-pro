import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Download, Eye, FilePlus2, Database, Calendar } from "lucide-react";

type SourceStatus = "ok" | "stale" | "error" | "reauth_required" | "not_connected";

type ReportCard = {
  key: string;
  title: string;
  description: string;
  sources: string[];
  status: SourceStatus;
  formats: string[];
};

const REPORTS: ReportCard[] = [
  {
    key: "ads-audit",
    title: "Google Ads Audit",
    description: "Visar vad som andrats, varfor det spelar roll och vad som bor goras nu.",
    sources: ["Google Ads"],
    status: "ok",
    formats: ["PDF", "CSV", "PPTX", "HTML"],
  },
  {
    key: "ga4",
    title: "GA4 Performance",
    description: "Trafik, engagement och konverteringsutveckling med jamforelseperiod.",
    sources: ["GA4"],
    status: "ok",
    formats: ["PDF", "CSV"],
  },
  {
    key: "gsc",
    title: "GSC Search Performance",
    description: "Synlighet, klick och query-landningssida utveckling.",
    sources: ["GSC"],
    status: "stale",
    formats: ["PDF", "CSV"],
  },
  {
    key: "cross-source",
    title: "Cross-source Overview",
    description: "Samlad bild over Ads, GA4 och GSC med deltas och riskflaggor.",
    sources: ["Google Ads", "GA4", "GSC"],
    status: "ok",
    formats: ["PDF", "CSV", "PPTX"],
  },
];

const HISTORY = [
  { name: "TryggaRor_ads_audit_2026-05-01_2026-05-27.pdf", generatedAt: "2026-05-27 09:14", version: "v1" },
  { name: "TryggaRor_cross_source_2026-05-01_2026-05-27.csv", generatedAt: "2026-05-27 09:20", version: "v1" },
];

function statusTone(status: SourceStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ok":
      return "secondary";
    case "stale":
      return "outline";
    case "error":
      return "destructive";
    case "reauth_required":
      return "outline";
    default:
      return "outline";
  }
}

export default function ReportsCenter() {
  const [period, setPeriod] = useState("last_28_days");
  const [comparison, setComparison] = useState("previous_period");

  const freshnessText = useMemo(() => {
    if (period === "last_7_days") return "Senast synkat: idag 07:40";
    if (period === "this_month") return "Senast synkat: idag 07:40";
    return "Senast synkat: idag 07:40";
  }, [period]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Rapporter</h1>
        <p className="text-sm text-muted-foreground">
          Skapa, forhandsgranska och ladda ner rapporter. Alla kort visar datastatus, period och format.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rapportinställningar</CardTitle>
          <CardDescription>
            Valen galler for generering och forhandsvisning i denna vy.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Period</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Senaste 7 dagarna</SelectItem>
                <SelectItem value="last_28_days">Senaste 28 dagarna</SelectItem>
                <SelectItem value="this_month">Denna manad</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Jamforelse</p>
            <Select value={comparison} onValueChange={setComparison}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous_period">Foregaende period</SelectItem>
                <SelectItem value="previous_year">Foregaende ar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground w-full">
              <Calendar className="mr-2 inline h-4 w-4" />
              {freshnessText}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.key}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{report.title}</CardTitle>
                <Badge variant={statusTone(report.status)}>{report.status}</Badge>
              </div>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Kallor: {report.sources.join(", ")} · Format: {report.formats.join(", ")}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Generera
                </Button>
                <Button size="sm" variant="outline">
                  <Eye className="mr-2 h-4 w-4" />
                  Forhandsvisa
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Ladda ner
                </Button>
                <Button size="sm" variant="ghost">
                  <Database className="mr-2 h-4 w-4" />
                  Visa kalldata
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Separator />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved presets</CardTitle>
            <CardDescription>Period, jamforelse, kallor och format som kan ateranvandas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="rounded-md border p-2">Standard ledningsrapport · 28 dagar · Foregaende period · PDF</p>
            <p className="rounded-md border p-2">Ops djupdyk · 7 dagar · Foregaende period · CSV</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artifact history</CardTitle>
            <CardDescription>Tidigare genererade filer med version och tidpunkt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {HISTORY.map((item) => (
              <div key={item.name} className="rounded-md border p-2">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.generatedAt} · {item.version}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
