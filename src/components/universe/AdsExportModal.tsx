import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  buildGoogleAdsEditorZip,
  buildAdGroupsForGeneration,
  DEFAULT_EXPORT_CONFIG,
  type ExportConfig,
} from "@/lib/googleAdsExport";
import type { KeywordUniverse, AdDraft } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  universe: KeywordUniverse;
  projectId: string;
  analysisId: string;
}

export function AdsExportModal({ open, onClose, universe, projectId, analysisId }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const eligibleAds = universe.keywords.filter((k) =>
    !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads"
  );
  const adGroupCount = new Set(eligibleAds.map((k) => k.recommendedAdGroup || k.cluster)).size;

  const generateAdsAndExport = async () => {
    let ads: AdDraft[] = [];

    if (cfg.includeAds) {
      // Check existing drafts
      const { data: existing } = await supabase
        .from("ad_drafts")
        .select("*")
        .eq("analysis_id", analysisId);

      if (existing && existing.length > 0) {
        ads = existing as any;
      } else {
        setGenerating(true);
        try {
          const adGroups = buildAdGroupsForGeneration(universe);
          if (adGroups.length === 0) {
            toast({ title: "Inga annonsgrupper", description: "Inga sökord med Google Ads-kanal och volym > 0.", variant: "destructive" });
            setGenerating(false);
            return;
          }
          const { data, error } = await supabase.functions.invoke("generate-ads", {
            body: { project_id: projectId, analysis_id: analysisId, ad_groups: adGroups },
          });
          if (error) throw error;
          ads = (data?.drafts || []).map((d: any) => ({ ad_group: d.ad_group, payload: d.payload }));
          toast({ title: "Annonser genererade", description: `${ads.length} annonsgrupper` });
        } catch (e: any) {
          toast({ title: "Fel vid generering av annonser", description: e.message, variant: "destructive" });
          setGenerating(false);
          return;
        }
        setGenerating(false);
      }
    }

    setExporting(true);
    try {
      const blob = await buildGoogleAdsEditorZip(universe, cfg, ads);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `google-ads-editor-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export klar", description: "ZIP nedladdad. Importera i Google Ads Editor." });
      onClose();
    } catch (e: any) {
      toast({ title: "Export misslyckades", description: e.message, variant: "destructive" });
    }
    setExporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportera till Google Ads Editor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sökord (Google Ads):</span><Badge variant="outline">{eligibleAds.length}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Annonsgrupper:</span><Badge variant="outline">{adGroupCount}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Negativa kw:</span><Badge variant="outline">{universe.keywords.filter((k) => k.isNegative).length}</Badge></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="budget" className="text-xs">Daglig budget (SEK)</Label>
              <Input id="budget" type="number" value={cfg.dailyBudgetSek}
                onChange={(e) => setCfg({ ...cfg, dailyBudgetSek: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Bidstrategi</Label>
              <Select value={cfg.bidStrategy} onValueChange={(v) => setCfg({ ...cfg, bidStrategy: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual CPC">Manual CPC</SelectItem>
                  <SelectItem value="Maximize Clicks">Maximize Clicks</SelectItem>
                  <SelectItem value="Maximize Conversions">Maximize Conversions</SelectItem>
                  <SelectItem value="Target CPA">Target CPA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Gruppera per</Label>
              <Select value={cfg.groupBy} onValueChange={(v) => setCfg({ ...cfg, groupBy: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cluster">Kluster (en kampanj per kluster)</SelectItem>
                  <SelectItem value="intent">Intent (Commercial/Transactional)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Språk</Label>
              <Select value={cfg.language} onValueChange={(v) => setCfg({ ...cfg, language: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Swedish">Swedish</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="broad" checked={cfg.includeBroadMatch} onCheckedChange={(v) => setCfg({ ...cfg, includeBroadMatch: v })} />
            <Label htmlFor="broad" className="text-xs cursor-pointer">Inkludera Broad match</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ads" checked={cfg.includeAds} onCheckedChange={(v) => setCfg({ ...cfg, includeAds: v })} />
            <Label htmlFor="ads" className="text-xs cursor-pointer flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Generera AI-annonser (RSA + extensions)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating || exporting}>Avbryt</Button>
          <Button onClick={generateAdsAndExport} disabled={generating || exporting} className="gap-2">
            {(generating || exporting) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {generating ? "Genererar annonser..." : exporting ? "Bygger ZIP..." : "Exportera ZIP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
