import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Search, Expand, Megaphone, Zap, Globe } from "lucide-react";
import type { AnalysisOptions } from "@/lib/types";

interface StepAnalyseProps {
  options: AnalysisOptions;
  setOptions: (o: AnalysisOptions) => void;
  hasDomainsForScan: boolean;
}

const modules = [
  { key: "segmentAnalysis" as const, label: "Segmentanalys & Branschspråk", desc: "Identifierar segment, hur de söker och deras språkbruk", icon: BarChart3 },
  { key: "keywordClusters" as const, label: "Keyword Clusters", desc: "Grupperade sökord per segment med volym, svårighet och CPC", icon: Search },
  { key: "expansion" as const, label: "Expansion — nya segment", desc: "Hittar angränsande segment med samma behov", icon: Expand },
  { key: "adsStructure" as const, label: "Google Ads-struktur", desc: "Färdiga kampanjer med annonsgrupper, match types och negativa", icon: Megaphone },
  { key: "quickWins" as const, label: "Quick Wins", desc: "Sökord med låg konkurrens och hög köpintent", icon: Zap },
  { key: "webscan" as const, label: "Webbscan av kundföretag", desc: "Skannar kunddomäner för att förstå vad de bygger och behöver", icon: Globe },
];

export default function StepAnalyse({ options, setOptions, hasDomainsForScan }: StepAnalyseProps) {
  const toggle = (key: keyof AnalysisOptions) => {
    setOptions({ ...options, [key]: !options[key] });
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
          return (
            <Card
              key={m.key}
              className={`cursor-pointer border-border transition-colors ${
                options[m.key] ? "border-primary bg-primary/5" : "bg-card hover:border-muted-foreground/30"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && toggle(m.key)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <Checkbox
                  checked={options[m.key]}
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
    </div>
  );
}
