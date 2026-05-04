import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sparkles, Eye, RefreshCw, AlertCircle, Wand2, Copy, Check, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";

interface Competitor {
  domain: string; impressionShare?: number; overlapRate?: number;
  positionAbove?: number; topOfPage?: number; absTopOfPage?: number;
  outrankingShare?: number; campaign?: string; campaigns?: string[];
}
interface Campaign {
  id: string; name: string; impressionShare?: number; topIS?: number;
  lostRank?: number; lostBudget?: number; cost?: number; conversions?: number; clicks?: number;
  is_brand?: boolean; competitors?: any[];
}

export default function AuctionInsights() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [adsCustomerId, setAdsCustomerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ competitors: Competitor[]; campaigns: Campaign[]; created_at?: string; source?: string } | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptData, setScriptData] = useState<{ webhook_url: string; per_project_secret: string; script: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<{
    message: string;
    missingColumns?: string[];
    foundColumns?: string[];
    hint?: string;
  } | null>(null);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileToBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
    }
    return btoa(bin);
  };

  const onCsvSelected = async (file: File) => {
    if (!id) return;

    // Klient-side sanity-checks innan vi laddar upp
    setCsvError(null);
    setCsvWarnings([]);
    const okExt = /\.(csv|tsv|txt)$/i.test(file.name);
    if (!okExt) {
      setCsvError({
        message: `Filtypen "${file.name.split(".").pop()}" stöds inte.`,
        hint: "Använd en .csv, .tsv eller .txt-fil exporterad från Google Ads.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size === 0) {
      setCsvError({ message: "Filen är tom.", hint: "Välj en fil med data." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setCsvError({
        message: `Filen är för stor (${(file.size / 1024 / 1024).toFixed(1)} MB, max 6 MB).`,
        hint: "Exportera ett kortare datumintervall eller färre kampanjer.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setCsvLoading(true);
    try {
      const content_base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("ads-import-auction-csv", {
        body: { project_id: id, filename: file.name, content_base64 },
      });

      // Edge-funktionen returnerar JSON med error+validation även vid 400
      if (data?.error) {
        setCsvError({
          message: data.error,
          missingColumns: data.validation?.missing_columns,
          foundColumns: data.validation?.found_columns,
          hint: data.validation?.hint,
        });
        toast.error("Importen avbröts — se detaljer ovanför tabellen");
        return;
      }
      if (error) throw error;

      if (Array.isArray(data?.warnings) && data.warnings.length) setCsvWarnings(data.warnings);
      toast.success(`Importerade ${data.competitors} konkurrent-domäner`);
      load();
    } catch (e: any) {
      setCsvError({
        message: e.message || "Kunde inte importera CSV",
        hint: "Försök igen eller kontakta support om problemet kvarstår.",
      });
      toast.error("Importen misslyckades");
    } finally {
      setCsvLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const load = async () => {
    if (!id) return;
    const { data: gset } = await supabase
      .from("project_google_settings").select("ads_customer_id").eq("project_id", id).maybeSingle();
    setAdsCustomerId(gset?.ads_customer_id ?? null);

    // Hämta senaste snapshot per källa och slå ihop:
    // - konkurrenter: senaste från CSV/script (API ger inga domän-namn)
    // - kampanjer: senaste från API (CSV innehåller inga kampanjsiffror)
    const { data: snaps } = await supabase
      .from("auction_insights_snapshots").select("*").eq("project_id", id)
      .order("created_at", { ascending: false }).limit(20);

    if (snaps && snaps.length) {
      const latest = snaps[0];
      const latestCompetitorsSnap = snaps.find((s: any) => {
        const r = s.rows as any;
        return Array.isArray(r?.competitors) && r.competitors.length > 0;
      });
      const latestCampaignsSnap = snaps.find((s: any) => {
        const r = s.rows as any;
        return Array.isArray(r?.campaigns) && r.campaigns.length > 0;
      });
      const compRows = (latestCompetitorsSnap?.rows as any)?.competitors || [];
      const campRows = (latestCampaignsSnap?.rows as any)?.campaigns || [];

      setSnapshot({
        competitors: compRows,
        campaigns: campRows,
        created_at: latest.created_at,
        source: (latest as any).source,
      });
    }
  };
  useEffect(() => { load(); }, [id]);

  const refresh = async () => {
    if (!id || !adsCustomerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-fetch-auction-insights", {
        body: { project_id: id, customer_id: adsCustomerId, days: 30 },
      });
      if (error) throw error;
      toast.success(`Hämtade ${data?.competitors || 0} konkurrenter & ${data?.campaigns || 0} kampanjer`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Misslyckades hämta Ads-data");
    } finally { setLoading(false); }
  };

  const generateScript = async () => {
    if (!id) return;
    setScriptLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-script-template", {
        body: { project_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScriptData(data);
      setScriptOpen(true);
    } catch (e: any) {
      toast.error(e.message || "Kunde inte generera script");
    } finally { setScriptLoading(false); }
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); toast.success("Kopierat");
    setTimeout(() => setCopied(null), 1500);
  };

  const isLive = !!adsCustomerId;
  const competitors = snapshot?.competitors || [];
  const campaigns = snapshot?.campaigns || [];
  const isScriptSource = snapshot?.source === "script";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-serif text-3xl">Auction Insights</h1>
            <Badge variant={isLive ? "default" : "outline"}>{isLive ? "Live" : "Inte konfigurerad"}</Badge>
            {isScriptSource && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Auto-script</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Konkurrent-data från Google Ads: vilka domäner du delar auktion med, deras IS, overlap & outranking.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsvSelected(f); }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={csvLoading}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {csvLoading ? "Importerar…" : "Importera CSV"}
          </Button>
          {isLive && (
            <Button onClick={generateScript} disabled={scriptLoading} variant="outline" className="gap-2">
              <Wand2 className="h-4 w-4" />
              {scriptLoading ? "Genererar…" : "Generera Ads Script"}
            </Button>
          )}
          {isLive && (
            <Button onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Hämtar…" : "Uppdatera nu"}
            </Button>
          )}
        </div>
      </div>

      {csvError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm space-y-2 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-destructive">CSV-importen avbröts</p>
                  <Button size="sm" variant="ghost" className="h-6 -mt-1" onClick={() => setCsvError(null)}>Stäng</Button>
                </div>
                <p className="text-foreground">{csvError.message}</p>
                {csvError.missingColumns && csvError.missingColumns.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Saknade kolumner</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {csvError.missingColumns.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {csvError.foundColumns && csvError.foundColumns.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Hittade kolumner i filen ({csvError.foundColumns.length})</summary>
                    <p className="mt-1 font-mono break-all">{csvError.foundColumns.join(" • ")}</p>
                  </details>
                )}
                {csvError.hint && <p className="text-muted-foreground">💡 {csvError.hint}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {csvWarnings.length > 0 && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm space-y-1 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">Importen genomfördes med varningar</p>
                  <Button size="sm" variant="ghost" className="h-6 -mt-1" onClick={() => setCsvWarnings([])}>Stäng</Button>
                </div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {csvWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Upload className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm space-y-2">
              <p className="font-medium">Importera Auction Insights manuellt (rekommenderas)</p>
              <p className="text-muted-foreground">
                Google blockerar Auction Insights-metrics för standard-API-konton. Snabbaste vägen till riktiga konkurrent-domäner: exportera från Google Ads UI och ladda upp filen här.
              </p>
              <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
                <li>Gå till <strong>Google Ads → Kampanjer</strong></li>
                <li>Markera kampanjerna du vill jämföra → <strong>Insikter → Auktionsstatistik</strong> (Auction insights)</li>
                <li>Välj datumintervall (t.ex. senaste 30 dagar) → klicka <strong>Hämta</strong> → välj <strong>.csv</strong></li>
                <li>Klicka <strong>Importera CSV</strong> här uppe och välj filen</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLive && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Inget Google Ads-konto valt för den här kunden</p>
              <p className="text-muted-foreground mt-1">
                Gå till <strong>Inställningar → Kopplingar → Google Ads</strong> och välj kontot som tillhör kunden, så aktiveras live-data här.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLive && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm space-y-2">
                <p className="font-medium">Få riktiga konkurrent-domäner automatiskt varje natt</p>
                <p className="text-muted-foreground">
                  Google Ads API exponerar inte konkurrent-namn (bara dina egna IS-siffror). Lös det med ett Google Ads Script som körs i ditt eget Ads-konto och postar Auction Insights till oss en gång per dygn. Engångs-setup på ~2 minuter.
                </p>
                <Button onClick={generateScript} disabled={scriptLoading} size="sm" className="gap-2 mt-2">
                  <Wand2 className="h-4 w-4" />
                  {scriptLoading ? "Genererar…" : "Generera mitt script"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLive && !snapshot && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Ingen data hämtad än. Klicka <strong>Uppdatera nu</strong> för att dra senaste 30 dagarna (egna IS-siffror), eller <strong>Generera mitt script</strong> för att få konkurrent-domäner.
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {snapshot.created_at && (
            <p className="text-xs text-muted-foreground">
              Senast uppdaterad: {new Date(snapshot.created_at).toLocaleString("sv-SE")}
              {isScriptSource && <span className="ml-2 text-primary">• via Ads Script</span>}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Konkurrenter (senaste 30 dagar)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {competitors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga konkurrent-rader. {!isScriptSource && "Installera Ads Script ovan för att få domännamn — Google Ads API exponerar dem inte."}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4">Domän</th>
                      <th className="py-2 pr-4">Impr. Share</th>
                      <th className="py-2 pr-4">Overlap</th>
                      <th className="py-2 pr-4">Pos. above</th>
                      <th className="py-2 pr-4">Outranking</th>
                      <th className="py-2 pr-4">Top of page</th>
                      <th className="py-2 pr-4">Kampanjer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c, i) => (
                      <tr key={`${c.domain}-${i}`} className="border-b border-border/50">
                        <td className="py-3 pr-4 font-medium">{c.domain}</td>
                        <td className="py-3 pr-4">{c.impressionShare != null ? `${(c.impressionShare * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.overlapRate != null ? `${(c.overlapRate * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.positionAbove != null ? `${(c.positionAbove * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.outrankingShare != null ? `${(c.outrankingShare * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4">{c.topOfPage != null ? `${(c.topOfPage * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">
                          {(c.campaigns && c.campaigns.length > 0) ? c.campaigns.join(", ") : (c.campaign || "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Kampanj-prestanda & lost IS</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga kampanjer hittades.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4">Kampanj</th>
                      <th className="py-2 pr-4">IS</th>
                      <th className="py-2 pr-4">Lost (budget)</th>
                      <th className="py-2 pr-4">Lost (rank)</th>
                      <th className="py-2 pr-4">Klick</th>
                      <th className="py-2 pr-4">Konv.</th>
                      <th className="py-2 pr-4">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const flagBudget = (c.lostBudget ?? 0) > 0.15;
                      const flagRank = (c.lostRank ?? 0) > 0.20;
                      return (
                        <tr key={c.id} className="border-b border-border/50">
                          <td className="py-3 pr-4 font-medium">
                            {c.name}
                            {c.is_brand && <Badge variant="outline" className="ml-2 text-xs">Brand</Badge>}
                          </td>
                          <td className="py-3 pr-4">{c.impressionShare != null ? `${(c.impressionShare * 100).toFixed(0)}%` : "—"}</td>
                          <td className={`py-3 pr-4 ${flagBudget ? "text-destructive font-medium" : ""}`}>
                            {c.lostBudget != null ? `${(c.lostBudget * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className={`py-3 pr-4 ${flagRank ? "text-destructive font-medium" : ""}`}>
                            {c.lostRank != null ? `${(c.lostRank * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="py-3 pr-4">{c.clicks ?? 0}</td>
                          <td className="py-3 pr-4">{c.conversions?.toFixed(1) ?? 0}</td>
                          <td className="py-3 pr-4">{c.cost ? `${c.cost.toFixed(0)} kr` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Google Ads Script — engångs-setup</DialogTitle>
            <DialogDescription>
              Klistra in scriptet i ditt Google Ads-konto. Det körs sen automatiskt varje natt.
            </DialogDescription>
          </DialogHeader>

          {scriptData && (
            <div className="space-y-4">
              <ol className="list-decimal pl-5 space-y-2 text-sm">
                <li>Logga in på <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">Google Ads <ExternalLink className="h-3 w-3" /></a></li>
                <li>Klicka på <strong>Verktyg</strong> (uppe till vänster) → <strong>Bulk-åtgärder</strong> → <strong>Skript</strong></li>
                <li>Klicka <strong>+</strong> för nytt script → ge det namnet "Slay Station Auction Insights"</li>
                <li>Klistra in koden nedan, klicka <strong>Spara</strong> → <strong>Auktorisera</strong> (godkänn behörigheter)</li>
                <li>Klicka <strong>Förhandsgranska</strong> en gång — verifiera att det körs utan fel</li>
                <li>Klicka <strong>Schemalägg</strong> → välj <strong>Daglig</strong> → spara</li>
              </ol>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Script-kod</label>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copy(scriptData.script, "script")}>
                    {copied === "script" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Kopiera
                  </Button>
                </div>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-72 border border-border">
                  <code>{scriptData.script}</code>
                </pre>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                <p><strong>Webhook-URL:</strong> <code className="text-foreground">{scriptData.webhook_url}</code></p>
                <p><strong>Projekt-ID:</strong> <code className="text-foreground">{id}</code></p>
                <p>Hemligheten i scriptet är unik för det här projektet — dela den inte. Om den läcker, klicka "Generera mitt script" igen så roterar vi den.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
