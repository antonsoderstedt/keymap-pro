// GoalsCard — Fas 3: visar och redigerar projektets goals och kundtyp.
// Skriver till project_goals + projects.workspace_type.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Target, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useProjectGoals } from "@/hooks/useProjectGoals";
import {
  WORKSPACE_TYPE_OPTIONS,
  getWorkspaceConfig,
  type WorkspaceType,
} from "@/lib/workspaceConfig";
import { CONVERSION_LABELS } from "@/lib/goalsEngine";
import { Badge } from "@/components/ui/badge";

interface Props {
  projectId: string;
}

export default function GoalsCard({ projectId }: Props) {
  const { goals, loading, save } = useProjectGoals(projectId);
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>("b2b_manufacturer");
  const [brandTermsInput, setBrandTermsInput] = useState("");
  const [draft, setDraft] = useState(goals);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(goals);
    setBrandTermsInput((goals.brand_terms || []).join(", "));
  }, [goals]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("workspace_type")
        .eq("id", projectId)
        .maybeSingle();
      if (data?.workspace_type) setWorkspaceType(data.workspace_type as WorkspaceType);
    })();
  }, [projectId]);

  const config = getWorkspaceConfig(workspaceType);

  const handleSave = async () => {
    setSaving(true);
    try {
      const brand_terms = brandTermsInput
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      await save({ ...draft, brand_terms });

      const { error } = await supabase
        .from("projects")
        .update({ workspace_type: workspaceType })
        .eq("id", projectId);
      if (error) throw error;

      toast.success("Goals och kundtyp sparade");
    } catch (e: any) {
      toast.error(e.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Laddar goals…</CardContent>
      </Card>
    );
  }

  const split = draft.strategy_split || { acquisition: 70, retention: 20, awareness: 10 };
  const conversionMeta = CONVERSION_LABELS[draft.conversion_type] || CONVERSION_LABELS.purchase;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Mål & kundtyp
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Driver hur sökord värderas, klassificeras och hur strategin viktas.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Kundtyp */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" /> Kundtyp
          </Label>
          <Select value={workspaceType} onValueChange={(v) => setWorkspaceType(v as WorkspaceType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORKSPACE_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{config.description}</p>
        </div>

        {/* Konvertering */}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Konverteringstyp</Label>
            <Select
              value={draft.conversion_type}
              onValueChange={(v: any) => setDraft({ ...draft, conversion_type: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Köp / order</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="booking">Bokning</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="store_visit">Butiksbesök</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Egen etikett (valfritt)</Label>
            <Input
              placeholder={conversionMeta.singular}
              value={draft.conversion_label || ""}
              onChange={(e) => setDraft({ ...draft, conversion_label: e.target.value || null })}
            />
          </div>
          <div>
            <Label>{conversionMeta.valueLabel} ({draft.currency})</Label>
            <Input
              type="number"
              min={0}
              value={draft.conversion_value}
              onChange={(e) => setDraft({ ...draft, conversion_value: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Konverteringsgrad (%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={draft.conversion_rate_pct}
              onChange={(e) => setDraft({ ...draft, conversion_rate_pct: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Primärt mål */}
        <div>
          <Label>Primärt fokus</Label>
          <Select
            value={draft.primary_goal}
            onValueChange={(v: any) => setDraft({ ...draft, primary_goal: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="acquisition">Acquisition (nya kunder)</SelectItem>
              <SelectItem value="retention">Retention (befintliga kunder)</SelectItem>
              <SelectItem value="awareness">Awareness (varumärke)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Strategi-split */}
        <div className="space-y-3">
          <Label>Strategi-split (%)</Label>
          <div className="space-y-3 p-3 rounded-md border border-border bg-muted/20">
            {(["acquisition", "retention", "awareness"] as const).map(k => (
              <div key={k}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize text-muted-foreground">{k}</span>
                  <Badge variant="outline" className="text-[10px]">{split[k]}%</Badge>
                </div>
                <Slider
                  value={[split[k]]}
                  min={0} max={100} step={5}
                  onValueChange={(v) =>
                    setDraft({ ...draft, strategy_split: { ...split, [k]: v[0] } })
                  }
                />
              </div>
            ))}
            <div className="text-[11px] text-muted-foreground">
              Total: {split.acquisition + split.retention + split.awareness}%
              {split.acquisition + split.retention + split.awareness !== 100 && " (bör summa till 100)"}
            </div>
          </div>
        </div>

        {/* Brand terms */}
        <div>
          <Label>Brand-termer (kommaseparerade)</Label>
          <Input
            placeholder="t.ex. acmeklinik, acme estetik"
            value={brandTermsInput}
            onChange={(e) => setBrandTermsInput(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Används för att klassa sökord som brand vs non-brand.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> {saving ? "Sparar…" : "Spara mål & kundtyp"}
        </Button>
      </CardContent>
    </Card>
  );
}
