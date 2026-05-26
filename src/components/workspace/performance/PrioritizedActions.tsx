// 4 prioriterade åtgärder från action_items.
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ArrowRight, ListTodo } from "lucide-react";
import type { PriorityAction } from "@/hooks/usePerformanceData";

const PRIORITY_TONE: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600",
  low: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const CATEGORY_LABEL: Record<string, string> = {
  seo: "SEO",
  technical: "Teknisk SEO",
  ads: "Google Ads",
  content: "Innehåll",
  conversion: "CRO",
};

interface Props {
  projectId: string;
  actions: PriorityAction[];
}

export function PrioritizedActions({ projectId, actions }: Props) {
  if (actions.length === 0) {
    return (
      <Card className="border-border/60 border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Inga öppna prioriterade åtgärder. Kör en diagnos eller analysera kontot för att generera
          nya rekommendationer.
        </CardContent>
      </Card>
    );
  }

  const top = actions.slice(0, 4);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-medium tracking-tight">Prioriterade åtgärder</h2>
          <span className="text-xs text-muted-foreground">({actions.length} totalt)</span>
        </div>
        <Link
          to={`/clients/${projectId}/actions`}
          className="text-xs text-primary underline-offset-4 hover:underline flex items-center gap-1"
        >
          Visa alla <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {top.map((a) => (
          <Link
            key={a.id}
            to={`/clients/${projectId}/actions?focus=${a.id}`}
            className="group"
          >
            <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                    {a.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${PRIORITY_TONE[a.priority] ?? PRIORITY_TONE.medium}`}
                  >
                    {a.priority}
                  </Badge>
                </div>
                {a.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                  <span>{CATEGORY_LABEL[a.category] ?? a.category}</span>
                  {a.expected_impact_sek != null && a.expected_impact_sek > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-primary tabular-nums">
                        +{Math.round(a.expected_impact_sek).toLocaleString("sv-SE")} kr/år
                      </span>
                    </>
                  )}
                  {a.source_type && (
                    <>
                      <span>·</span>
                      <span>{a.source_type}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
