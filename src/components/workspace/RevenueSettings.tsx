import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Save } from "lucide-react";
import { toast } from "sonner";
import { Currency, SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/revenue";

interface Props { projectId: string }

const CURRENCY_SYMBOL: Record<Currency, string> = {
  SEK: "kr", EUR: "€", USD: "$", GBP: "£", NOK: "kr", DKK: "kr",
};

export default function RevenueSettings({ projectId }: Props) {
  const [aov, setAov] = useState("1000");
  const [cr, setCr] = useState("2.0");
  const [margin, setMargin] = useState("100");
  const [currency, setCurrency] = useState<Currency>("SEK");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("project_revenue_settings")
        .select("avg_order_value, conversion_rate_pct, gross_margin_pct, currency")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data) {
        setAov(String(data.avg_order_value));
        setCr(String(data.conversion_rate_pct));
        setMargin(String(data.gross_margin_pct));
        if (isSupportedCurrency(data.currency)) setCurrency(data.currency);
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
      currency,
    }, { onConflict: "project_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(`Affärsvärden sparade i ${currency} — värden räknas om automatiskt`);
  };

  const sym = CURRENCY_SYMBOL[currency];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" /> Affärsvärden
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Används för att räkna ut värdet på sökord, sidor, actions och annonsspill. Sätt så nära verkligheten du kan — det driver hela appens prioritering.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Valuta</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)} disabled={loading}>
            <SelectTrigger className="w-full md:w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-1">
            Styr hur kron-/eurosvärde visas i hela projektet — dashboard, ROI, briefingar och e-post.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Snittordervärde ({sym})</Label>
            <Input type="number" value={aov} onChange={(e) => setAov(e.target.value)} placeholder="1000" disabled={loading} />
            <p className="text-[10px] text-muted-foreground mt-1">Genomsnittligt ordervärde / lead-värde i {currency}.</p>
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
