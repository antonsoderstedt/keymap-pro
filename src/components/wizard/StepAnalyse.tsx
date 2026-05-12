import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Search, Expand, Megaphone, Zap, Globe, Sparkles, Network } from "lucide-react";
import type { AnalysisOptions, UniverseScale } from "@/lib/types";

interface StepAnalyseProps {
  options: AnalysisOptions;
  setOptions: (o: AnalysisOptions) => void;
  hasDomainsForScan: boolean;
}

const modules = [
  { key: "segmentAnalysis" as const, label: "Segmentanalys & Branschspråk", desc: "Identifierar segment, hur de söker och deras språkbruk", icon: BarChart3 },
  { key: "keywordClusters" as const, label: "Keyword Clusters", desc: "Grupperade sökord per segment med volym, svårighet och CPC", icon: Search },
  { key: "keywordResearch" as const, label: "Keyword Research (40–60/segment)", desc: "Djup sökordsforskning: kärna, matrisexpansion och long-tail per segment", icon: Sparkles },
  { key: "keywordUniverse" as const, label: "Keyword Universe (skalad)", desc: "Bygger fullt sökordsuniverse via 12 dimensioner: produkt × bransch × geo × problem × lösning × material …", icon: Network },
  { key: "expansion" as const, label: "Expansion — nya segment", desc: "Hittar angränsande segment med samma behov", icon: Expand },
  { key: "adsStructure" as const, label: "Google Ads-struktur", desc: "Färdiga kampanjer med annonsgrupper, match types och negativa", icon: Megaphone },
  { key: "quickWins" as const, label: "Quick Wins", desc: "Sökord med låg konkurrens och hög köpintent", icon: Zap },
  { key: "webscan" as const, label: "Webbscan av kundföretag", desc: "Skannar kunddomäner för att förstå vad de bygger och behöver", icon: Globe },
];

const scaleOptions: { value: UniverseScale; label: string; desc: string }[] = [
  { value: "focused", label: "Fokuserat", desc: "200–500 sökord, ~15 sek, ~5 öre" },
  { value: "broad", label: "Brett", desc: "500–1500 sökord, ~30 sek, ~15 öre" },
  { value: "max", label: "Maximalt", desc: "5 000–8 000 sökord, 2–4 min — körs i bakgrunden" },
  { value: "ultra", label: "Ultra", desc: "10 000–15 000 sökord, 5–10 min — körs i bakgrunden" },
];

export default function StepAnalyse({ options, setOptions, hasDomainsForScan }: StepAnalyseProps) {
  const toggle = (key: keyof AnalysisOptions) => {
    if (typeof options[key] === "boolean") {
      setOptions({ ...options, [key]: !options[key] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl mb-1">Välj analysmoduler</h2>
        <p className="text-sm text-muted-foreground">Välj vilka analyser som ska köras</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {modules.map((m) => {
          const disabled = m.key === "webscan" && !hasDomainsForScan;
          const Icon = m.icon;
          const checked = options[m.key] as boolean;
          return (
            <Card
              key={m.key}
              className={`cursor-pointer border-border transition-colors ${
                checked ? "border-primary bg-primary/5" : "bg-card hover:border-muted-foreground/30"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && toggle(m.key)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => !disabled && toggle(m.key)}
                  disabled={disabled}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{m.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                  {disabled && <p className="mt-1 text-xs text-destructive">Inga kunddomäner tillgängliga</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {options.keywordUniverse && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Universe-skala</span>
          </div>
          <p className="text-xs text-muted-foreground">Bestäm hur stort sökordsuniverse som ska byggas. Påverkar tid och DataForSEO-kostnad.</p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {scaleOptions.map((s) => {
              const active = (options.universeScale || "broad") === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setOptions({ ...options, universeScale: s.value })}
                  className={`text-left rounded-md border p-3 transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
