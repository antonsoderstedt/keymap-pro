import { Progress } from "@/components/ui/progress";

interface LoadingScreenProps {
  progress: number;
  message: string;
}

const STEPS = [
  "Läser in kunddata...",
  "Analyserar branschsegment...",
  "Identifierar branschspråk och sökbeteenden...",
  "Genererar keyword clusters...",
  "Hittar expansionsmöjligheter...",
  "Bygger Google Ads-kampanjstruktur...",
  "Identifierar Quick Wins...",
  "Hämtar verkliga sökvolymer från Google Sverige...",
  "Sammanställer resultat...",
];

export default function LoadingScreen({ progress, message }: LoadingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <div className="h-8 w-8 rounded-full bg-primary animate-pulse-glow" />
      </div>
      <h2 className="font-serif text-2xl mb-2">Analyserar...</h2>
      <p className="mb-6 text-sm text-muted-foreground">{message}</p>
      <div className="w-full max-w-md">
        <Progress value={progress} className="h-2" />
        <p className="mt-2 text-center text-xs text-muted-foreground">{Math.round(progress)}%</p>
      </div>
      <div className="mt-8 space-y-2 text-xs text-muted-foreground">
        {STEPS.map((step, i) => {
          const stepProgress = (i / STEPS.length) * 100;
          const isActive = progress >= stepProgress && progress < stepProgress + (100 / STEPS.length);
          const isDone = progress > stepProgress + (100 / STEPS.length);
          return (
            <div key={i} className={`flex items-center gap-2 ${isDone ? "text-primary" : isActive ? "text-foreground" : ""}`}>
              <span>{isDone ? "✓" : isActive ? "●" : "○"}</span>
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
