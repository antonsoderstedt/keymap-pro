import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Download, Eye, FilePlus2, Database, Calendar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDataSourcesStatus, type SourceStatus as DsStatus } from "@/hooks/useDataSourcesStatus";
import { toCsv, downloadCsv, ymd } from "@/lib/csv";

type SourceStatus = "ok" | "stale" | "error" | "reauth_required" | "not_connected";
type ArtifactRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  payload: Record<string, any>;
};

type PresetRow = {
  id: string;
  name: string;
  created_at: string;
  payload: {
    period: string;
    comparison: string;
  };
};

type AuditLens = {
  healthScore: number | null;
  headline: string;
  strengths: string[];
  issues: Array<{ title?: string; severity?: string; detail?: string; fix?: string; impact_sek?: number }>;
  openActions: Array<{ title: string; priority: string; expected_impact_sek: number | null }>;
  latestAuctionRows: number;
  updatedAt: string | null;
};

type ReportCard = {
  key: string;
  title: string;
  description: string;
  sources: string[];
  sourceKeys: Array<"ga4" | "gsc" | "ads">;
  reportType: string;
  formats: string[];
};

const REPORTS: ReportCard[] = [
  {
    key: "ads-audit",
    title: "Google Ads Audit",
    description: "Visar vad som andrats, varfor det spelar roll och vad som bor goras nu.",
    sources: ["Google Ads"],
    sourceKeys: ["ads"],
    reportType: "auction_insights",
    formats: ["PDF", "CSV", "PPTX", "HTML"],
  },
  {
    key: "ga4",
    title: "GA4 Performance",
    description: "Trafik, engagement och konverteringsutveckling med jamforelseperiod.",
    sources: ["GA4"],
    sourceKeys: ["ga4"],
    reportType: "ga4_traffic",
    formats: ["PDF", "CSV"],
  },
  {
    key: "gsc",
    title: "GSC Search Performance",
    description: "Synlighet, klick och query-landningssida utveckling.",
    sources: ["GSC"],
    sourceKeys: ["gsc"],
    reportType: "seo_performance",
    formats: ["PDF", "CSV"],
  },
  {
    key: "cross-source",
    title: "Cross-source Overview",
    description: "Samlad bild over Ads, GA4 och GSC med deltas och riskflaggor.",
    sources: ["Google Ads", "GA4", "GSC"],
    sourceKeys: ["ads", "ga4", "gsc"],
    reportType: "executive",
    formats: ["PDF", "CSV", "PPTX"],
  },
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
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { data: sourcePayload, refresh: refreshSources } = useDataSourcesStatus(workspace?.id);
  const [period, setPeriod] = useState("last_28_days");
  const [comparison, setComparison] = useState("previous_period");
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactRow | null>(null);
  const [auditLens, setAuditLens] = useState<AuditLens | null>(null);

  const statusBySource = useMemo(() => {
    const out: Partial<Record<"ga4" | "gsc" | "ads", DsStatus>> = {};
    for (const s of sourcePayload?.sources || []) {
      if (s.source === "ga4" || s.source === "gsc" || s.source === "ads") out[s.source] = s.status;
    }
    return out;
  }, [sourcePayload]);

  const reportStatus = (keys: Array<"ga4" | "gsc" | "ads">): SourceStatus => {
    const statuses = keys.map((k) => statusBySource[k] ?? "not_connected");
    if (statuses.includes("error")) return "error";
    if (statuses.includes("reauth_required")) return "reauth_required";
    if (statuses.includes("not_connected")) return "not_connected";
    if (statuses.includes("stale")) return "stale";
    return "ok";
  };

  const loadArtifacts = async () => {
    if (!workspace?.id) return;
    setLoadingArtifacts(true);
    const { data, error } = await supabase
      .from("workspace_artifacts")
      .select("id,name,description,created_at,payload")
      .eq("project_id", workspace.id)
      .eq("artifact_type", "report")
      .order("created_at", { ascending: false })
      .limit(25);
    setLoadingArtifacts(false);
    if (error) {
      toast.error(`Kunde inte hamta artifacts: ${error.message}`);
      return;
    }
    setArtifacts((data as ArtifactRow[]) || []);
  };

  const loadPresets = async () => {
    if (!workspace?.id) return;
    setLoadingPresets(true);
    const { data, error } = await supabase
      .from("workspace_artifacts")
      .select("id,name,created_at,payload")
      .eq("project_id", workspace.id)
      .eq("artifact_type", "report_preset")
      .order("created_at", { ascending: false })
      .limit(20);
    setLoadingPresets(false);
    if (error) {
      toast.error(`Kunde inte hamta presets: ${error.message}`);
      return;
    }
    setPresets((data as PresetRow[]) || []);
  };

  const savePreset = async () => {
    if (!workspace?.id) return;
    const defaultName = `Preset ${new Date().toLocaleDateString("sv-SE")}`;
    const name = window.prompt("Namn pa preset", defaultName);
    if (!name) return;

    setSavingPreset(true);
    const { error } = await supabase.from("workspace_artifacts").insert({
      project_id: workspace.id,
      artifact_type: "report_preset",
      name,
      description: "Rapportinstallning",
      payload: {
        period,
        comparison,
      },
    });
    setSavingPreset(false);
    if (error) {
      toast.error(`Kunde inte spara preset: ${error.message}`);
      return;
    }
    toast.success("Preset sparad");
    loadPresets();
  };

  const applyPreset = (preset: PresetRow) => {
    setPeriod(preset.payload?.period || "last_28_days");
    setComparison(preset.payload?.comparison || "previous_period");
    toast.success(`Preset laddad: ${preset.name}`);
  };

  const loadAuditLens = async () => {
    if (!workspace?.id) return;
    const [auditRes, actionsRes, auctionRes] = await Promise.all([
      supabase
        .from("ads_audits")
        .select("health_score,summary,created_at")
        .eq("project_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("action_items")
        .select("title,priority,expected_impact_sek,status")
        .eq("project_id", workspace.id)
        .neq("status", "done")
        .in("category", ["ads", "audit"])
        .order("expected_impact_sek", { ascending: false, nullsFirst: false })
        .limit(8),
      supabase
        .from("auction_insights_snapshots")
        .select("rows,created_at")
        .eq("project_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (auditRes.error || actionsRes.error || auctionRes.error) {
      return;
    }

    const summary = (auditRes.data?.summary as any) || {};
    const auctionRows = (auctionRes.data?.rows as any)?.campaigns || [];
    const lens: AuditLens = {
      healthScore: auditRes.data?.health_score ?? null,
      headline: summary?.headline || "Ingen audit-headline tillganglig an",
      strengths: (summary?.strengths || []).slice(0, 4),
      issues: (summary?.issues || []).slice(0, 6),
      openActions: ((actionsRes.data as any[]) || []).map((a) => ({
        title: a.title,
        priority: a.priority,
        expected_impact_sek: a.expected_impact_sek,
      })),
      latestAuctionRows: Array.isArray(auctionRows) ? auctionRows.length : 0,
      updatedAt: auditRes.data?.created_at || auctionRes.data?.created_at || null,
    };
    setAuditLens(lens);
  };

  useEffect(() => {
    loadArtifacts();
    loadPresets();
    loadAuditLens();
  }, [workspace?.id]);

  const freshnessText = useMemo(() => {
    if (period === "last_7_days") return "Senast synkat: idag 07:40";
    if (period === "this_month") return "Senast synkat: idag 07:40";
    return "Senast synkat: idag 07:40";
  }, [period]);

  const generateReport = async (report: ReportCard) => {
    if (!workspace?.id) return;
    setGeneratingKey(report.key);
    const name = `${workspace.name}_${report.key}_${ymd()}`;
    const { data, error } = await supabase.functions.invoke("generate-report", {
      body: {
        project_id: workspace.id,
        report_type: report.reportType,
        name,
      },
    });
    setGeneratingKey(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Rapportgenerering misslyckades");
      return;
    }
    toast.success("Rapport genererad och sparad i artifact history");
    refreshSources();
    loadArtifacts();
  };

  const exportArtifact = (artifact: ArtifactRow, mode: "json" | "csv") => {
    if (mode === "json") {
      const blob = new Blob([JSON.stringify(artifact.payload || {}, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${artifact.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const sections = (artifact.payload?.sections || {}) as Record<string, any>;
    const rows = Object.entries(sections).map(([section, value]) => ({
      section,
      status: value?.status || "unknown",
      reason: value?.reason || "",
      fix: value?.fix || "",
    }));
    const csv = toCsv(rows, ["section", "status", "reason", "fix"]);
    downloadCsv(`${artifact.name}.csv`, csv);
  };

  const exportArtifactPdf = async (artifact: ArtifactRow) => {
    const jsPdfMod = await import("jspdf");
    const doc = new jsPdfMod.jsPDF();

    let y = 16;
    const next = (inc = 8) => {
      y += inc;
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
    };

    doc.setFontSize(16);
    doc.text(artifact.name, 14, y);
    next(8);
    doc.setFontSize(10);
    doc.text(`Rapporttyp: ${artifact.payload?.report_type || "report"}`, 14, y);
    next(6);
    doc.text(`Skapad: ${new Date(artifact.created_at).toLocaleString("sv-SE")}`, 14, y);
    next(10);

    const issues = artifact.payload?.issues || [];
    doc.setFontSize(12);
    doc.text("Issues", 14, y);
    next(7);
    doc.setFontSize(10);
    if (!issues.length) {
      doc.text("Inga issues registrerade.", 14, y);
      next(7);
    } else {
      issues.slice(0, 12).forEach((it: any) => {
        const line = `- ${it.section || "section"}: ${it.message || ""}`;
        const lines = doc.splitTextToSize(line, 180);
        doc.text(lines, 14, y);
        next(lines.length * 5);
      });
    }

    const sections = Object.entries((artifact.payload?.sections || {}) as Record<string, any>);
    doc.setFontSize(12);
    doc.text("Sections", 14, y);
    next(7);
    doc.setFontSize(10);
    sections.slice(0, 20).forEach(([name, sec]) => {
      const line = `- ${name}: ${sec?.status || "unknown"}${sec?.reason ? ` (${sec.reason})` : ""}`;
      const lines = doc.splitTextToSize(line, 180);
      doc.text(lines, 14, y);
      next(lines.length * 5);
    });

    doc.save(`${artifact.name}.pdf`);
  };

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

          <div className="md:col-span-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={savePreset} disabled={savingPreset}>
              {savingPreset ? "Sparar..." : "Spara preset"}
            </Button>
            <Button size="sm" variant="outline" onClick={loadPresets} disabled={loadingPresets}>
              {loadingPresets ? "Laddar presets..." : "Uppdatera presets"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.key}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{report.title}</CardTitle>
                <Badge variant={statusTone(reportStatus(report.sourceKeys))}>{reportStatus(report.sourceKeys)}</Badge>
              </div>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Kallor: {report.sources.join(", ")} · Format: {report.formats.join(", ")}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={generatingKey === report.key} onClick={() => generateReport(report)}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  {generatingKey === report.key ? "Genererar..." : "Generera"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!artifacts.length}
                  onClick={() => setPreview(artifacts.find((a) => (a.payload?.report_type || "") === report.reportType) || artifacts[0] || null)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Forhandsvisa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!artifacts.length}
                  onClick={() => {
                    const latest = artifacts.find((a) => (a.payload?.report_type || "") === report.reportType);
                    if (!latest) {
                      toast.error("Ingen artifact hittades for rapporttypen");
                      return;
                    }
                    exportArtifact(latest, "csv");
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Ladda ner
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${workspace?.id}/raw-data`)}>
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
            {!presets.length && <p className="text-muted-foreground">Inga sparade presets an.</p>}
            {presets.map((p) => (
              <div key={p.id} className="rounded-md border p-2">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.payload?.period || "-"} · {p.payload?.comparison || "-"} · {new Date(p.created_at).toLocaleString("sv-SE")}
                </p>
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => applyPreset(p)}>
                    Anvand preset
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artifact history</CardTitle>
            <CardDescription>Tidigare genererade filer med version och tidpunkt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="mb-2">
              <Button size="sm" variant="outline" onClick={loadArtifacts} disabled={loadingArtifacts}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {loadingArtifacts ? "Laddar..." : "Uppdatera"}
              </Button>
            </div>
            {!artifacts.length && <p className="text-muted-foreground">Inga rapport-artifacts an sa lange.</p>}
            {artifacts.map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("sv-SE")} · {(item.payload?.report_type || "report") as string}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreview(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Forhandsvisa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportArtifact(item, "csv")}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportArtifactPdf(item)}>
                    PDF
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => exportArtifact(item, "json")}>
                    JSON
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {auditLens && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Google Ads Audit Preview (A-I)</CardTitle>
            <CardDescription>
              Senast uppdaterad: {auditLens.updatedAt ? new Date(auditLens.updatedAt).toLocaleString("sv-SE") : "okand"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">A) Executive summary</p>
                <p className="mt-1">{auditLens.headline}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">B) Account health</p>
                <p className="mt-1">Health score: {auditLens.healthScore ?? "-"}/10</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">F) Segmentation</p>
                <p className="mt-1">Auction rows: {auditLens.latestAuctionRows}</p>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">C) Performance drivers</p>
                <p className="mt-1 text-muted-foreground">Hamtas fran audit issues + auction snapshot.</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">D) Waste & leakage</p>
                <p className="mt-1 text-muted-foreground">Flaggas via issue-lista och actions av kategori ads/audit.</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">E) Quality & relevance</p>
                <p className="mt-1 text-muted-foreground">Kvalitetsrisker visas som severity i issue-listan.</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">G) Opportunities & risks</p>
                <p className="mt-1 text-muted-foreground">Prioriteras via expected_impact_sek och severity.</p>
              </div>
            </div>

            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground mb-1">C-D-E-G) Drivers, waste, quality, risks</p>
              {auditLens.issues.length ? (
                <ul className="space-y-1">
                  {auditLens.issues.map((it, idx) => (
                    <li key={idx}>• [{it.severity || "info"}] {it.title || "Issue"} {it.impact_sek ? `(~${Math.round(it.impact_sek)} SEK)` : ""}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Inga issues i senaste audit-summary.</p>
              )}
            </div>

            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground mb-1">H) Action plan</p>
              {auditLens.openActions.length ? (
                <ul className="space-y-1">
                  {auditLens.openActions.slice(0, 6).map((a, idx) => (
                    <li key={idx}>• {a.title} · {a.priority} {a.expected_impact_sek ? `· ${Math.round(a.expected_impact_sek)} SEK` : ""}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Inga oppna ads/audit-action items.</p>
              )}
            </div>

            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground mb-1">I) Appendix signals</p>
              {auditLens.strengths.length ? (
                <ul className="space-y-1">
                  {auditLens.strengths.map((s, idx) => (
                    <li key={idx}>• {s}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Inga styrkor i summary hittades.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forhandsvisning: {preview.name}</CardTitle>
            <CardDescription>
              {(preview.payload?.report_type || "report") as string} · {new Date(preview.created_at).toLocaleString("sv-SE")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.payload?.issues?.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium mb-1">Dataluckor / issues</p>
                <ul className="space-y-1 text-muted-foreground">
                  {preview.payload.issues.slice(0, 8).map((it: any, idx: number) => (
                    <li key={idx}>• {it.section}: {it.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries((preview.payload?.sections || {}) as Record<string, any>).slice(0, 12).map(([section, value]) => (
                <div key={section} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{section}</p>
                  <p className="text-xs text-muted-foreground">status: {value?.status || "unknown"}</p>
                  {value?.reason && <p className="text-xs mt-1">{value.reason}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
