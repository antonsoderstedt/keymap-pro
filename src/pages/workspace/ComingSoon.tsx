// TODO: DEAD FILE — ingen route pekar hit
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  phase?: string;
}

export default function ComingSoon({ title, description, phase = "Kommande fas" }: ComingSoonProps) {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="font-serif text-3xl mb-1">{title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>

      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-12 flex flex-col items-center text-center">
          <Sparkles className="h-10 w-10 text-primary mb-3" />
          <p className="font-medium mb-1">{phase}</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Den här sektionen byggs i nästa fas av Slay Station-omstöpningen. Strukturen är på plats —
            innehållet kopplas på snart.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}