import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Save } from "lucide-react";
import { toast } from "sonner";

interface Props { projectId: string }

export default function RevenueSettings({ projectId }: Props) {
  const [aov, setAov] = useState("1000");
  const [cr, setCr] = useState("2.0");
  const [margin, setMargin] = useState("100");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("project_revenue_settings")
        .select("avg_order_value, conversion_rate_pct, gross_margin_pct")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data) {
        setAov(String(data.avg_order_value));
        setCr(String(data.conversion_rate_pct));
        setMargin(String(data.gross_margin_pct));
      }
      setLoading(false);
    })();
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("project_revenue_settings").upsert({
      project_id: projectId,
      avg_order_value: parseFloat(aov) || 0,
      conversion_rate_pct: parseFloat(cr) || 0,
      gross_margin_pct: parseFloat(margin) || 0,
    }, { onConflict: "project_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Affärsvärden sparade — kronvärden räknas om automatiskt");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" /> Affärsvärden
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Används för att räkna ut kronvärde på sökord, sidor, actions och annonsspill. Sätt så nära verkligheten du kan — det driver hela appens prioritering.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Snittordervärde (kr)</Label>
            <Input type="number" value={aov} onChange={(e) => setAov(e.target.value)} placeholder="1000" disabled={loading} />
            <p className="text-[10px] text-muted-foreground mt-1">Genomsnittligt ordervärde / lead-värde.</p>
          </div>
          <div>
            <Label>Konverteringsgrad (%)</Label>
            <Input type="number" step="0.1" value={cr} onChange={(e) => setCr(e.target.value)} placeholder="2.0" disabled={loading} />
            <p className="text-[10px] text-muted-foreground mt-1">Andel besökare som blir kund / lead.</p>
          </div>
          <div>
            <Label>Bruttomarginal (%)</Label>
            <Input type="number" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="100" disabled={loading} />
            <p className="text-[10px] text-muted-foreground mt-1">100 = räknar på omsättning, lägre = på täckningsbidrag.</p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={saving || loading} className="gap-2">
          <Save className="h-3 w-3" /> {saving ? "Sparar…" : "Spara"}
        </Button>
      </CardContent>
    </Card>
  );
}
